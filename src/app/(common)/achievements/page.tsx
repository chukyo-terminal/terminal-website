import Link from 'next/link';

import { desc, inArray } from 'drizzle-orm';
import { ArrowRight, Code, FileText } from 'lucide-react';

import { achievementsTable, publishedPostsView } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { getFiscalYear } from '@/utils/date';

import type { JSX } from 'react';
import type { Metadata } from 'next';


export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  title: '活動実績 | Terminal',
  description: 'Terminalの活動実績を紹介するページ',
};


/**
 * 日付（YYYY-MM-DD）をフォーマットする。
 *
 * @param value - 日付（YYYY-MM-DD）
 * @returns フォーマット済みの日付（例: `2026年11月17日`）
 */
function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}


/**
 * 日時を日本標準時の日付でフォーマットする。
 *
 * @param date - 日時
 * @returns フォーマット済みの日付（例: `2026/11/17`）
 */
const formatPublishedDate = (date: Date): string => new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Tokyo',
}).format(date);


/**
 * 活動実績に関連付けられた、公開中の記事。
 */
type RelatedPost = {
  path: string;
  title: string;
  description: string | null;
  publishedAt: Date;
};


/**
 * 関連記事へのリンク。
 *
 * @param properties - プロパティ
 * @returns リンクの要素
 */
function RelatedPostLink({ post }: { post: RelatedPost }): JSX.Element {
  return (
    <Link
      href={post.path}
      className={
        'group flex items-start gap-3 rounded-md border border-gray-700 bg-gray-950/40 p-4 transition-colors '
        + 'hover:border-emerald-500/60 hover:bg-emerald-500/5'
      }
    >
      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-xs text-gray-400">
          関連記事
          <span className="mx-1.5" aria-hidden>·</span>
          <time dateTime={post.publishedAt.toISOString()}>{formatPublishedDate(post.publishedAt)}</time>
        </span>
        <span className="block font-bold text-emerald-300 group-hover:underline">{post.title}</span>
        {post.description && (
          <span className="block line-clamp-2 text-sm text-gray-400">{post.description}</span>
        )}
      </span>
      <ArrowRight
        className={
          'h-5 w-5 shrink-0 self-center text-gray-500 transition-transform '
          + 'group-hover:translate-x-1 group-hover:text-emerald-300'
        }
        aria-hidden
      />
    </Link>
  );
}


export default async function Achievements(): Promise<JSX.Element> {
  const rows = await db
    .select({
      id: achievementsTable.id,
      title: achievementsTable.title,
      description: achievementsTable.description,
      date: achievementsTable.date,
      postId: achievementsTable.postId,
    })
    .from(achievementsTable)
    .orderBy(desc(achievementsTable.date), desc(achievementsTable.id));

  // 関連記事は、公開ページに表示されている記事のみを表示する
  // NOTE: ビューの別名を付けた列（タイトルなど）はテーブル名なしで参照され、実績の列と名前が衝突するため、結合せずに取得する
  const postIds = [...new Set(rows.flatMap((row) => (row.postId === null ? [] : [row.postId])))];
  const relatedPosts = postIds.length > 0
    ? await db
      .select({
        id: publishedPostsView.id,
        slug: publishedPostsView.slug,
        title: publishedPostsView.title,
        description: publishedPostsView.description,
        publishedAt: publishedPostsView.publishedAt,
      })
      .from(publishedPostsView)
      .where(inArray(publishedPostsView.id, postIds))
    : [];
  const relatedPostById = new Map(relatedPosts.flatMap((post): [number, RelatedPost][] => (
    post.publishedAt
      ? [[post.id, {
        path: `/posts/${getFiscalYear(post.publishedAt)}/${post.slug}`,
        title: post.title,
        description: post.description,
        publishedAt: post.publishedAt,
      }]]
      : []
  )));

  const achievements = rows.map((row) => ({
    ...row,
    post: row.postId === null ? null : relatedPostById.get(row.postId) ?? null,
  }));

  return (
    <div className="space-y-8 z-50 pt-20">
      <div className="space-y-4">
        <h2 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          活動実績
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </div>

      {achievements.length === 0 && (
        <p className="text-gray-400">表示できる活動実績はありません。</p>
      )}

      <div className="space-y-16">
        {achievements.map((achievement, index) => (
          <article
            key={achievement.id}
            className={
              `flex flex-col md:items-stretch ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} ` +
              'gap-8'
            }
          >
            <div className="w-full md:w-1/2">
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-6 space-y-4 h-full">
                <div className="space-y-2">
                  <p className="text-sm text-emerald-300">
                    <time dateTime={achievement.date}>{formatDate(achievement.date)}</time>
                  </p>
                  <h3 className="text-2xl font-bold">{achievement.title}</h3>
                </div>
                {achievement.description && (
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {achievement.description}
                  </p>
                )}
                {achievement.post && <RelatedPostLink post={achievement.post} />}
              </div>
            </div>
            <div className="hidden md:block md:w-1/2" aria-hidden="true" />
          </article>
        ))}
      </div>
    </div>
  );
}
