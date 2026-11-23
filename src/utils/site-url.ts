/**
 * サイトの URL を返す。
 *
 * リクエストの Host ヘッダーから組み立てると、偽装されたヘッダーで他のサイトへのリンクを送らされるおそれがあるため、
 * 環境変数で設定したものを使用する。
 *
 * @returns サイトの URL。設定されていない場合や、形式が正しくない場合は `null`
 */
export function getSiteUrl(): URL | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() ?? '');
  } catch {
    return null;
  }
}
