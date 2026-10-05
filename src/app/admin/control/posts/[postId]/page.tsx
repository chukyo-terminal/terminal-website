import { and, desc, eq } from 'drizzle-orm';

import Editor from './_components/editor';
import { db } from '@/lib/drizzle';
import { postContentsTable, postsTable, usersTable } from '@/db/schema';

import type { JSX } from 'react';

export default async function PostEditPage({ params }: { params: Promise<{ postId: number }> }): Promise<JSX.Element> {
  const { postId } = await params;
  const post = await db
    .select()
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
    .where(eq(postsTable.id, postId))
    .limit(1);
  const postContent = await db
    .select()
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postId))
    .orderBy(desc(postContentsTable.updatedAt))
    .limit(1);
  async function handleSave(data: { title: string; description: string | null; authorId: number; slug: string; isPrivate: boolean; content: string }) {
    'use server';
    // eslint-disable-next-line unicorn/prefer-ternary
    if (postContent[0].publishedAt) {
      await db
        .insert(postContentsTable)
        // eslint-disable-next-line unicorn/no-unused-array-method-return
        .values({
          postId,
          title: data.title,
          description: data.description,
          content: data.content,
        });
    } else {
      await db
        .update(postContentsTable)
        .set({
          title: data.title,
          description: data.description,
          content: data.content,
        })
        .where(and(eq(postContentsTable.postId, postContent[0].postId), eq(postContentsTable.identifier, postContent[0].identifier)));
    }
  }
  async function handlePublish() {
    'use server';
    await db
      .update(postContentsTable)
      .set({
        publishedAt: new Date(),
      })
      .where(and(eq(postContentsTable.postId, postContent[0].postId), eq(postContentsTable.identifier, postContent[0].identifier)));
  }
  return (
    <div className="mx-auto px-4 py-12">
      <h1 className="text-2xl">投稿編集</h1>
      {post.length > 0 && postContent.length > 0 ? (
        <Editor
          title={postContent[0].title}
          description={postContent[0].description}
          authorId={post[0].users.id}
          slug={post[0].posts.slug}
          isPrivate={post[0].posts.isPrivate}
          content={postContent[0].content}
          onSave={handleSave}
          onPublish={handlePublish}
        />
      ) : (
        <p>投稿が見つかりませんでした。</p>
      )}
    </div>
  );
}
