import Link from 'next/link';

import { and, desc, eq, exists, isNotNull, sql } from 'drizzle-orm';
import { Code } from 'lucide-react';

import { postContentsTable, postsTable, postTagsTable, tagsTable } from '@/db/schema';
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

  const latestPublishedContentQuery = db
    .select({
      identifier: postContentsTable.identifier,
      title: postContentsTable.title,
      description: postContentsTable.description,
      publishedAt: postContentsTable.publishedAt,
    })
    .from(postContentsTable)
    .where(and(
      eq(postContentsTable.postId, postsTable.id),
      eq(postContentsTable.isPrivate, false),
      isNotNull(postContentsTable.publishedAt),
    ))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1)
    .as('latest_post_contents');

  const originalPostContentQuery = db
    .select({ publishedAt: postContentsTable.publishedAt })
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postsTable.id))
    .orderBy(postContentsTable.identifier)
    .limit(1)
    .as('original_post_contents');

  const tagJsonAgg = sql<{ name: string; slug: string }[]>`
    json_agg(json_build_object('name', ${tagsTable.name}, 'slug', ${tagsTable.slug}))
  `.as('tags');
  const postTagsQuery = db
    .select({ tags: tagJsonAgg })
    .from(postTagsTable)
    .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
    .where(eq(postTagsTable.postId, postsTable.id))
    .as('post_tags');

  const tagExistsConditions = selectedTagSlugs.map((tagSlug) => exists(
    db
      .select({ id: postTagsTable.postId })
      .from(postTagsTable)
      .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
      .where(and(
        eq(postTagsTable.postId, postsTable.id),
        eq(tagsTable.slug, tagSlug),
      )),
  ));

  const whereCondition = and(
    eq(postsTable.isPrivate, false),
    isNotNull(latestPublishedContentQuery.identifier),
    ...tagExistsConditions,
  );

  const posts = await db
    .select({
      id: postsTable.id,
      slug: postsTable.slug,
      title: latestPublishedContentQuery.title,
      description: latestPublishedContentQuery.description,
      publishedAt: originalPostContentQuery.publishedAt,
      tags: postTagsQuery.tags,
    })
    .from(postsTable)
    .leftJoinLateral(latestPublishedContentQuery, sql`TRUE`)
    .leftJoinLateral(originalPostContentQuery, sql`TRUE`)
    .leftJoinLateral(postTagsQuery, sql`TRUE`)
    .where(whereCondition)
    .orderBy(desc(originalPostContentQuery.publishedAt), desc(postsTable.id));

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
            {selectedTagSlugs.map((tagSlug) => `#${tagSlug}`).join(', ')}
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
