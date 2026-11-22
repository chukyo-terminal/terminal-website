import { cookies, headers } from 'next/headers';

import { and, eq } from 'drizzle-orm';
import { getToken } from 'next-auth/jwt';

import { sudoersTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';

import type { JWT } from 'next-auth/jwt';


/**
 * 現在のリクエストの NextAuth のトークンを取得する。
 *
 * @returns トークン。ログインしていない場合は `null`
 */
async function getRequestToken(): Promise<JWT | null> {
  const request = { cookies: await cookies(), headers: Object.fromEntries(await headers()) };
  return await getToken({
    req: request as unknown as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });
}


/**
 * Server Actionなどのサーバー側の処理から、現在のリクエストの認可状態を検証する。
 *
 * Server Actionは、ページとは別に直接呼び出すことができるため、Proxyによるページのアクセス制限に頼らず、処理ごとにこの関数で検証すること。
 * 利用者が無効にされた場合（`isActive` が `false`）は、トークンが残っていても拒否する。
 *
 * @param mode - 必要な権限。`'root'` の場合は上級管理者モードでのログインを必要とする
 * @returns 権限がない場合は利用者に表示するメッセージ、権限がある場合は `null`
 */
export async function checkPermission(mode: 'user' | 'root'): Promise<string | null> {
  const token = await getRequestToken();
  if (!token?.cuId || (await getCurrentUserId()) === null) {
    return 'ログインしてください。';
  }
  if (mode === 'root' && (token.mode !== 'root' || !(await isSudoer(token.cuId)))) {
    return 'この操作を行う権限がありません。';
  }
  return null;
}


/**
 * 学籍番号の利用者が上級管理者かどうかを判定する（トークンの値は古い可能性があるため、都度確認する）。
 *
 * @param cuId - 学籍番号（CU_ID）
 * @returns 上級管理者の場合は `true`
 */
async function isSudoer(cuId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sudoersTable.id })
    .from(sudoersTable)
    .innerJoin(usersTable, eq(sudoersTable.id, usersTable.id))
    .where(eq(usersTable.cuId, cuId))
    .limit(1);
  return rows.length > 0;
}


/**
 * 現在ログインしているユーザーのIDを取得する。
 *
 * 権限の検証は行わないため、先に `checkPermission` で検証すること。
 *
 * @returns ユーザーID。ログインしていない場合や、有効なユーザーが見つからない場合は `null`
 */
export async function getCurrentUserId(): Promise<number | null> {
  const token = await getRequestToken();
  const cuId = token?.cuId;
  if (!cuId) {
    return null;
  }
  const user = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.cuId, cuId), eq(usersTable.isActive, true)))
    .limit(1)
    .then((result) => result.at(0));
  return user?.id ?? null;
}
