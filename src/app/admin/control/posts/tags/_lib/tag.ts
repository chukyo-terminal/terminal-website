import { z } from 'zod';

import { SLUG_PATTERN, TAG_NAME_MAX_LENGTH } from '../../[postId]/_lib/post-form';
import { cleanTagName, normalizeForSearch } from '../../[postId]/_lib/tags';
import { trimUnprintableCharacters } from '@/utils/string';


/**
 * 管理画面で扱うタグ。
 */
export type ManagedTag = {
  id: number;
  name: string;
  slug: string;
  /** このタグが設定されている記事の数 */
  postCount: number;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * タグの作成・編集フォームの入力値のスキーマ定義。
 */
export const TagFormSchema = z.object({
  name: z
    .string()
    .transform((value) => cleanTagName(trimUnprintableCharacters(value) ?? ''))
    .pipe(z
      .string()
      .min(1, 'タグ名を入力してください。')
      .max(TAG_NAME_MAX_LENGTH, `タグ名は${TAG_NAME_MAX_LENGTH}文字以内で入力してください。`)),
  slug: z
    .string()
    .trim()
    .regex(SLUG_PATTERN, 'スラッグは半角英小文字・数字・ハイフンで入力してください（先頭と末尾のハイフンは不可）。'),
});


/**
 * タグの作成・編集フォームの入力値。
 */
export type TagFormValues = z.input<typeof TagFormSchema>;


/**
 * 名前またはスラッグが重複するタグを探し、エラーメッセージを返す。
 *
 * 名前は、全角・半角や大文字・小文字の違いを無視して比較する（記事の編集画面でのタグの作成と同じ条件）。
 *
 * @param tags - 既存のタグ
 * @param values - 検証するタグの名前とスラッグ（整形済みのもの）
 * @param excludeId - 比較から除くタグのID（編集中のタグ自身）
 * @returns エラーメッセージ。重複がない場合は `null`
 */
export function findTagConflict(
  tags: readonly Pick<ManagedTag, 'id' | 'name' | 'slug'>[],
  values: { name: string; slug: string },
  excludeId?: number,
): string | null {
  const others = tags.filter((tag) => tag.id !== excludeId);
  const normalizedName = normalizeForSearch(values.name);
  const sameName = others.find((tag) => normalizeForSearch(tag.name) === normalizedName);
  if (sameName) {
    return `「${sameName.name}」というタグは既に存在します。`;
  }
  const sameSlug = others.find((tag) => tag.slug === values.slug);
  if (sameSlug) {
    return `スラッグ「${values.slug}」はタグ「${sameSlug.name}」で使われています。`;
  }
  return null;
}


/**
 * 使用状況による絞り込み。
 */
export const USAGE_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'used', label: '使用中' },
  { value: 'unused', label: '未使用' },
] as const;

export type UsageFilter = typeof USAGE_FILTERS[number]['value'];


/**
 * 並び順。
 */
export const TAG_SORT_ORDERS = [
  { value: 'name', label: '名前順' },
  { value: 'posts-desc', label: '記事数が多い順' },
  { value: 'created-desc', label: '作成日が新しい順' },
  { value: 'updated-desc', label: '更新日が新しい順' },
] as const;

export type TagSortOrder = typeof TAG_SORT_ORDERS[number]['value'];


/**
 * タグ一覧の表示条件。
 */
export type TagListFilters = {
  /** キーワード（タグ名・スラッグの部分一致） */
  query: string;
  usage: UsageFilter;
  sort: TagSortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_TAG_FILTERS: TagListFilters = {
  query: '',
  usage: 'all',
  sort: 'name',
};


/**
 * タグがキーワードに一致するかどうかを判定する。
 *
 * @param tag - タグ
 * @param query - キーワード
 * @returns 一致する場合は `true`
 */
function matchesQuery(tag: ManagedTag, query: string): boolean {
  const normalizedQuery = normalizeForSearch(cleanTagName(query));
  return normalizedQuery === ''
    || normalizeForSearch(tag.name).includes(normalizedQuery)
    || tag.slug.includes(normalizedQuery);
}


/**
 * タグが使用状況の条件に一致するかどうかを判定する。
 *
 * @param tag - タグ
 * @param usage - 使用状況の条件
 * @returns 一致する場合は `true`
 */
function matchesUsage(tag: ManagedTag, usage: UsageFilter): boolean {
  switch (usage) {
    case 'all': {
      return true;
    }
    case 'used': {
      return tag.postCount > 0;
    }
    case 'unused': {
      return tag.postCount === 0;
    }
  }
}


/**
 * 並び順に従って2つのタグを比較する。
 *
 * @param a - 比較するタグ
 * @param b - 比較するタグ
 * @param sort - 並び順
 * @returns 比較結果
 */
function compareTags(a: ManagedTag, b: ManagedTag, sort: TagSortOrder): number {
  const byName = a.name.localeCompare(b.name, 'ja');
  switch (sort) {
    case 'name': {
      return byName;
    }
    case 'posts-desc': {
      return b.postCount - a.postCount || byName;
    }
    case 'created-desc': {
      return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
    }
    case 'updated-desc': {
      return b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id;
    }
  }
}


/**
 * 表示条件に従ってタグを絞り込み、並べ替える。
 *
 * @param tags - タグ
 * @param filters - 表示条件
 * @returns 絞り込み・並べ替えたタグ
 */
export function filterAndSortTags(tags: readonly ManagedTag[], filters: TagListFilters): ManagedTag[] {
  return tags
    .filter((tag) => matchesQuery(tag, filters.query) && matchesUsage(tag, filters.usage))
    .toSorted((a, b) => compareTags(a, b, filters.sort));
}


/**
 * 使用状況の条件ごとに、一致するタグの数を数える（キーワードの条件は適用する）。
 *
 * @param tags - タグ
 * @param query - キーワード
 * @returns 使用状況の条件ごとのタグの数
 */
export function countByUsage(tags: readonly ManagedTag[], query: string): Record<UsageFilter, number> {
  const counts: Record<UsageFilter, number> = { all: 0, used: 0, unused: 0 };
  for (const tag of tags) {
    if (!matchesQuery(tag, query)) {
      continue;
    }
    for (const { value } of USAGE_FILTERS) {
      if (matchesUsage(tag, value)) {
        counts[value]++;
      }
    }
  }
  return counts;
}
