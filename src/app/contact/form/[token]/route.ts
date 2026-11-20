import { NextResponse } from 'next/server';

import {
  CONTACT_DETAILS_PATH, CONTACT_SESSION_COOKIE_NAME, getContactSessionCookieOptions,
} from '../../_lib/contact-link';
import { CONTACT_SESSION_TTL_HOURS } from '@/utils/contact';
import { getContactSession, isContactSessionToken } from '@/utils/contact-session';

import type { NextRequest } from 'next/server';


/**
 * 入力用 URL（メールで送ったリンク）を開いたときの処理。
 *
 * トークンを Cookie に移し、お問い合わせ内容を入力するページ（トークンを含まない URL）にリダイレクトする。
 * トークンが無効な場合は Cookie を削除し、同じページで無効であることを表示する。
 *
 * メールソフトのリンクの安全確認などで自動的に開かれることがあるため、ここではトークンを使用済みにしない。
 *
 * @param _request - リクエスト
 * @param context - パスのパラメーター
 * @returns リダイレクトのレスポンス
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  // Cookie の有効期限（トークンが無効な場合は `null`）
  let expires: Date | null;
  try {
    const session = await getContactSession(token);
    expires = session?.expiresAt ?? null;
  } catch (e) {
    // Valkey に接続できない場合は、トークンを確認せずに Cookie に移す（入力するページで改めて確認する）
    console.error('Failed to get contact session:', e);
    expires = isContactSessionToken(token) ? new Date(Date.now() + CONTACT_SESSION_TTL_HOURS * 60 * 60 * 1000) : null;
  }

  // リバースプロキシの内側で動作していても正しいホストに戻るよう、相対パスでリダイレクトする
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      'Location': CONTACT_DETAILS_PATH,
      'Cache-Control': 'no-store',
      // リダイレクト先の読み込みなどで、トークンを含む URL が外部に送信されないようにする
      'Referrer-Policy': 'no-referrer',
    },
  });
  if (expires) {
    response.cookies.set(CONTACT_SESSION_COOKIE_NAME, token, getContactSessionCookieOptions(expires));
  } else {
    response.cookies.delete({ name: CONTACT_SESSION_COOKIE_NAME, path: CONTACT_DETAILS_PATH });
  }
  return response;
}
