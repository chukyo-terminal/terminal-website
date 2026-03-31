import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { postContentsTable, postsTable, postTagsTable, tagsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { markdownIt } from '@/lib/markdown-it';
import './styles.css';

import type { JSX } from 'react';


const siteTitle = 'Terminal | 中京大学プログラミングサークル';


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const postMeta = await db
    .select({
      title: postContentsTable.title,
      description: postContentsTable.description,
    })
    .from(postsTable)
    .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
    .where(and(
      eq(postsTable.slug, slug),
      eq(postsTable.isPrivate, false),
      eq(postContentsTable.isPrivate, false),
      isNotNull(postContentsTable.publishedAt),
    ))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1)
    .then((result) => result.at(0));

  if (!postMeta) {
    return {
      title: `投稿 | ${siteTitle}`,
    };
  }

  return {
    title: `${postMeta.title} | ${siteTitle}`,
    description: postMeta.description ?? undefined,
  };
}


/**
 * 日付をフォーマットする。
 * @param date - フォーマットする日付。
 * @returns フォーマットされた日付文字列。nullの場合は `-` を返す。
 */
const formatDate = (date: Date | null): string => date ? date.toLocaleDateString('ja-JP') : '-';


export default async function Post({ params }: { params: Promise<{ slug: string }> }): Promise<JSX.Element> {
  const { slug } = await params;
  const tagJsonAgg = sql<{ name: string; slug: string }[]>`json_agg(json_build_object('name', ${tagsTable.name}, 'slug', ${tagsTable.slug}))`.as('tags');
  const tagQuery = db
    .select({ tags: tagJsonAgg })
    .from(postTagsTable)
    .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
    .where(eq(postTagsTable.postId, postsTable.id))
    .as('tags');
  const originalPostContentQuery = db
    .select({ publishedAt: postContentsTable.publishedAt })
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postsTable.id))
    .orderBy(asc(postContentsTable.identifier))
    .limit(1)
    .as('original_post_contents');
  const post = await db
    .select({
      id: postsTable.id,
      slug: postsTable.slug,
      authorName: usersTable.name,
      authorDisplayName: usersTable.displayName,
      title: postContentsTable.title,
      description: postContentsTable.description,
      content: postContentsTable.content,
      publishedAt: originalPostContentQuery.publishedAt,
      lastUpdatedAt: postContentsTable.publishedAt,
      tags: tagQuery.tags,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
    .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
    .leftJoinLateral(tagQuery, sql`TRUE`)
    .leftJoinLateral(originalPostContentQuery, sql`TRUE`)
    .where(and(
      eq(postsTable.slug, slug),
      eq(postsTable.isPrivate, false),
      eq(postContentsTable.isPrivate, false),
      isNotNull(postContentsTable.publishedAt),
    ))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1)
    .then((result) => result.at(0)); // XXX: `result[0]` とすると型が `T | undefined` にならないため、`result.at(0)` としている
  if (!post) {
    notFound();
  }

  const author = post.authorDisplayName ?? post.authorName;
  const tags = Array.isArray(post.tags) ? post.tags : [];

  return (
    <div className="space-y-8 z-50 pt-20">
      <div className="flex justify-between items-start">
        <h1 className="text-4xl font-bold text-emerald-400 flex items-center">
          {post.title}
        </h1>
        <div className="text-sm text-gray-400 ml-4">
          <p className="mt-0! mb-1!">著者: {author}</p>
          <div className="flex space-x-4">
            <p className="my-0!">投稿日: {formatDate(post.publishedAt)}</p>
            <p className="my-0!">最終更新日: {formatDate(post.lastUpdatedAt)}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {tags.map((tag) => (
          <Link key={tag.slug} href={`/posts?tags=${tag.slug}`} className="text-emerald-300 hover:text-emerald-200 hover:underline">
            #{tag.name}
          </Link>
        ))}
      </div>
      <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      <div className="space-y-16 text-gray-200">
        <div dangerouslySetInnerHTML={{ __html: markdownIt.render(post.content) }} />
      </div>
    </div>
  );
}
