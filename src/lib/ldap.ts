import { Client, InvalidCredentialsError } from 'ldapts';

import type { Entry, SearchOptions } from 'ldapts';

import { CU_ID_PATTERN } from '@/utils/cu-id';


/**
 * LDAP の既定の基点（CluVela と同じ `dc=cut,dc=gr,dc=jp`）。
 */
const DEFAULT_BASE_DN = 'dc=cut,dc=gr,dc=jp';

/**
 * 学生 ID を含む `schacPersonalUniqueCode` の接頭辞（`urn:schac:personalUniqueCode:jp:studentId:<組織>:<学生 ID>`）。
 */
const STUDENT_ID_PREFIX = 'urn:schac:personalUniqueCode:jp:studentId:';

/**
 * ログインを拒否する在籍状況（退会・除名）。CluVela と同じ判定にする。
 */
const DISABLED_MEMBERSHIP_STATUSES: ReadonlySet<string> = new Set(['former', 'expelled']);

/**
 * LDAP の接続・検索のタイムアウト（ms）。
 */
const TIMEOUT = { timeout: 10_000, connectTimeout: 5000 };


/**
 * LDAP の接続設定。
 */
type LdapConfig = {
  url: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
};


/**
 * LDAP の会員（`ou=people` のエントリ）。
 */
export type LdapMember = {
  /** エントリの DN */
  dn: string;
  /** 学籍番号（CU_ID。大文字） */
  cuId: string;
  /** 氏名（日本語。日本語がなければ英語などの `cn`） */
  name: string;
  /** メールアドレス（登録されている順） */
  emails: string[];
  /** 在籍状況（`cutMembershipStatus`。例: `active`） */
  membershipStatus: string;
};


/**
 * 環境変数から LDAP の接続設定を読み取る。
 *
 * - `LDAP_URL`（必須）: 接続先（例: `ldaps://ldap.example.jp:636`、開発環境では `ldap://ldap:3389`）
 * - `LDAP_BASE`: 基点（省略した場合は `dc=cut,dc=gr,dc=jp`）
 * - `LDAP_USERNAME`（必須）・`LDAP_PASSWORD`: 検索に使うサービスアカウントの DN とパスワード（会員の情報を読める権限が必要）
 *
 * @returns 接続設定。必須の環境変数が設定されていない場合は `null`
 */
function getLdapConfig(): LdapConfig | null {
  const url = process.env.LDAP_URL?.trim();
  const bindDn = process.env.LDAP_USERNAME?.trim();
  if (!url || !bindDn) {
    return null;
  }
  return {
    url,
    baseDn: process.env.LDAP_BASE?.trim() || DEFAULT_BASE_DN,
    bindDn,
    bindPassword: process.env.LDAP_PASSWORD ?? '',
  };
}


/**
 * LDAP の接続設定を取得する。設定されていない場合は例外を投げる。
 *
 * @returns 接続設定
 * @throws `LDAP_URL` または `LDAP_USERNAME` が設定されていない場合
 */
function requireLdapConfig(): LdapConfig {
  const config = getLdapConfig();
  if (!config) {
    throw new Error('LDAP is not configured. Set LDAP_URL and LDAP_USERNAME.');
  }
  return config;
}


/**
 * LDAP が設定されているかどうかを判定する。
 *
 * @returns 設定されている場合は `true`
 */
export function isLdapConfigured(): boolean {
  return getLdapConfig() !== null;
}


/**
 * LDAP の検索フィルターに埋め込む値をエスケープする（RFC 4515）。
 *
 * @param value - 埋め込む値
 * @returns エスケープした値
 */
export function escapeFilterValue(value: string): string {
  return value
    .replaceAll('\\', String.raw`\5c`)
    .replaceAll('*', String.raw`\2a`)
    .replaceAll('(', String.raw`\28`)
    .replaceAll(')', String.raw`\29`)
    .replaceAll('\0', String.raw`\00`);
}


/**
 * LDAP の属性の値を文字列として取り出す（複数の値がある場合は先頭の値）。
 *
 * @param value - 属性の値
 * @returns 文字列（値がない場合は空文字列）
 */
function firstString(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') {
    return first;
  }
  return Buffer.isBuffer(first) ? first.toString('utf8') : '';
}


/**
 * LDAP の属性の値をすべて文字列の配列として取り出す。
 *
 * @param value - 属性の値
 * @returns 文字列の配列
 */
function allStrings(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => {
      if (Buffer.isBuffer(item)) {
        return item.toString('utf8');
      }
      return typeof item === 'string' ? item : '';
    })
    .filter((item) => item !== '');
}


/**
 * LDAP に接続する（接続の確立は `bind` で行う）。
 *
 * @param url - 接続先
 * @returns 接続していないクライアント
 */
function createClient(url: string): Client {
  return new Client({ url, ...TIMEOUT });
}


/**
 * サービスアカウントで LDAP に接続して処理を行い、接続を閉じる。
 *
 * @param run - 接続を使う処理。基点の DN を引数に受け取る
 * @returns 処理の結果
 * @throws LDAP が設定されていない場合、または接続・認証に失敗した場合
 */
async function withServiceAccount<T>(run: (client: Client, baseDn: string) => Promise<T>): Promise<T> {
  const config = requireLdapConfig();
  const client = createClient(config.url);
  try {
    await client.bind(config.bindDn, config.bindPassword);
    return await run(client, config.baseDn);
  } finally {
    await client.unbind().catch(() => {});
  }
}


/**
 * 学籍番号から会員を探す（サービスアカウントで検索する。パスワードは確かめない）。
 *
 * @param cuId - 学籍番号（CU_ID）
 * @returns 会員。見つからない場合は `null`
 * @throws 同じ学籍番号の会員が複数見つかった場合、または LDAP に接続できない場合
 */
export async function findMemberByCuId(cuId: string): Promise<LdapMember | null> {
  return await withServiceAccount(async (client, baseDn) => {
    // LDAP の学生 ID は小文字で登録されているが、caseIgnore の照合のため大小文字は区別されない
    const filter = '(&(objectClass=inetOrgPerson)'
      + `(schacPersonalUniqueCode=${STUDENT_ID_PREFIX}*:${escapeFilterValue(cuId)}))`;
    const { searchEntries } = await client.search(`ou=people,${baseDn}`, {
      scope: 'sub',
      filter,
      attributes: ['cn', 'cn;lang-ja', 'mail', 'schacPersonalUniqueCode', 'cutMembershipStatus'],
    });
    if (searchEntries.length === 0) {
      return null;
    }
    if (searchEntries.length > 1) {
      throw new Error(`LDAP has ${searchEntries.length} members with the same student ID.`);
    }
    const [entry] = searchEntries;
    return {
      dn: entry.dn,
      cuId,
      name: firstString(entry['cn;lang-ja']) || firstString(entry.cn) || cuId,
      emails: allStrings(entry.mail),
      membershipStatus: firstString(entry.cutMembershipStatus),
    };
  });
}


/**
 * 会員がログインできない在籍状況（退会・除名）かどうかを判定する。
 *
 * @param member - 会員
 * @returns ログインできない場合は `true`
 */
export function isLoginDisabled(member: LdapMember): boolean {
  return isDisabledMembershipStatus(member.membershipStatus);
}


/**
 * 在籍状況が退会・除名（ログインできず、役職にも就けない）かどうかを判定する。
 *
 * @param status - 在籍状況（`cutMembershipStatus`）
 * @returns 退会・除名の場合は `true`
 */
export function isDisabledMembershipStatus(status: string): boolean {
  return DISABLED_MEMBERSHIP_STATUSES.has(status);
}


/**
 * 学籍番号とパスワードで会員を認証する。
 *
 * 会員のエントリに対してパスワードでバインドできるかを確かめる（サービスアカウントのパスワードは使わない）。
 * 退会・除名の会員は、パスワードが正しくても認証しない。
 *
 * @param cuId - 学籍番号（CU_ID。正規化済み）
 * @param password - パスワード
 * @returns 認証された会員。認証できない場合は `null`
 * @throws LDAP に接続できない場合など、認証を判定できない場合
 */
export async function authenticateMember(cuId: string, password: string): Promise<LdapMember | null> {
  if (!CU_ID_PATTERN.test(cuId) || password === '') {
    return null;
  }
  const member = await findMemberByCuId(cuId);
  if (!member || isLoginDisabled(member)) {
    return null;
  }
  const client = createClient(requireLdapConfig().url);
  try {
    await client.bind(member.dn, password);
    return member;
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return null;
    }
    throw e;
  } finally {
    await client.unbind().catch(() => {});
  }
}


/**
 * LDAP の基点の DN を返す（`LDAP_BASE`、省略時は `dc=cut,dc=gr,dc=jp`）。
 *
 * @returns 基点の DN
 * @throws LDAP が設定されていない場合
 */
export function getLdapBaseDn(): string {
  return requireLdapConfig().baseDn;
}


/**
 * サービスアカウントで LDAP を検索する。
 *
 * @param base - 基点の DN（基点の DN からの相対 DN。空の場合は基点そのもの）
 * @param options - 検索のオプション
 * @returns 見つかったエントリ
 * @throws LDAP に接続できない場合など
 */
export async function searchDirectory(
  base: string,
  options: SearchOptions & { attributes: string[] },
): Promise<Entry[]> {
  return await withServiceAccount(async (client, baseDn) => {
    const { searchEntries } = await client.search(base ? `${base},${baseDn}` : baseDn, options);
    return searchEntries;
  });
}


/**
 * LDAP の属性の値（文字列・バイナリ・配列）を文字列の配列にする。
 *
 * @param value - 属性の値
 * @returns 文字列の配列
 */
export function toStrings(value: unknown): string[] {
  return allStrings(value);
}


/**
 * LDAP の属性の値（文字列・バイナリ・配列）の先頭を文字列にする。
 *
 * @param value - 属性の値
 * @returns 文字列（値がない場合は空文字列）
 */
export function toFirstString(value: unknown): string {
  return firstString(value);
}


/**
 * `schacPersonalUniqueCode` の値の一覧から学生 ID（大文字）を取り出す。見つからない場合は空文字列。
 *
 * @param codes - `schacPersonalUniqueCode` の値
 * @returns 学生 ID（学籍番号）
 */
export function findStudentIdFromCodes(codes: readonly string[]): string {
  for (const code of codes) {
    if (code.toLowerCase().startsWith(STUDENT_ID_PREFIX.toLowerCase())) {
      const id = code.slice(code.lastIndexOf(':') + 1);
      if (id) {
        return id.toUpperCase();
      }
    }
  }
  return '';
}
