/**
 * お問い合わせフォームの入力用 URL（メールアドレスの確認後に送る一時的な URL）を管理する。
 *
 * 入力用 URL のトークンと、それに紐づくメールアドレスは Valkey に一時的に保存し、有効期限が過ぎると自動で削除される。
 * Valkey が漏洩しても入力用 URL を復元できないよう、キーにはトークンのハッシュ値を使用する。
 */

import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { CONTACT_SESSION_TTL_HOURS } from '@/utils/contact';
import { getValkey } from '@/lib/valkey';


/**
 * 同じメールアドレスに入力用 URL を再送できるようになるまでの時間（秒）。
 */
export const CONTACT_MAIL_COOLDOWN_SECONDS = 60;


/**
 * 同じメールアドレスに入力用 URL を送信できる回数の上限（`CONTACT_MAIL_LIMIT_WINDOW_SECONDS` ごと）。
 */
const CONTACT_MAIL_LIMIT = 5;


/**
 * 送信回数を数える期間（秒）。
 */
const CONTACT_MAIL_LIMIT_WINDOW_SECONDS = 60 * 60;


/**
 * トークンのバイト数（Base64URL で43文字になる）。
 */
const TOKEN_BYTES = 32;


/**
 * トークンの形式。
 */
const TOKEN_PATTERN = /^[\w-]{43}$/;


/**
 * Valkey に保存する、入力用 URL の情報。
 */
const StoredSessionSchema = z.object({
  email: z.string(),
  /** 有効期限（UNIX 時間（ms）） */
  expiresAt: z.number(),
});


/**
 * 入力用 URL の情報。
 */
export type ContactSession = {
  /** 確認済みのメールアドレス */
  email: string;
  /** 有効期限 */
  expiresAt: Date;
};


/**
 * 文字列の SHA-256 ハッシュ値を返す。
 *
 * @param value - 文字列
 * @returns ハッシュ値（16進数）
 */
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');


/**
 * 入力用 URL の情報を保存するキーを返す。
 *
 * @param token - トークン
 * @returns キー
 */
const toSessionKey = (token: string): string => `contact:session:${sha256(token)}`;


/**
 * トークンの形式が正しいかどうかを判定する。
 *
 * @param token - トークン
 * @returns 形式が正しい場合は `true`
 */
export const isContactSessionToken = (token: unknown): token is string => (
  typeof token === 'string' && TOKEN_PATTERN.test(token)
);


/**
 * Valkey に保存した値を、入力用 URL の情報に変換する。
 *
 * @param value - 保存した値
 * @returns 入力用 URL の情報。値が正しくない場合は `null`
 */
function parseStoredSession(value: string | null): ContactSession | null {
  if (value === null) {
    return null;
  }
  try {
    const parsed = StoredSessionSchema.safeParse(JSON.parse(value));
    return parsed.success ? { email: parsed.data.email, expiresAt: new Date(parsed.data.expiresAt) } : null;
  } catch {
    return null;
  }
}


/**
 * 新しい入力用 URL のトークンを発行し、メールアドレスと紐づけて保存する。
 *
 * @param email - 確認するメールアドレス（正規化済みのもの）
 * @returns トークンと有効期限
 */
export async function createContactSession(email: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = Date.now() + CONTACT_SESSION_TTL_HOURS * 60 * 60 * 1000;
  await getValkey().set(toSessionKey(token), JSON.stringify({ email, expiresAt }), 'PXAT', expiresAt);
  return { token, expiresAt: new Date(expiresAt) };
}


/**
 * 入力用 URL の情報を取得する。
 *
 * @param token - トークン
 * @returns 入力用 URL の情報。トークンが無効な場合や、有効期限が過ぎた場合は `null`
 */
export async function getContactSession(token: unknown): Promise<ContactSession | null> {
  if (!isContactSessionToken(token)) {
    return null;
  }
  return parseStoredSession(await getValkey().get(toSessionKey(token)));
}


/**
 * 入力用 URL を使用済みにする（削除する）。
 *
 * 同時に送信されても1回しか使用できないよう、取得と削除を同時に行う。
 *
 * @param token - トークン
 * @returns 削除した入力用 URL の情報。トークンが無効な場合や、有効期限が過ぎた場合は `null`
 */
export async function consumeContactSession(token: unknown): Promise<ContactSession | null> {
  if (!isContactSessionToken(token)) {
    return null;
  }
  return parseStoredSession(await getValkey().getdel(toSessionKey(token)));
}


/**
 * 使用済みにした入力用 URL を元に戻す（お問い合わせの保存に失敗した場合に、もう一度送信できるようにする）。
 *
 * @param token - トークン
 * @param session - `consumeContactSession` で取得した入力用 URL の情報
 */
export async function restoreContactSession(token: string, session: ContactSession): Promise<void> {
  const expiresAt = session.expiresAt.getTime();
  if (expiresAt <= Date.now()) {
    return;
  }
  await getValkey().set(
    toSessionKey(token),
    JSON.stringify({ email: session.email, expiresAt }),
    'PXAT',
    expiresAt,
    'NX',
  );
}


/**
 * 入力用 URL を削除する（メールの送信に失敗した場合など）。
 *
 * @param token - トークン
 */
export async function deleteContactSession(token: string): Promise<void> {
  await getValkey().del(toSessionKey(token));
}


/**
 * 入力用 URL を送信できるかどうかの判定結果。
 *
 * - `ok`: 送信できる
 * - `cooldown`: 直前に送信したため、しばらく送信できない
 * - `limit`: 送信回数の上限に達したため、しばらく送信できない
 */
export type ContactMailQuotaResult = 'ok' | 'cooldown' | 'limit';


/**
 * 送信回数の制限に使用するキーを返す。
 *
 * @param email - メールアドレス
 * @returns 再送までの待ち時間のキーと、送信回数のキー
 */
function toQuotaKeys(email: string): { cooldown: string; count: string } {
  // 大文字・小文字の違いで制限を回避できないようにする。メールアドレスをそのまま保存しないよう、ハッシュ値を使用する
  const hash = sha256(email.toLowerCase());
  return { cooldown: `contact:mail-cooldown:${hash}`, count: `contact:mail-count:${hash}` };
}


/**
 * 入力用 URL を送信できるかどうかを判定し、送信できる場合は送信回数に数える。
 *
 * 第三者が他人のメールアドレスを入力して大量のメールを送りつけることを防ぐため、
 * 同じメールアドレスへの送信の間隔と、一定時間内の送信回数を制限する。
 *
 * @param email - メールアドレス
 * @returns 判定結果
 */
export async function reserveContactMailQuota(email: string): Promise<ContactMailQuotaResult> {
  const valkey = getValkey();
  const keys = toQuotaKeys(email);
  const reserved = await valkey.set(keys.cooldown, '1', 'EX', CONTACT_MAIL_COOLDOWN_SECONDS, 'NX');
  if (reserved === null) {
    return 'cooldown';
  }
  const result = await valkey
    .multi()
    .incr(keys.count)
    // 最初に送信したときから数え始める（期間内に送信しても延長しない）
    .expire(keys.count, CONTACT_MAIL_LIMIT_WINDOW_SECONDS, 'NX')
    .exec();
  const [error, count] = result?.[0] ?? [new Error('Transaction aborted'), null];
  if (error) {
    throw error;
  }
  return Number(count) > CONTACT_MAIL_LIMIT ? 'limit' : 'ok';
}


/**
 * 再送までの待ち時間を取り消す（メールの送信に失敗した場合に、すぐに再送できるようにする）。
 *
 * 失敗を繰り返して制限を回避できないよう、送信回数は取り消さない。
 *
 * @param email - メールアドレス
 */
export async function releaseContactMailCooldown(email: string): Promise<void> {
  await getValkey().del(toQuotaKeys(email).cooldown);
}
