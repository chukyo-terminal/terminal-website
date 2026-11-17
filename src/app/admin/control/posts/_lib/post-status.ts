/**
 * 記事の公開状態。
 *
 * - `draft`: 一度も公開されていない
 * - `published`: 最新の内容が公開されている
 * - `published-with-draft`: 公開済みだが、公開されていない変更（下書き）がある
 */
export type PostStatus = 'draft' | 'published' | 'published-with-draft';


/**
 * 記事の公開状態を判定する。
 *
 * @param latestPublishedAt - 最新の版の公開日時
 * @param firstPublishedAt - 初めて公開された日時
 * @returns 公開状態
 */
export function getPostStatus(latestPublishedAt: Date | null, firstPublishedAt: Date | null): PostStatus {
  if (latestPublishedAt) {
    return 'published';
  }
  return firstPublishedAt ? 'published-with-draft' : 'draft';
}


/**
 * 公開状態の表示名と配色。
 */
export const POST_STATUS_BADGES: Readonly<Record<PostStatus, { label: string; className: string }>> = {
  'draft': { label: '未公開', className: 'border-gray-500 text-gray-300' },
  'published': { label: '公開中', className: 'border-emerald-500/60 text-emerald-300' },
  'published-with-draft': { label: '公開中・未公開の変更あり', className: 'border-amber-500/60 text-amber-300' },
};


/**
 * 非公開設定の表示名と配色。
 */
export const PRIVATE_BADGE = { label: '非公開設定', className: 'border-red-500/60 text-red-300' } as const;
