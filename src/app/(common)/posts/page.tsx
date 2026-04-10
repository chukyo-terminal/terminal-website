import Link from 'next/link';

import { and, arrayContains, desc, eq, exists, inArray, isNotNull, sql } from 'drizzle-orm';
import { Code } from 'lucide-react';

import { postContentsTable, postsTable, postTagsTable, tagsTable, publishedPostsView } from '@/db/schema';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';
import type { Metadata } from 'next';


export const metadata: Metadata = {
  title: '投稿一覧 | Terminal',
  description: 'Terminalによる投稿記事の一覧ページ',
};


/**
 * 日付をフォーマットする。
 * @param date - フォーマットする日付。
 * @returns フォーマット済みの日付文字列。null の場合は `-` を返す。
 */
const formatDate = (date: Date | null): string => date ? date.toLocaleDateString('ja-JP') : '-';


type SearchParameters = {
  tags?: string | string[];
};


export default async function Posts({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}): Promise<JSX.Element> {
  const { tags } = await searchParams;
  const rawTagValues: string[] = [];

  if (Array.isArray(tags)) {
    rawTagValues.push(...tags);
  } else if (typeof tags === 'string') {
    rawTagValues.push(tags);
  }

  const selectedTagSlugs = [...new Set(
    rawTagValues
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )];

  const selectedTags = await db
    .select({ slug: tagsTable.slug, name: tagsTable.name })
    .from(tagsTable)
    .where(inArray(tagsTable.slug, selectedTagSlugs))
    .then((results) => results.map((result) => ({ slug: result.slug, name: result.name })));

  const posts = await db
    .select({
      id: publishedPostsView.id,
      slug: publishedPostsView.slug,
      title: publishedPostsView.title,
      description: publishedPostsView.description,
      publishedAt: publishedPostsView.publishedAt,
      tags: publishedPostsView.tags,
    })
    .from(publishedPostsView)
    .where(selectedTags.length > 0 ? arrayContains(publishedPostsView.tags, sql`${JSON.stringify(selectedTags.map((tag) => ({ slug: tag.slug })))}::JSONB`) : undefined);

  return (
    <div className="space-y-8 z-50 pt-20">
      <div className="space-y-4">
        <h2 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          投稿一覧
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </div>

      {selectedTagSlugs.length > 0 && (
        <p className="text-gray-300">
          タグ
          {' '}
          <span className="text-emerald-300">
            {selectedTags.map((tag) => `#${tag.name}`).join(', ')}
          </span>
          {' '}
          のすべてが設定された記事を表示しています。
        </p>
      )}

      {posts.length === 0 ? (
        <p className="text-gray-400">該当する記事はありません。</p>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => {
            const tags = Array.isArray(post.tags) ? post.tags : [];

            return (
              <article
                key={post.id}
                className="rounded-lg border border-gray-800 bg-gray-900/40 p-6 space-y-3"
              >
                <h3 className="text-2xl font-bold text-emerald-300">
                  <Link href={`/posts/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </h3>
                {post.description && <p className="text-gray-300 leading-relaxed">{post.description}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
                  <span>公開日: {formatDate(post.publishedAt)}</span>
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {tags.map((tag) => (
                      <Link
                        key={tag.slug}
                        href={`/posts?tags=${tag.slug}`}
                        className="text-emerald-300 hover:text-emerald-200 hover:underline"
                      >
                        #{tag.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
