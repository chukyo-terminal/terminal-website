import type { PostStatus } from './post-status';


/**
 * 投稿一覧に表示する投稿。
 */
export type PostListItem = {
  id: number;
  /** 最新の版のタイトル */
  title: string;
  /** 最新の版の説明 */
  description: string | null;
  slug: string;
  isPrivate: boolean;
  status: PostStatus;
  author: { id: number; name: string };
  tags: { name: string; slug: string }[];
  createdAt: Date;
  /** 最新の版の更新日時 */
  updatedAt: Date;
  /** 初めて公開された日時（未公開の場合は `null`） */
  firstPublishedAt: Date | null;
  /** 公開ページのパス（サイトに表示されていない場合は `null`） */
  publicPath: string | null;
};


/**
 * 公開状態による絞り込み。
 */
export const STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'published', label: '公開中' },
  { value: 'draft', label: '未公開' },
  { value: 'has-draft', label: '未公開の変更あり' },
  { value: 'private', label: '非公開設定' },
] as const;

export type StatusFilter = typeof STATUS_FILTERS[number]['value'];


/**
 * 並び順。
 */
export const SORT_ORDERS = [
  { value: 'updated-desc', label: '更新日が新しい順' },
  { value: 'updated-asc', label: '更新日が古い順' },
  { value: 'published-desc', label: '公開日が新しい順' },
  { value: 'created-desc', label: '作成日が新しい順' },
  { value: 'title', label: 'タイトル順' },
] as const;

export type SortOrder = typeof SORT_ORDERS[number]['value'];


/**
 * 投稿一覧の表示条件。
 */
export type PostListFilters = {
  /** キーワード（空白区切りで AND 検索） */
  query: string;
  status: StatusFilter;
  /** 著者のユーザーID（空文字列は指定なし） */
  author: string;
  /** タグのスラッグ（空文字列は指定なし） */
  tag: string;
  sort: SortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_FILTERS: PostListFilters = {
  query: '',
  status: 'all',
  author: '',
  tag: '',
  sort: 'updated-desc',
};


/**
 * URL のクエリパラメータの値を1つの文字列として取り出す。
 *
 * @param value - クエリパラメータの値
 * @returns 文字列（存在しない場合は空文字列）
 */
const firstValue = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';


/**
 * URL のクエリパラメータから表示条件を読み取る。不正な値は既定値として扱う。
 *
 * @param parameters - クエリパラメータ
 * @returns 表示条件
 */
export function parsePostListFilters(parameters: Record<string, string | string[] | undefined>): PostListFilters {
  const status = firstValue(parameters.status);
  const sort = firstValue(parameters.sort);
  return {
    query: firstValue(parameters.q),
    status: STATUS_FILTERS.some((filter) => filter.value === status) ? status as StatusFilter : DEFAULT_FILTERS.status,
    author: /^\d+$/.test(firstValue(parameters.author)) ? firstValue(parameters.author) : '',
    tag: firstValue(parameters.tag),
    sort: SORT_ORDERS.some((order) => order.value === sort) ? sort as SortOrder : DEFAULT_FILTERS.sort,
  };
}


/**
 * 表示条件を URL のクエリパラメータに変換する。既定値の条件は含めない。
 *
 * @param filters - 表示条件
 * @returns クエリパラメータ
 */
export function toSearchParameters(filters: PostListFilters): URLSearchParams {
  const parameters = new URLSearchParams();
  if (filters.query.trim() !== '') {
    parameters.set('q', filters.query);
  }
  if (filters.status !== DEFAULT_FILTERS.status) {
    parameters.set('status', filters.status);
  }
  if (filters.author !== '') {
    parameters.set('author', filters.author);
  }
  if (filters.tag !== '') {
    parameters.set('tag', filters.tag);
  }
  if (filters.sort !== DEFAULT_FILTERS.sort) {
    parameters.set('sort', filters.sort);
  }
  return parameters;
}


/**
 * 既定値以外の絞り込み条件（並び順を除く）が指定されているかどうかを判定する。
 *
 * @param filters - 表示条件
 * @returns 指定されている場合は `true`
 */
export function hasActiveFilters(filters: PostListFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.author !== '' || filters.tag !== '';
}


/**
 * 検索用に文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 正規化する文字列
 * @returns 正規化した文字列
 */
const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();


/**
 * 投稿が公開状態の条件に一致するかどうかを判定する。
 *
 * @param post - 投稿
 * @param status - 公開状態の条件
 * @returns 一致する場合は `true`
 */
export function matchesStatus(post: PostListItem, status: StatusFilter): boolean {
  switch (status) {
    case 'all': {
      return true;
    }
    case 'published': {
      // サイトで閲覧できる記事
      return post.status !== 'draft' && !post.isPrivate;
    }
    case 'draft': {
      return post.status === 'draft';
    }
    case 'has-draft': {
      return post.status === 'published-with-draft';
    }
    case 'private': {
      return post.isPrivate;
    }
  }
}


/**
 * 投稿が公開状態以外の条件（キーワード・著者・タグ）に一致するかどうかを判定する。
 *
 * @param post - 投稿
 * @param filters - 表示条件
 * @returns 一致する場合は `true`
 */
function matchesOtherFilters(post: PostListItem, filters: PostListFilters): boolean {
  if (filters.author !== '' && String(post.author.id) !== filters.author) {
    return false;
  }
  if (filters.tag !== '' && !post.tags.some((tag) => tag.slug === filters.tag)) {
    return false;
  }
  const keywords = normalize(filters.query).split(/\s+/).filter((keyword) => keyword !== '');
  if (keywords.length === 0) {
    return true;
  }
  const target = normalize([
    post.title,
    post.description ?? '',
    post.slug,
    post.author.name,
    ...post.tags.map((tag) => tag.name),
  ].join('\n'));
  return keywords.every((keyword) => target.includes(keyword));
}


/**
 * 並び順に従って2つの投稿を比較する。
 *
 * @param a - 比較する投稿
 * @param b - 比較する投稿
 * @param sort - 並び順
 * @returns 比較結果
 */
function comparePosts(a: PostListItem, b: PostListItem, sort: SortOrder): number {
  switch (sort) {
    case 'updated-desc': {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    case 'updated-asc': {
      return a.updatedAt.getTime() - b.updatedAt.getTime();
    }
    case 'published-desc': {
      // 未公開の記事は末尾に並べる
      return (b.firstPublishedAt?.getTime() ?? -Infinity) - (a.firstPublishedAt?.getTime() ?? -Infinity)
        || b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    case 'created-desc': {
      return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
    }
    case 'title': {
      return a.title.localeCompare(b.title, 'ja');
    }
  }
}


/**
 * 表示条件に従って投稿を絞り込み、並べ替える。
 *
 * @param posts - 投稿
 * @param filters - 表示条件
 * @returns 絞り込み・並べ替えた投稿
 */
export function filterAndSortPosts(posts: readonly PostListItem[], filters: PostListFilters): PostListItem[] {
  return posts
    .filter((post) => matchesStatus(post, filters.status) && matchesOtherFilters(post, filters))
    .toSorted((a, b) => comparePosts(a, b, filters.sort));
}


/**
 * 公開状態の条件ごとに、一致する投稿の数を数える（公開状態以外の条件は適用する）。
 *
 * @param posts - 投稿
 * @param filters - 表示条件
 * @returns 公開状態の条件ごとの投稿数
 */
export function countByStatus(posts: readonly PostListItem[], filters: PostListFilters): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { 'all': 0, 'published': 0, 'draft': 0, 'has-draft': 0, 'private': 0 };
  for (const post of posts) {
    if (!matchesOtherFilters(post, filters)) {
      continue;
    }
    for (const { value } of STATUS_FILTERS) {
      if (matchesStatus(post, value)) {
        counts[value]++;
      }
    }
  }
  return counts;
}
