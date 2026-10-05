import { postContentsTable, postsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';

import NewPostForm from './_components/form';

import type { JSX } from 'react';

export default async function NewPostPage(): Promise<JSX.Element> {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  async function createNewPost(authorId: number, slug: string, title: string): Promise<number> {
    'use server';
    let postId: number = 0;
    await db.transaction(async (tx) => {
      postId = await tx
        .insert(postsTable)
        .values({
          authorId,
          slug,
        })
        .returning({ id: postsTable.id })
        .then((result) => result[0].id);
      await tx
        .insert(postContentsTable)
        // eslint-disable-next-line unicorn/no-unused-array-method-return
        .values({
          postId: postId,
          title,
          content: '',
        });
    });
    return postId;
  }
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    displayName: usersTable.displayName,
  }).from(usersTable);
  return (
    <div className="mx-auto px-4 py-12">
      <h1 className="text-2xl">新規投稿</h1>
      <NewPostForm users={users} onCreate={createNewPost} />
    </div>
  );
}
