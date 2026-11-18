import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import CommentManager from './_components/comment-manager';
import { postCommentsTable, postContentsTable, postsTable } from '@/db/schema';
import { checkPermission, getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { ReplyContentSchema } from '@/lib/post-feedback';
import { findReplyTarget, selectComments, selectRatingSummary } from '@/lib/post-feedback-queries';
import { getFiscalYear } from '@/utils/date';

import type { JSX } from 'react';
import type { ManagedComment } from '@/lib/post-feedback';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * 処理を中断し、利用者にメッセージを表示するためのエラー。
 */
class CommentActionError extends Error {}


/**
 * IDが正しい形式であるかを検証する。
 *
 * @param id - 検証する値
 * @returns 正の整数であれば `true`
 */
function isValidId(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) > 0;
}


/**
 * 権限を検証してからコメントを操作し、操作後の記事のすべてのコメントを返す。
 *
 * @param postId - 投稿ID
 * @param operation - コメントを操作する処理。利用者にメッセージを表示して中断する場合は `CommentActionError` を投げる
 * @param fallback - 想定外のエラーの場合のメッセージ
 * @returns 操作後のすべてのコメント
 */
async function runCommentAction(
  postId: number,
  operation: () => Promise<void>,
  fallback: string,
): Promise<ActionResult<ManagedComment[]>> {
  const permissionError = await checkPermission('user');
  if (permissionError) {
    return { ok: false, error: permissionError };
  }
  try {
    await operation();
    return { ok: true, data: await selectComments(postId) };
  } catch (e) {
    if (e instanceof CommentActionError) {
      return { ok: false, error: e.message };
    }
    console.error(fallback, e);
    return { ok: false, error: fallback };
  }
}


export default async function PostCommentsPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}): Promise<JSX.Element> {
  const { postId: postIdParameter } = await params;
  const postId = Number(postIdParameter);
  const isValidPostId = /^\d+$/.test(postIdParameter) && Number.isSafeInteger(postId);

  const post = isValidPostId
    ? await db
      .select({ slug: postsTable.slug, isPrivate: postsTable.isPrivate })
      .from(postsTable)
      .where(eq(postsTable.id, postId))
      .limit(1)
      .then((result) => result.at(0))
    : undefined;

  if (!post) {
    return (
      <div className="mx-auto px-4 py-12">
        <h1 className="text-2xl">コメント管理</h1>
        <p>投稿が見つかりませんでした。</p>
      </div>
    );
  }

  const [latestContent, firstPublication, ratingSummary, comments] = await Promise.all([
    db
      .select({ title: postContentsTable.title })
      .from(postContentsTable)
      .where(eq(postContentsTable.postId, postId))
      .orderBy(desc(postContentsTable.identifier))
      .limit(1)
      .then((result) => result.at(0)),
    db
      .select({ publishedAt: postContentsTable.publishedAt })
      .from(postContentsTable)
      .where(and(eq(postContentsTable.postId, postId), isNotNull(postContentsTable.publishedAt)))
      .orderBy(asc(postContentsTable.identifier))
      .limit(1)
      .then((result) => result.at(0)),
    selectRatingSummary(postId),
    selectComments(postId),
  ]);
  const firstPublishedAt = firstPublication?.publishedAt ?? null;
  // 記事の URL の年度は、初めて公開された日時で決まる
  const publicPath = firstPublishedAt && !post.isPrivate
    ? `/posts/${getFiscalYear(firstPublishedAt)}/${post.slug}`
    : null;

  async function handleReload(): Promise<ActionResult<ManagedComment[]>> {
    'use server';
    return await runCommentAction(postId, async () => {}, 'コメントを読み込めませんでした。');
  }

  async function handleReply(commentId: number, content: string): Promise<ActionResult<ManagedComment[]>> {
    'use server';
    return await runCommentAction(postId, async () => {
      if (!isValidId(commentId)) {
        throw new CommentActionError('返信先のコメントが正しくありません。');
      }
      const parsed = ReplyContentSchema.safeParse(content);
      if (!parsed.success) {
        throw new CommentActionError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      }
      const authorId = await getCurrentUserId();
      if (authorId === null) {
        throw new CommentActionError('ログイン中のユーザーが見つかりませんでした。');
      }
      // 管理者は、非表示にしたものを含め、この記事のどのコメントにも返信できる
      const target = await findReplyTarget(postId, commentId);
      if (!target) {
        throw new CommentActionError('返信先のコメントが見つかりませんでした。削除された可能性があります。');
      }
      await db
        .insert(postCommentsTable)
        // eslint-disable-next-line unicorn/no-unused-array-method-return
        .values({ postId, threadId: target.threadId, parentId: commentId, authorId, content: parsed.data });
    }, '返信を投稿できませんでした。');
  }

  async function handleUpdateReply(replyId: number, content: string): Promise<ActionResult<ManagedComment[]>> {
    'use server';
    return await runCommentAction(postId, async () => {
      if (!isValidId(replyId)) {
        throw new CommentActionError('返信が正しくありません。');
      }
      const parsed = ReplyContentSchema.safeParse(content);
      if (!parsed.success) {
        throw new CommentActionError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      }
      const updated = await db
        .update(postCommentsTable)
        .set({ content: parsed.data })
        .where(and(
          eq(postCommentsTable.id, replyId),
          eq(postCommentsTable.postId, postId),
          // 編集できるのは管理者の返信のみ
          isNotNull(postCommentsTable.authorId),
        ))
        .returning({ id: postCommentsTable.id });
      if (updated.length === 0) {
        throw new CommentActionError('返信が見つかりませんでした。削除された可能性があります。');
      }
    }, '返信を更新できませんでした。');
  }

  async function handleSetHidden(commentId: number, isHidden: boolean): Promise<ActionResult<ManagedComment[]>> {
    'use server';
    return await runCommentAction(postId, async () => {
      if (!isValidId(commentId) || typeof isHidden !== 'boolean') {
        throw new CommentActionError('指定されたコメントが正しくありません。');
      }
      const target = await db
        .select({ isHidden: postCommentsTable.isHidden, updatedAt: postCommentsTable.updatedAt })
        .from(postCommentsTable)
        .where(and(
          eq(postCommentsTable.id, commentId),
          eq(postCommentsTable.postId, postId),
          // 非表示にできるのは訪問者のコメント（スレッドの起点と返信）のみ
          isNull(postCommentsTable.authorId),
        ))
        .limit(1)
        .then((result) => result.at(0));
      if (!target) {
        throw new CommentActionError('コメントが見つかりませんでした。削除された可能性があります。');
      }
      if (target.isHidden === isHidden) {
        return;
      }
      await db
        .update(postCommentsTable)
        // 内容の編集ではないため、更新日時は変更しない
        .set({ isHidden, updatedAt: target.updatedAt })
        .where(eq(postCommentsTable.id, commentId));
    }, 'コメントの表示設定を変更できませんでした。');
  }

  async function handleDelete(commentId: number): Promise<ActionResult<ManagedComment[]>> {
    'use server';
    return await runCommentAction(postId, async () => {
      if (!isValidId(commentId)) {
        throw new CommentActionError('指定されたコメントが正しくありません。');
      }
      // スレッドの起点のコメントを削除すると、スレッド全体が削除される。
      // 返信を削除した場合、その返信への返信は残る（返信先は「表示されていないコメント」になる）
      const deleted = await db
        .delete(postCommentsTable)
        .where(and(eq(postCommentsTable.id, commentId), eq(postCommentsTable.postId, postId)))
        .returning({ id: postCommentsTable.id });
      if (deleted.length === 0) {
        throw new CommentActionError('コメントが見つかりませんでした。既に削除された可能性があります。');
      }
    }, 'コメントを削除できませんでした。');
  }

  return (
    <div className="mx-auto px-4 py-12">
      <CommentManager
        postId={postId}
        postTitle={latestContent?.title ?? ''}
        publicPath={publicPath}
        ratingSummary={ratingSummary}
        initialComments={comments}
        now={new Date()}
        onReload={handleReload}
        onReply={handleReply}
        onUpdateReply={handleUpdateReply}
        onSetHidden={handleSetHidden}
        onDelete={handleDelete}
      />
    </div>
  );
}
