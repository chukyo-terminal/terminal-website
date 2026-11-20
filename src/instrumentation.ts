import { PHASE_PRODUCTION_BUILD } from 'next/constants';


/**
 * サーバーの起動時に1回実行する処理。
 *
 * 問い合わせ者からの返信メールの自動確認を開始する（受信メールの設定がされている場合のみ）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return;
  }
  const { startContactMailPolling } = await import('@/utils/contact-mail-sync');
  startContactMailPolling();
}
