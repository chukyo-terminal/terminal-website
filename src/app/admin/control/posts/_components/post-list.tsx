'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { CalendarDays, ExternalLink, FilePlus2, Plus, Search, SearchX, Tags, UserRound, X } from 'lucide-react';

import { PostStatusBadge, PrivateBadge } from './post-status-badge';
import { formatDate, formatDateTime, formatRelativeTime } from '../_lib/date-format';
import {
  DEFAULT_FILTERS, SORT_ORDERS, STATUS_FILTERS, countByStatus, filterAndSortPosts, hasActiveFilters,
  toSearchParameters,
} from '../_lib/post-list';

import type { JSX } from 'react';
import type { PostListFilters, PostListItem, SortOrder } from '../_lib/post-list';


/**
 * 新規投稿ページのパス。
 */
const NEW_POST_PATH = '/admin/control/posts/new';


/**
 * タグ管理ページのパス。
 */
const TAG_MANAGEMENT_PATH = '/admin/control/posts/tags';


/**
 * 主要な操作ボタン（新規投稿）の共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 font-medium '
  + 'text-white hover:bg-emerald-700';


/**
 * 一覧が空のときの表示の共通クラス。
 */
const EMPTY_STATE_CLASS_NAME = 'flex flex-col items-center rounded-lg border border-dashed border-gray-700 px-6 '
  + 'text-center';


/**
 * セレクトボックスの共通クラス。
 */
const SELECT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500';


/**
 * 投稿の一覧の1件分。
 *
 * カード全体が編集画面へのリンクになる。タグは、クリックするとそのタグで絞り込む。
 *
 * @param properties - プロパティ
 * @returns 投稿の1件分
 */
function PostCard({
  post,
  now,
  onTagSelect,
}: {
  post: PostListItem;
  now: Date;
  onTagSelect: (slug: string) => void;
}): JSX.Element {
  const editPath = `/admin/control/posts/${post.id}`;
  return (
    <li
      className={
        'group relative rounded-lg border border-gray-800 bg-gray-900/40 p-4 transition-colors '
        + 'hover:border-emerald-500/50 hover:bg-gray-800/40 focus-within:border-emerald-500/60'
      }
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <PostStatusBadge status={post.status} />
            {post.isPrivate && <PrivateBadge />}
          </div>
          <h2 className="text-lg leading-snug font-bold break-words text-gray-100 group-hover:text-emerald-300">
            {/* カード全体をクリックできるよう、リンクの当たり判定をカード全体に広げる */}
            <Link href={editPath} className="after:absolute after:inset-0 after:rounded-lg focus:outline-none">
              {post.title.trim() || <span className="text-gray-500">タイトル未設定</span>}
            </Link>
          </h2>
          {post.description && <p className="line-clamp-2 text-sm text-gray-400">{post.description}</p>}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {post.tags.map((tag) => (
                <button
                  key={tag.slug}
                  type="button"
                  title={`タグ「${tag.name}」で絞り込む`}
                  onClick={() => onTagSelect(tag.slug)}
                  className="relative z-10 text-emerald-300 hover:text-emerald-200 hover:underline"
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {post.publicPath && (
          <a
            href={post.publicPath}
            target="_blank"
            rel="noopener noreferrer"
            title="公開ページを開く"
            aria-label={`「${post.title}」の公開ページを開く`}
            className={
              'relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-700 '
              + 'text-gray-400 hover:border-emerald-500/60 hover:text-emerald-300'
            }
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {post.author.name}
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {post.firstPublishedAt
            ? <>公開 <time dateTime={post.firstPublishedAt.toISOString()}>{formatDate(post.firstPublishedAt)}</time></>
            : '未公開'}
        </span>
        <span>
          更新{' '}
          <time dateTime={post.updatedAt.toISOString()} title={formatDateTime(post.updatedAt)}>
            {formatRelativeTime(post.updatedAt, now)}
          </time>
        </span>
        <span className="font-mono break-all text-gray-600">{post.slug}</span>
      </div>
    </li>
  );
}


type PostListProperties = {
  posts: PostListItem[];
  /** URL から読み取った表示条件 */
  initialFilters: PostListFilters;
  /** 相対時刻（「3時間前」など）の基準日時 */
  now: Date;
};


/**
 * 投稿管理ページの一覧。キーワード・公開状態・著者・タグで絞り込み、並べ替えられる。
 *
 * @param properties - プロパティ
 * @returns 投稿の一覧
 */
export default function PostList({ posts, initialFilters, now }: PostListProperties): JSX.Element {
  const searchInputReference = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState(initialFilters);

  const authors = useMemo(() => {
    const map = new Map<number, string>();
    for (const post of posts) {
      map.set(post.author.id, post.author.name);
    }
    return [...map].map(([id, name]) => ({ id, name })).toSorted((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [posts]);

  const tags = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; count: number }>();
    for (const tag of posts.flatMap((post) => post.tags)) {
      const entry = map.get(tag.slug) ?? { ...tag, count: 0 };
      entry.count++;
      map.set(tag.slug, entry);
    }
    return [...map.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [posts]);

  const visiblePosts = useMemo(() => filterAndSortPosts(posts, filters), [posts, filters]);
  const statusCounts = useMemo(() => countByStatus(posts, filters), [posts, filters]);
  const isFiltered = hasActiveFilters(filters);
  // URL で指定されたタグが存在しない場合も選択肢に表示する
  const isUnknownTag = filters.tag !== '' && !tags.some((tag) => tag.slug === filters.tag);

  /**
   * 表示条件を変更し、URL に反映する（再読み込みしても条件が保たれるようにする）。
   *
   * @param changes - 変更する条件
   */
  function updateFilters(changes: Partial<PostListFilters>): void {
    const next = { ...filters, ...changes };
    setFilters(next);
    const query = toSearchParameters(next).toString();
    globalThis.history.replaceState(null, '', query ? `?${query}` : globalThis.location.pathname);
  }

  // 「/」キーで検索欄にフォーカスする
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTyping = target?.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInputReference.current?.focus();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => handleKeyDown(event);
    globalThis.addEventListener('keydown', listener);
    return () => globalThis.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">投稿管理</h1>
          <p className="mt-1 text-sm text-gray-400">
            全{posts.length}件の投稿
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={TAG_MANAGEMENT_PATH}
            className={
              'inline-flex items-center gap-2 rounded border border-gray-600 px-4 py-2 font-medium text-gray-200 '
              + 'hover:border-gray-500 hover:bg-gray-800'
            }
          >
            <Tags className="h-4 w-4" aria-hidden />
            タグ管理
          </Link>
          <Link
            href={NEW_POST_PATH}
            className={PRIMARY_BUTTON_CLASS_NAME}
          >
            <Plus className="h-4 w-4" aria-hidden />
            新規投稿
          </Link>
        </div>
      </div>

      {posts.length === 0 ? (
        // 投稿が1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-4 py-16`}>
          <FilePlus2 className="h-10 w-10 text-gray-600" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-gray-200">まだ投稿がありません</p>
            <p className="text-sm text-gray-400">最初の記事を書いてみましょう。</p>
          </div>
          <Link
            href={NEW_POST_PATH}
            className={`${PRIMARY_BUTTON_CLASS_NAME} text-sm`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            新規投稿
          </Link>
        </div>
      ) : (
        <>
          {/* 公開状態による絞り込み */}
          <div
            role="group"
            aria-label="公開状態で絞り込む"
            className={
              '-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 '
              + '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            }
          >
            {STATUS_FILTERS.map((filter) => {
              const isSelected = filters.status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateFilters({ status: filter.value })}
                  className={
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors '
                    + (isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200')
                  }
                >
                  {filter.label}
                  <span
                    className={
                      'rounded-full px-1.5 text-xs tabular-nums '
                      + (isSelected ? 'bg-emerald-500/25 text-emerald-100' : 'bg-gray-800 text-gray-400')
                    }
                  >
                    {statusCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* キーワード・著者・タグ・並び順 */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_11rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden
              />
              <input
                ref={searchInputReference}
                type="search"
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && filters.query !== '') {
                    event.preventDefault();
                    updateFilters({ query: '' });
                  }
                }}
                placeholder="タイトル・説明・タグなどで検索"
                aria-label="キーワードで検索"
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 py-2 pr-16 pl-9 text-sm text-gray-200 '
                  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 '
                  + '[&::-webkit-search-cancel-button]:hidden'
                }
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {filters.query === '' ? (
                  <kbd
                    title="「/」キーで検索欄に移動"
                    className="hidden rounded border border-gray-600 px-1.5 font-mono text-xs text-gray-500 sm:inline"
                  >
                    /
                  </kbd>
                ) : (
                  <button
                    type="button"
                    aria-label="キーワードを消去"
                    onClick={() => {
                      updateFilters({ query: '' });
                      searchInputReference.current?.focus();
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:contents">
              <select
                aria-label="著者で絞り込む"
                value={filters.author}
                onChange={(event) => updateFilters({ author: event.target.value })}
                className={SELECT_CLASS_NAME}
              >
                <option value="">すべての著者</option>
                {authors.map((author) => (
                  <option key={author.id} value={String(author.id)}>{author.name}</option>
                ))}
              </select>
              <select
                aria-label="タグで絞り込む"
                value={filters.tag}
                onChange={(event) => updateFilters({ tag: event.target.value })}
                className={SELECT_CLASS_NAME}
              >
                <option value="">すべてのタグ</option>
                {isUnknownTag && <option value={filters.tag}>#{filters.tag}</option>}
                {tags.map((tag) => (
                  <option key={tag.slug} value={tag.slug}>#{tag.name}（{tag.count}）</option>
                ))}
              </select>
              <select
                aria-label="並び順"
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value as SortOrder })}
                className={`${SELECT_CLASS_NAME} col-span-2 md:col-span-1`}
              >
                {SORT_ORDERS.map((order) => (
                  <option key={order.value} value={order.value}>{order.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 件数 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered ? `${posts.length}件中 ${visiblePosts.length}件を表示` : `${visiblePosts.length}件`}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => updateFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                条件をクリア
              </button>
            )}
          </div>

          {visiblePosts.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {visiblePosts.map((post) => (
                <PostCard key={post.id} post={post} now={now} onTagSelect={(slug) => updateFilters({ tag: slug })} />
              ))}
            </ul>
          ) : (
            // 条件に一致する投稿がない場合
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致する投稿はありません</p>
              <button
                type="button"
                onClick={() => updateFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
                className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                条件をクリア
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
