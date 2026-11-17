import { DrizzleQueryError, and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import Editor from './_components/editor';
import { PostFormSchema, normalizeDescription } from './_lib/post-form';
import { db } from '@/lib/drizzle';
import { postContentsTable, postsTable, usersTable } from '@/db/schema';
import { getFiscalYear } from '@/utils/date';

import type { JSX } from 'react';
import type { PostFormValues, PostStatus, PublishResult, SaveResult } from './_lib/post-form';

export const dynamic = 'force-dynamic';


/**
 * トランザクション内でクエリを実行するオブジェクト。
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];


/**
 * 投稿の最新の版（内容）を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @returns 最新の版。存在しない場合は `undefined`
 */
async function getLatestPostContent(executor: Pick<Transaction, 'select'>, postId: number) {
  return await executor
    .select()
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postId))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1)
    .then((result) => result.at(0));
}


/**
 * 投稿が初めて公開された日時を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @returns 初めて公開された日時。未公開の場合は `null`
 */
async function getFirstPublishedAt(executor: Pick<Transaction, 'select'>, postId: number): Promise<Date | null> {
  const result = await executor
    .select({ publishedAt: postContentsTable.publishedAt })
    .from(postContentsTable)
    .where(and(eq(postContentsTable.postId, postId), isNotNull(postContentsTable.publishedAt)))
    .orderBy(asc(postContentsTable.identifier))
    .limit(1)
    .then((rows) => rows.at(0));
  return result?.publishedAt ?? null;
}


/**
 * 一意性制約違反のエラーかどうかを判定する。
 *
 * @param e - エラー
 * @returns 一意性制約違反の場合は `true`
 */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof DrizzleQueryError
    && e.cause instanceof DatabaseError
    && e.cause.code === PostgresError.UNIQUE_VIOLATION;
}


export default async function PostEditPage({ params }: { params: Promise<{ postId: string }> }): Promise<JSX.Element> {
  const { postId: postIdParameter } = await params;
  const postId = Number(postIdParameter);
  const isValidPostId = /^\d+$/.test(postIdParameter) && Number.isSafeInteger(postId);

  const post = isValidPostId
    ? await db
      .select({
        slug: postsTable.slug,
        isPrivate: postsTable.isPrivate,
        authorName: usersTable.name,
        authorDisplayName: usersTable.displayName,
      })
      .from(postsTable)
      .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
      .where(eq(postsTable.id, postId))
      .limit(1)
      .then((result) => result.at(0))
    : undefined;
  const latestContent = post ? await getLatestPostContent(db, postId) : undefined;

  if (!post || !latestContent) {
    return (
      <div className="mx-auto px-4 py-12">
        <h1 className="text-2xl">投稿編集</h1>
        <p>投稿が見つかりませんでした。</p>
      </div>
    );
  }

  const firstPublishedAt = await getFirstPublishedAt(db, postId);
  let status: PostStatus = 'draft';
  if (latestContent.publishedAt) {
    status = 'published';
  } else if (firstPublishedAt) {
    status = 'published-with-draft';
  }

  async function handleSave(values: PostFormValues): Promise<SaveResult> {
    'use server';
    const parsed = PostFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    const data = { ...parsed.data, description: normalizeDescription(parsed.data.description) };
    try {
      return await db.transaction(async (tx): Promise<SaveResult> => {
        const currentPost = await tx
          .select({ slug: postsTable.slug, isPrivate: postsTable.isPrivate })
          .from(postsTable)
          .where(eq(postsTable.id, postId))
          .limit(1)
          .then((result) => result.at(0));
        // 画面を開いた後に別の画面で保存・公開されている可能性があるため、保存時点の最新の版を取得する
        const latest = await getLatestPostContent(tx, postId);
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }

        const isContentChanged = latest.title !== data.title
          || latest.description !== data.description
          || latest.content !== data.content;
        if (isContentChanged) {
          // eslint-disable-next-line unicorn/prefer-ternary
          if (latest.publishedAt) {
            // 公開済みの版は書き換えず、新しい版（下書き）として追加する
            await tx
              .insert(postContentsTable)
              // eslint-disable-next-line unicorn/no-unused-array-method-return
              .values({
                postId,
                title: data.title,
                description: data.description,
                content: data.content,
              });
          } else {
            await tx
              .update(postContentsTable)
              .set({
                title: data.title,
                description: data.description,
                content: data.content,
              })
              .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, latest.identifier)));
          }
        }

        if (currentPost.slug !== data.slug || currentPost.isPrivate !== data.isPrivate) {
          await tx
            .update(postsTable)
            .set({ slug: data.slug, isPrivate: data.isPrivate })
            .where(eq(postsTable.id, postId));
        }

        return { ok: true, savedAt: new Date() };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { ok: false, error: '同じ年度に同じスラッグの記事が既に存在します。別のスラッグを指定してください。' };
      }
      console.error('Failed to save post:', e);
      return { ok: false, error: '保存に失敗しました。' };
    }
  }

  async function handlePublish(): Promise<PublishResult> {
    'use server';
    try {
      return await db.transaction(async (tx): Promise<PublishResult> => {
        const currentPost = await tx
          .select({ slug: postsTable.slug, year: postsTable.year })
          .from(postsTable)
          .where(eq(postsTable.id, postId))
          .limit(1)
          .then((result) => result.at(0));
        const latest = await getLatestPostContent(tx, postId);
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (latest.publishedAt) {
          return { ok: false, error: '公開されていない変更はありません。' };
        }

        const firstPublishedAt = await getFirstPublishedAt(tx, postId);
        const now = new Date();
        await tx
          .update(postContentsTable)
          .set({ publishedAt: now })
          .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, latest.identifier)));

        // 記事の URL の年度は初回の公開日時で決まるため、公開年度は初回の公開時に確定させ、更新の公開では変更しない
        const year = getFiscalYear(firstPublishedAt ?? now);
        if (currentPost.year === null) {
          await tx
            .update(postsTable)
            .set({ year })
            .where(eq(postsTable.id, postId));
        }

        return {
          ok: true,
          year,
          slug: currentPost.slug,
          title: latest.title,
          description: latest.description,
          isFirstPublication: firstPublishedAt === null,
        };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { ok: false, error: '同じ年度に同じスラッグの記事が既に存在します。スラッグを変更してから公開してください。' };
      }
      console.error('Failed to publish post:', e);
      return { ok: false, error: '公開に失敗しました。' };
    }
  }

  return (
    <div className="mx-auto px-4 py-12">
      <Editor
        postId={postId}
        initialValues={{
          title: latestContent.title,
          description: latestContent.description,
          slug: post.slug,
          isPrivate: post.isPrivate,
          content: latestContent.content,
        }}
        author={post.authorDisplayName || post.authorName}
        status={status}
        publishedYear={firstPublishedAt ? getFiscalYear(firstPublishedAt) : null}
        expectedYear={getFiscalYear(new Date())}
        firstPublishedAt={firstPublishedAt}
        lastSavedAt={latestContent.updatedAt}
        onSave={handleSave}
        onPublish={handlePublish}
      />
    </div>
  );
}
