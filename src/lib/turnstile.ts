import { headers } from 'next/headers';


/**
 * Turnstile のトークンを検証するエンドポイント。
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';


/**
 * トークンの最大文字数。
 */
const TOKEN_MAX_LENGTH = 2048;


/**
 * テスト用のシークレットキー。
 *
 * テスト用のシークレットキーで検証した場合、応答に `action` と `cdata` が含まれないため、これらの検証を省略する。
 *
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
const TEST_SECRET_KEYS: ReadonlySet<string> = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);


/**
 * Siteverify の応答。
 */
type SiteverifyResponse = {
  'success': boolean;
  'error-codes'?: string[];
  'action'?: string;
  'cdata'?: string;
  'hostname'?: string;
};


/**
 * Non-interactive モードの Turnstile ウィジェットで発行されたトークンを検証する。
 *
 * トークンは1回しか検証できないため、同じトークンで2回呼び出すと2回目は失敗する。
 *
 * @param token - ブラウザから送信されたトークン
 * @param expected - トークンを発行したウィジェットに設定したアクション名と `cData`
 * @returns 検証に成功した場合は `true`
 */
export async function verifyNonInteractiveTurnstileToken(
  token: unknown,
  expected: { action: string; cdata: string },
): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_NON_INTERACTIVE_SECRET_KEY;
  if (!secret) {
    console.error('CLOUDFLARE_TURNSTILE_NON_INTERACTIVE_SECRET_KEY is not set.');
    return false;
  }
  if (typeof token !== 'string' || token === '' || token.length > TOKEN_MAX_LENGTH) {
    return false;
  }

  // Cloudflare のプロキシを経由している場合のみ、訪問者のIPアドレスを検証の参考情報として送信する
  const requestHeaders = await headers();
  const remoteIp = requestHeaders.get('cf-connecting-ip');

  let result: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    result = await response.json() as SiteverifyResponse;
  } catch (e) {
    console.error('Turnstile verification request failed:', e);
    return false;
  }

  if (!result.success) {
    console.warn('Turnstile verification failed:', result['error-codes']);
    return false;
  }
  if (TEST_SECRET_KEYS.has(secret)) {
    return true;
  }
  // 別のウィジェットや別の記事のページで発行されたトークンを使い回せないよう、アクション名と `cData` を確認する
  if (result.action !== expected.action || result.cdata !== expected.cdata) {
    console.warn('Turnstile token was issued for a different widget:', { action: result.action, cdata: result.cdata });
    return false;
  }
  return true;
}
