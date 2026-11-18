import { cookies, headers } from 'next/headers';

import { getToken } from 'next-auth/jwt';


/**
 * Server Actionなどのサーバー側の処理から、現在のリクエストの認可状態を検証する。
 *
 * Server Actionは、ページとは別に直接呼び出すことができるため、Proxyによるページのアクセス制限に頼らず、処理ごとにこの関数で検証すること。
 *
 * @param mode - 必要な権限。`'root'` の場合は上級管理者モードでのログインを必要とする
 * @returns 権限がない場合は利用者に表示するメッセージ、権限がある場合は `null`
 */
export async function checkPermission(mode: 'user' | 'root'): Promise<string | null> {
  const request = { cookies: await cookies(), headers: Object.fromEntries(await headers()) };
  const token = await getToken({
    req: request as unknown as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) {
    return 'ログインしてください。';
  }
  if (mode === 'root' && token.mode !== 'root') {
    return 'この操作を行う権限がありません。';
  }
  return null;
}
