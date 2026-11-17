import { asc, desc, eq, isNotNull, min } from 'drizzle-orm';

import PostList from './_components/post-list';
import { parsePostListFilters } from './_lib/post-list';
import { getPostStatus } from './_lib/post-status';
import { postContentsTable, postTagsTable, postsTable, tagsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { getFiscalYear } from '@/utils/date';

import type { JSX } from 'react';
import type { PostListItem } from './_lib/post-list';

export const dynamic = 'force-dynamic';


export default async function PostManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const [latestContents, firstPublications, postTags] = await Promise.all([
    // 各投稿の最新の版
    db
      .selectDistinctOn([postsTable.id], {
        id: postsTable.id,
        slug: postsTable.slug,
        isPrivate: postsTable.isPrivate,
        createdAt: postsTable.createdAt,
        authorId: usersTable.id,
        authorName: usersTable.name,
        authorDisplayName: usersTable.displayName,
        title: postContentsTable.title,
        description: postContentsTable.description,
        updatedAt: postContentsTable.updatedAt,
        publishedAt: postContentsTable.publishedAt,
      })
      .from(postsTable)
      .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
      .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
      .orderBy(desc(postsTable.id), desc(postContentsTable.identifier)),
    // 各投稿が初めて公開された日時
    db
      .select({ postId: postContentsTable.postId, publishedAt: min(postContentsTable.publishedAt) })
      .from(postContentsTable)
      .where(isNotNull(postContentsTable.publishedAt))
      .groupBy(postContentsTable.postId),
    // 各投稿のタグ
    db
      .select({ postId: postTagsTable.postId, name: tagsTable.name, slug: tagsTable.slug })
      .from(postTagsTable)
      .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
      .orderBy(asc(tagsTable.name)),
  ]);

  const firstPublishedAtByPost = new Map(firstPublications.map((row) => [row.postId, row.publishedAt]));
  const tagsByPost = new Map<number, { name: string; slug: string }[]>();
  for (const { postId, name, slug } of postTags) {
    tagsByPost.set(postId, [...(tagsByPost.get(postId) ?? []), { name, slug }]);
  }

  const posts: PostListItem[] = latestContents.map((content) => {
    const firstPublishedAt = firstPublishedAtByPost.get(content.id) ?? null;
    return {
      id: content.id,
      title: content.title,
      description: content.description,
      slug: content.slug,
      isPrivate: content.isPrivate,
      status: getPostStatus(content.publishedAt, firstPublishedAt),
      author: { id: content.authorId, name: content.authorDisplayName || content.authorName },
      tags: tagsByPost.get(content.id) ?? [],
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      firstPublishedAt,
      // 記事の URL の年度は、初めて公開された日時で決まる
      publicPath: firstPublishedAt && !content.isPrivate
        ? `/posts/${getFiscalYear(firstPublishedAt)}/${content.slug}`
        : null,
    };
  });

  return (
    <div className="mx-auto px-4 py-12">
      <PostList posts={posts} initialFilters={parsePostListFilters(await searchParams)} now={new Date()} />
    </div>
  );
}
