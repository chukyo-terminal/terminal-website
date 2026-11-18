import { cookies } from 'next/headers';


/**
 * 訪問者IDを保存する Cookie の名前。
 */
const VISITOR_COOKIE_NAME = 'visitor_id';


/**
 * 訪問者IDを保存する期間（秒）。
 */
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;


/**
 * UUID の形式。
 */
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;


/**
 * Cookie に保存された訪問者IDを取得する。
 *
 * 訪問者IDは、ログインしていない訪問者を識別するためのランダムな値で、記事の評価の重複防止などに使用する。
 *
 * @returns 訪問者ID。保存されていない場合や形式が正しくない場合は `null`
 */
export async function getVisitorId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(VISITOR_COOKIE_NAME)?.value.toLowerCase();
  return value && UUID_PATTERN.test(value) ? value : null;
}


/**
 * 訪問者IDを取得する。保存されていない場合は新しく発行し、Cookie に保存する。
 *
 * Cookie を変更するため、Server Action または Route Handler からのみ呼び出すこと。
 *
 * @returns 訪問者ID
 */
export async function getOrCreateVisitorId(): Promise<string> {
  const visitorId = await getVisitorId() ?? crypto.randomUUID();
  const cookieStore = await cookies();
  // 有効期限を延長するため、既に保存されている場合も保存し直す
  cookieStore.set(VISITOR_COOKIE_NAME, visitorId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return visitorId;
}
