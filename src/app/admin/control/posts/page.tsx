import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { postContentsTable, postsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';


/**
 * 日時をフォーマットする。
 * @param date - フォーマットする日時。
 * @returns フォーマット済みの日時文字列。null の場合は `-` を返す。
 */
const formatDate = (date: Date | null): string => date ? (
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
) : '-';


export default async function PostManagementPage(): Promise<JSX.Element> {
  const posts = await db
    .selectDistinctOn([postsTable.id], {
      id: postsTable.id,
      author: {
        id: usersTable.id,
        name: usersTable.name,
        displayName: usersTable.displayName,
      },
      title: postContentsTable.title,
      description: postContentsTable.description,
      slug: postsTable.slug,
      isPrivate: postsTable.isPrivate,
      createdAt: postsTable.createdAt,
      updatedAt: postContentsTable.updatedAt,
      publishedAt: postContentsTable.publishedAt,
    })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
    .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
    .orderBy(desc(postsTable.id), desc(postContentsTable.updatedAt));
  return (
    <div className="mx-auto px-4 py-12">
      <h1 className="text-2xl">投稿管理</h1>
      <div className="flex flex-col">
        {posts.map((post, index) => (
          <Link key={index} href={`./posts/${post.id}`}>
            <article className="my-4 rounded-lg border p-4">
              <h2>{post.title}</h2>
              {post.isPrivate && (
                <p className="text-sm text-red-500">非公開</p>
              )}
              <p className="text-sm text-muted-foreground text-right">
                著者: {post.author.displayName ?? post.author.name}
              </p>
              <p className="text-sm text-muted-foreground text-right">
                公開日: <time>{formatDate(post.publishedAt)}</time>
              </p>
              <p className="text-sm text-muted-foreground text-right">
                最終更新: <time>{formatDate(post.updatedAt)}</time>
              </p>
              <p>{post.description}</p>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
