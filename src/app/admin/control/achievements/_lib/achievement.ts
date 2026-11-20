import { z } from 'zod';

import { normalizeForSearch } from '../../posts/[postId]/_lib/tags';

import type { PostStatus } from '../../posts/_lib/post-status';


/**
 * 実績のタイトルの最大文字数。
 */
export const ACHIEVEMENT_TITLE_MAX_LENGTH = 100;


/**
 * 管理画面で扱う実績。
 */
export type Achievement = {
  id: number;
  title: string;
  description: string | null;
  /** 関連記事の投稿ID（設定していない場合は `null`） */
  postId: number | null;
  /** 設定日（YYYY-MM-DD） */
  date: string;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 関連記事として選択できる記事。
 */
export type RelatedPostOption = {
  id: number;
  /** 最新の版のタイトル */
  title: string;
  /** 最新の版の概要 */
  description: string | null;
  slug: string;
  status: PostStatus;
  isPrivate: boolean;
  /** 初めて公開された日時（未公開の場合は `null`） */
  firstPublishedAt: Date | null;
  /** 公開ページのパス（サイトに表示されていない場合は `null`）。`null` の記事は、活動実績のページにも表示されない */
  publicPath: string | null;
};


/**
 * 実績の追加・編集フォームの入力値のスキーマ定義。
 *
 * 関連記事を設定しない場合は、説明が必須（データベースの制約と同じ条件）。
 */
export const AchievementFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'タイトルを入力してください。')
      .max(ACHIEVEMENT_TITLE_MAX_LENGTH, `タイトルは${ACHIEVEMENT_TITLE_MAX_LENGTH}文字以内で入力してください。`),
    description: z
      .string()
      .nullable()
      .transform((value) => value?.trim() || null),
    /** YYYY-MM-DD */
    date: z.iso.date('日付を入力してください。'),
    postId: z.number().int().positive('関連記事が正しくありません。').nullable(),
  })
  .refine((values) => values.postId !== null || values.description !== null, {
    message: '関連記事を設定しない場合は、説明を入力してください。',
    path: ['description'],
  });


/**
 * 実績の追加・編集フォームの入力値。
 */
export type AchievementFormValues = z.input<typeof AchievementFormSchema>;


/**
 * 日付（YYYY-MM-DD）を表示用にフォーマットする。
 *
 * @param date - 日付（YYYY-MM-DD）
 * @returns フォーマット済みの日付（例: `2026/11/17`）
 */
export function formatAchievementDate(date: string): string {
  return date.replaceAll('-', '/');
}


/**
 * 日付（YYYY-MM-DD）が属する年度を返す（4月1日から翌年3月31日まで）。
 *
 * @param date - 日付（YYYY-MM-DD）
 * @returns 年度
 */
export function getAchievementFiscalYear(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return month < 4 ? year - 1 : year;
}


/**
 * 関連記事の有無による絞り込み。
 */
export const LINK_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'linked', label: '関連記事あり' },
  { value: 'unlinked', label: '関連記事なし' },
  { value: 'hidden-post', label: '関連記事が非表示' },
] as const;

export type LinkFilter = typeof LINK_FILTERS[number]['value'];


/**
 * 並び順。
 */
export const ACHIEVEMENT_SORT_ORDERS = [
  { value: 'date-desc', label: '日付が新しい順' },
  { value: 'date-asc', label: '日付が古い順' },
  { value: 'updated-desc', label: '更新日が新しい順' },
] as const;

export type AchievementSortOrder = typeof ACHIEVEMENT_SORT_ORDERS[number]['value'];


/**
 * 実績一覧の表示条件。
 */
export type AchievementListFilters = {
  /** キーワード（タイトル・説明・関連記事のタイトルの部分一致） */
  query: string;
  link: LinkFilter;
  /** 年度（すべての年度の場合は `null`） */
  fiscalYear: number | null;
  sort: AchievementSortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_ACHIEVEMENT_FILTERS: AchievementListFilters = {
  query: '',
  link: 'all',
  fiscalYear: null,
  sort: 'date-desc',
};


/**
 * 投稿IDから関連記事を引くための表。
 */
export type RelatedPostMap = ReadonlyMap<number, RelatedPostOption>;


/**
 * 実績がキーワードに一致するかどうかを判定する。
 *
 * @param achievement - 実績
 * @param post - 関連記事
 * @param query - キーワード（正規化済み）
 * @returns 一致する場合は `true`
 */
function matchesQuery(achievement: Achievement, post: RelatedPostOption | undefined, query: string): boolean {
  return query === ''
    || normalizeForSearch(achievement.title).includes(query)
    || normalizeForSearch(achievement.description ?? '').includes(query)
    || (post !== undefined && normalizeForSearch(post.title).includes(query));
}


/**
 * 実績が関連記事の条件に一致するかどうかを判定する。
 *
 * @param achievement - 実績
 * @param post - 関連記事
 * @param link - 関連記事の条件
 * @returns 一致する場合は `true`
 */
function matchesLink(achievement: Achievement, post: RelatedPostOption | undefined, link: LinkFilter): boolean {
  switch (link) {
    case 'all': {
      return true;
    }
    case 'linked': {
      return achievement.postId !== null;
    }
    case 'unlinked': {
      return achievement.postId === null;
    }
    case 'hidden-post': {
      return achievement.postId !== null && !post?.publicPath;
    }
  }
}


/**
 * 並び順に従って2つの実績を比較する。
 *
 * @param a - 比較する実績
 * @param b - 比較する実績
 * @param sort - 並び順
 * @returns 比較結果
 */
function compareAchievements(a: Achievement, b: Achievement, sort: AchievementSortOrder): number {
  switch (sort) {
    case 'date-desc': {
      return b.date.localeCompare(a.date) || b.id - a.id;
    }
    case 'date-asc': {
      return a.date.localeCompare(b.date) || a.id - b.id;
    }
    case 'updated-desc': {
      return b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id;
    }
  }
}


/**
 * 表示条件に従って実績を絞り込み、並べ替える。
 *
 * @param achievements - 実績
 * @param posts - 関連記事の表
 * @param filters - 表示条件
 * @returns 絞り込み・並べ替えた実績
 */
export function filterAndSortAchievements(
  achievements: readonly Achievement[],
  posts: RelatedPostMap,
  filters: AchievementListFilters,
): Achievement[] {
  const query = normalizeForSearch(filters.query);
  return achievements
    .filter((achievement) => {
      const post = achievement.postId === null ? undefined : posts.get(achievement.postId);
      return matchesQuery(achievement, post, query)
        && matchesLink(achievement, post, filters.link)
        && (filters.fiscalYear === null || getAchievementFiscalYear(achievement.date) === filters.fiscalYear);
    })
    .toSorted((a, b) => compareAchievements(a, b, filters.sort));
}


/**
 * 関連記事の条件ごとに、一致する実績の数を数える（関連記事以外の条件は適用する）。
 *
 * @param achievements - 実績
 * @param posts - 関連記事の表
 * @param filters - 表示条件
 * @returns 関連記事の条件ごとの実績の数
 */
export function countByLink(
  achievements: readonly Achievement[],
  posts: RelatedPostMap,
  filters: AchievementListFilters,
): Record<LinkFilter, number> {
  const counts: Record<LinkFilter, number> = { 'all': 0, 'linked': 0, 'unlinked': 0, 'hidden-post': 0 };
  for (const { value } of LINK_FILTERS) {
    counts[value] = filterAndSortAchievements(achievements, posts, { ...filters, link: value }).length;
  }
  return counts;
}


/**
 * 実績が登録されている年度を、新しい順に列挙する。
 *
 * @param achievements - 実績
 * @returns 年度
 */
export function listFiscalYears(achievements: readonly Achievement[]): number[] {
  return [...new Set(achievements.map((achievement) => getAchievementFiscalYear(achievement.date)))]
    .toSorted((a, b) => b - a);
}


/**
 * 関連記事の候補を、キーワードで絞り込む。
 *
 * @param posts - 関連記事の候補
 * @param query - キーワード（タイトル・スラッグの部分一致）
 * @returns 一致した記事（公開中の記事を先に、新しい順に並べる）
 */
export function searchRelatedPosts(posts: readonly RelatedPostOption[], query: string): RelatedPostOption[] {
  const normalizedQuery = normalizeForSearch(query);
  return posts
    .filter((post) => normalizedQuery === ''
      || normalizeForSearch(post.title).includes(normalizedQuery)
      || post.slug.includes(normalizedQuery))
    .toSorted((a, b) => Number(b.publicPath !== null) - Number(a.publicPath !== null) || b.id - a.id);
}
