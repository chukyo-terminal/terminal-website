import { DrizzleQueryError, eq } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import { usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { authenticateMember, findMemberByCuId, isLoginDisabled } from '@/lib/ldap';
import { CU_ID_PATTERN, normalizeCuId } from '@/utils/cu-id';

import type { LdapMember } from '@/lib/ldap';


/**
 * `users.email` として使えるメールアドレスの形式（`valid_email` 制約と同じ条件）。
 */
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/**
 * 利用者のメールアドレスとして使わないドメイン（学内のアドレス）。
 */
const EXCLUDED_EMAIL_DOMAIN = '@m.chukyo-u.ac.jp';


/**
 * ログインに成功した利用者。
 */
export type LoginAccount = {
  id: number;
  cuId: string;
  name: string;
};


/**
 * LDAP の会員のメールアドレスから、利用者のメールアドレス（連絡先）を選ぶ。
 *
 * 学内のアドレス（m.chukyo-u.ac.jp）と、`users.email` の形式に合わないアドレスは使わない。
 *
 * @param emails - 会員のメールアドレス（登録されている順）
 * @returns 選んだメールアドレス。使えるものがない場合は `null`
 */
export function pickContactEmail(emails: readonly string[]): string | null {
  return emails.find((email) => (
    email.length <= 254
    && EMAIL_PATTERN.test(email)
    && !email.toLowerCase().endsWith(EXCLUDED_EMAIL_DOMAIN)
  )) ?? null;
}


/**
 * 一意性制約違反のエラーであり、指定した制約に違反したものかを判定する。
 *
 * @param e - エラー
 * @param constraint - 制約の名前
 * @returns 指定した制約に違反した場合は `true`
 */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  return e instanceof DrizzleQueryError
    && e.cause instanceof DatabaseError
    && e.cause.code === PostgresError.UNIQUE_VIOLATION
    && e.cause.constraint === constraint;
}


/**
 * 学籍番号から、利用者として登録できる会員（LDAP に存在し、退会・除名していない）を探す。
 *
 * 利用者の登録（一般管理者の追加）に使う。学籍番号の形式が正しくない場合は、LDAP には問い合わせない。
 *
 * @param cuIdInput - 入力された学籍番号
 * @returns 会員。見つからない場合は `null`
 */
export async function findRegistrableMember(cuIdInput: string): Promise<LdapMember | null> {
  const cuId = normalizeCuId(cuIdInput);
  if (!CU_ID_PATTERN.test(cuId)) {
    return null;
  }
  const member = await findMemberByCuId(cuId);
  return member && !isLoginDisabled(member) ? member : null;
}


/**
 * 利用者の氏名とメールアドレスを、LDAP の会員の情報に合わせる。
 *
 * 氏名と連絡先は LDAP で管理するため、ログインのたびに同期する。メールアドレスが他の利用者と重複する場合は変更しない。
 *
 * @param user - 利用者の現在の情報
 * @param member - LDAP の会員
 */
async function syncUserWithMember(
  user: { id: number; name: string; email: string | null },
  member: LdapMember,
): Promise<void> {
  if (user.name !== member.name) {
    await db.update(usersTable).set({ name: member.name }).where(eq(usersTable.id, user.id));
  }
  const email = pickContactEmail(member.emails);
  if (email !== user.email) {
    try {
      await db.update(usersTable).set({ email }).where(eq(usersTable.id, user.id));
    } catch (e) {
      if (!isUniqueViolation(e, 'users_email_unique')) {
        throw e;
      }
      console.warn('Skipped updating the email of a user because it is used by another user.');
    }
  }
}


/**
 * 学籍番号とパスワードでログインを認証する。
 *
 * パスワードは LDAP で確かめる。さらに、アプリの利用者（`users`）として登録されていて有効な場合だけ許可する。
 * 認証に成功した場合は、利用者の氏名とメールアドレスを LDAP の値に合わせる。
 *
 * @param cuIdInput - 入力された学籍番号
 * @param password - パスワード
 * @returns ログインした利用者。認証できない場合は `null`
 * @throws LDAP に接続できない場合など、認証を判定できない場合
 */
export async function authenticateLogin(cuIdInput: string, password: string): Promise<LoginAccount | null> {
  const cuId = normalizeCuId(cuIdInput);
  const member = await authenticateMember(cuId, password);
  if (!member) {
    return null;
  }
  const user = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.cuId, cuId))
    .limit(1)
    .then((rows) => rows.at(0));
  if (!user?.isActive) {
    return null;
  }
  await syncUserWithMember(user, member);
  return { id: user.id, cuId, name: member.name };
}
