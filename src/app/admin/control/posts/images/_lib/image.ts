import type { ManagedImage } from '@/utils/images';

export type { ManagedImage } from '@/utils/images';


/**
 * 画像の使用状況。
 *
 * - `current`: 記事の最新の版で使用している
 * - `history`: 記事の過去の版でのみ使用している（公開ページの編集履歴に表示される場合がある）
 * - `unused`: どの記事でも使用していない
 */
export type ImageUsageStatus = 'current' | 'history' | 'unused';


/**
 * 画像の使用状況を判定する。
 *
 * @param image - 画像
 * @returns 使用状況
 */
export function getImageUsageStatus(image: Pick<ManagedImage, 'usages'>): ImageUsageStatus {
  if (image.usages.some((usage) => usage.isInLatestVersion)) {
    return 'current';
  }
  return image.usages.length > 0 ? 'history' : 'unused';
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
export const IMAGE_SORT_ORDERS = [
  { value: 'created-desc', label: '新しい順' },
  { value: 'created-asc', label: '古い順' },
  { value: 'size-desc', label: 'サイズが大きい順' },
  { value: 'name', label: 'ファイル名順' },
] as const;

export type ImageSortOrder = typeof IMAGE_SORT_ORDERS[number]['value'];


/**
 * 画像一覧の表示条件。
 */
export type ImageListFilters = {
  /** キーワード（ファイル名・使用している記事のタイトルの部分一致） */
  query: string;
  usage: UsageFilter;
  sort: ImageSortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_IMAGE_FILTERS: ImageListFilters = {
  query: '',
  usage: 'all',
  sort: 'created-desc',
};


/**
 * 検索のために文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 文字列
 * @returns 正規化した文字列
 */
const normalizeForSearch = (value: string): string => value.normalize('NFKC').toLowerCase().trim();


/**
 * 画像がキーワードに一致するかどうかを判定する。
 *
 * @param image - 画像
 * @param query - キーワード
 * @returns 一致する場合は `true`
 */
function matchesQuery(image: ManagedImage, query: string): boolean {
  const normalizedQuery = normalizeForSearch(query);
  return normalizedQuery === ''
    || normalizeForSearch(image.fileName).includes(normalizedQuery)
    || image.usages.some((usage) => normalizeForSearch(usage.title).includes(normalizedQuery));
}


/**
 * 画像が使用状況の条件に一致するかどうかを判定する。
 *
 * @param image - 画像
 * @param usage - 使用状況の条件
 * @returns 一致する場合は `true`
 */
function matchesUsage(image: ManagedImage, usage: UsageFilter): boolean {
  switch (usage) {
    case 'all': {
      return true;
    }
    case 'used': {
      return image.usages.length > 0;
    }
    case 'unused': {
      return image.usages.length === 0;
    }
  }
}


/**
 * 並び順に従って2つの画像を比較する。
 *
 * @param a - 比較する画像
 * @param b - 比較する画像
 * @param sort - 並び順
 * @returns 比較結果
 */
function compareImages(a: ManagedImage, b: ManagedImage, sort: ImageSortOrder): number {
  const byNewest = b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
  switch (sort) {
    case 'created-desc': {
      return byNewest;
    }
    case 'created-asc': {
      return -byNewest;
    }
    case 'size-desc': {
      return b.size - a.size || byNewest;
    }
    case 'name': {
      return a.fileName.localeCompare(b.fileName, 'ja', { numeric: true }) || byNewest;
    }
  }
}


/**
 * 表示条件に従って画像を絞り込み、並べ替える。
 *
 * @param images - 画像
 * @param filters - 表示条件
 * @returns 絞り込み・並べ替えた画像
 */
export function filterAndSortImages(images: readonly ManagedImage[], filters: ImageListFilters): ManagedImage[] {
  return images
    .filter((image) => matchesQuery(image, filters.query) && matchesUsage(image, filters.usage))
    .toSorted((a, b) => compareImages(a, b, filters.sort));
}


/**
 * 使用状況の条件ごとに、一致する画像の数を数える（キーワードの条件は適用する）。
 *
 * @param images - 画像
 * @param query - キーワード
 * @returns 使用状況の条件ごとの画像の数
 */
export function countByUsage(images: readonly ManagedImage[], query: string): Record<UsageFilter, number> {
  const counts: Record<UsageFilter, number> = { all: 0, used: 0, unused: 0 };
  for (const image of images) {
    if (!matchesQuery(image, query)) {
      continue;
    }
    for (const { value } of USAGE_FILTERS) {
      if (matchesUsage(image, value)) {
        counts[value]++;
      }
    }
  }
  return counts;
}


/**
 * 形式の表示名を返す。
 *
 * @param mimeType - MIME タイプ
 * @returns 表示名（例: `JPEG`）
 */
export const formatImageType = (mimeType: string): string => mimeType.replace(/^image\//, '').toUpperCase();
