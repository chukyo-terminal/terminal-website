export type RootLayoutProps = Readonly<{ children: React.ReactNode }>;


/**
 * Server Actionの実行結果。
 *
 * 失敗した場合は、利用者に表示するメッセージを `error` に格納する。
 */
export type ActionResult<T = void> =
  | ([T] extends [void] ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };
