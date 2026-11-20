import { needsReply } from '@/utils/post-feedback';

import type { ManagedComment } from '@/utils/post-feedback';


/**
 * スレッドの状態による絞り込み。
 *
 * - `unreplied`: 返信が必要（表示中の最新のコメントが訪問者のもの）
 * - `replied`: 管理者が返信済みで、その後に訪問者のコメントがない
 * - `hidden`: 非表示にしたコメントを含む
 */
export const COMMENT_STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'unreplied', label: '未返信' },
  { value: 'replied', label: '返信済み' },
  { value: 'hidden', label: '非表示あり' },
] as const;

export type CommentStatusFilter = typeof COMMENT_STATUS_FILTERS[number]['value'];


/**
 * コメントの並び順。
 */
export const COMMENT_SORT_ORDERS = [
  { value: 'newest', label: '新しい順' },
  { value: 'oldest', label: '古い順' },
] as const;

export type CommentSortOrder = typeof COMMENT_SORT_ORDERS[number]['value'];


/**
 * コメント一覧の表示条件。
 */
export type CommentListFilters = {
  /** キーワード（空白区切りで AND 検索） */
  query: string;
  status: CommentStatusFilter;
  sort: CommentSortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_COMMENT_FILTERS: CommentListFilters = {
  query: '',
  status: 'all',
  sort: 'newest',
};


/**
 * コメントが状態の条件に一致するかどうかを判定する。
 *
 * @param comment - コメント
 * @param status - 状態の条件
 * @returns 一致する場合は `true`
 */
export function matchesCommentStatus(comment: ManagedComment, status: CommentStatusFilter): boolean {
  switch (status) {
    case 'all': {
      return true;
    }
    case 'unreplied': {
      return needsReply(comment);
    }
    case 'replied': {
      return !needsReply(comment) && comment.replies.some((reply) => reply.author.type === 'staff');
    }
    case 'hidden': {
      return comment.isHidden || comment.replies.some((reply) => reply.isHidden);
    }
  }
}


/**
 * 検索用に文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 正規化する文字列
 * @returns 正規化した文字列
 */
const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();


/**
 * スレッドがキーワードに一致するかどうかを判定する（スレッド内のコメントの名前・メールアドレス・本文を対象とする）。
 *
 * @param comment - コメント
 * @param query - キーワード
 * @returns 一致する場合は `true`
 */
function matchesQuery(comment: ManagedComment, query: string): boolean {
  const keywords = normalize(query).split(/\s+/).filter((keyword) => keyword !== '');
  if (keywords.length === 0) {
    return true;
  }
  const target = normalize([comment, ...comment.replies].flatMap((entry) => [
    entry.author.name ?? '',
    entry.author.type === 'visitor' ? entry.author.email : '',
    entry.content,
  ]).join('\n'));
  return keywords.every((keyword) => target.includes(keyword));
}


/**
 * 表示条件に従ってコメントを絞り込み、並べ替える。
 *
 * @param comments - コメント
 * @param filters - 表示条件
 * @returns 絞り込み・並べ替えたコメント
 */
export function filterAndSortComments(
  comments: readonly ManagedComment[],
  filters: CommentListFilters,
): ManagedComment[] {
  const direction = filters.sort === 'newest' ? -1 : 1;
  return comments
    .filter((comment) => matchesCommentStatus(comment, filters.status) && matchesQuery(comment, filters.query))
    .toSorted((a, b) => direction * (a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id));
}


/**
 * 状態の条件ごとに、一致するコメントの数を数える（キーワードの条件は適用する）。
 *
 * @param comments - コメント
 * @param query - キーワード
 * @returns 状態の条件ごとのコメント数
 */
export function countByCommentStatus(
  comments: readonly ManagedComment[],
  query: string,
): Record<CommentStatusFilter, number> {
  const counts: Record<CommentStatusFilter, number> = { all: 0, unreplied: 0, replied: 0, hidden: 0 };
  for (const comment of comments) {
    if (!matchesQuery(comment, query)) {
      continue;
    }
    for (const { value } of COMMENT_STATUS_FILTERS) {
      if (matchesCommentStatus(comment, value)) {
        counts[value]++;
      }
    }
  }
  return counts;
}


/**
 * 訪問者IDを、同じ訪問者のコメントを見分けるための短い表記にする。
 *
 * @param visitorId - 訪問者ID
 * @returns 短い表記（例: `#1a2b3c`）
 */
export const formatVisitorTag = (visitorId: string): string => `#${visitorId.replaceAll('-', '').slice(0, 6)}`;
