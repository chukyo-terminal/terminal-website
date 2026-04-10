import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { eq } from 'drizzle-orm';

import { publishedPostsView } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { markdownIt } from '@/lib/markdown-it';
import './styles.css';

import type { JSX } from 'react';


const siteTitle = 'Terminal | 中京大学プログラミングサークル';


export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const postMeta = await db
    .select({
      title: publishedPostsView.title,
      description: publishedPostsView.description,
    })
    .from(publishedPostsView)
    .where(eq(publishedPostsView.slug, slug))
    .then((result) => result.at(0)); // XXX: `result[0]` とすると型が `T | undefined` にならないため、`result.at(0)` としている

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
  const post = await db
    .select({
      id: publishedPostsView.id,
      slug: publishedPostsView.slug,
      author: {
        id: publishedPostsView.authorId,
        name: publishedPostsView.authorName,
        displayName: publishedPostsView.authorDisplayName,
      },
      title: publishedPostsView.title,
      description: publishedPostsView.description,
      content: publishedPostsView.content,
      tags: publishedPostsView.tags,
      publishedAt: publishedPostsView.publishedAt,
      updatedAt: publishedPostsView.updatedAt,
      hasDraft: publishedPostsView.hasDraft,
    })
    .from(publishedPostsView)
    .where(eq(publishedPostsView.slug, slug))
    .then((result) => result.at(0)); // XXX: `result[0]` とすると型が `T | undefined` にならないため、`result.at(0)` としている
  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-8 z-50 pt-20">
      <div className="flex justify-between items-start">
        <h1 className="text-4xl font-bold text-emerald-400 flex items-center">
          {post.title}
        </h1>
        <div className="text-sm text-gray-400 ml-4">
          <p className="mt-0! mb-1!">著者: {post.author.displayName || post.author.name}</p>
          <div className="flex space-x-4">
            <p className="my-0!">投稿日: {formatDate(post.publishedAt)}</p>
            <p className="my-0!">最終更新日: {formatDate(post.updatedAt)}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {post.tags.map((tag) => (
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
