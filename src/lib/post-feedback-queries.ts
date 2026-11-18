import { and, asc, count, eq, gte, isNull, not, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { postCommentsTable, postRatingsTable, postsTable, publishedPostsView, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { getCommentAuthorName } from '@/lib/post-feedback';

import type {
  ManagedComment, ManagedCommentAuthor, ManagedReply, RatingSummary, RatingValue,
} from '@/lib/post-feedback';


/**
 * クエリを実行するオブジェクト（`db` またはトランザクション）。
 */
type Executor = Pick<typeof db, 'select'>;


/**
 * 記事が公開ページに表示されているかどうかを判定する。
 *
 * @param postId - 投稿ID
 * @param executor - クエリを実行するオブジェクト
 * @returns 表示されている場合は `true`
 */
export async function isPublicPost(postId: number, executor: Executor = db): Promise<boolean> {
  const rows = await executor
    .select({ id: publishedPostsView.id })
    .from(publishedPostsView)
    .where(eq(publishedPostsView.id, postId))
    .limit(1);
  return rows.length > 0;
}


/**
 * 記事の評価を集計する。
 *
 * @param postId - 投稿ID
 * @param executor - クエリを実行するオブジェクト
 * @returns 評価の集計
 */
export async function selectRatingSummary(postId: number, executor: Executor = db): Promise<RatingSummary> {
  const rows = await executor
    .select({ isPositive: postRatingsTable.isPositive, count: count() })
    .from(postRatingsTable)
    .where(eq(postRatingsTable.postId, postId))
    .groupBy(postRatingsTable.isPositive);
  return {
    positive: rows.find((row) => row.isPositive)?.count ?? 0,
    negative: rows.find((row) => !row.isPositive)?.count ?? 0,
  };
}


/**
 * 訪問者自身の評価を取得する。
 *
 * @param postId - 投稿ID
 * @param visitorId - 訪問者ID
 * @param executor - クエリを実行するオブジェクト
 * @returns 評価。評価していない場合は `null`
 */
export async function selectVisitorRating(
  postId: number,
  visitorId: string,
  executor: Executor = db,
): Promise<RatingValue | null> {
  const row = await executor
    .select({ isPositive: postRatingsTable.isPositive })
    .from(postRatingsTable)
    .where(and(eq(postRatingsTable.postId, postId), eq(postRatingsTable.visitorId, visitorId)))
    .limit(1)
    .then((result) => result.at(0));
  if (!row) {
    return null;
  }
  return row.isPositive ? 'positive' : 'negative';
}


/**
 * 記事のすべてのコメントを、スレッドごとにまとめて取得する（非表示にしたコメントを含む）。
 *
 * 公開ページで使用する場合は、非表示にしたコメントや公開しない情報を除くこと（`toPublicComments`）。
 *
 * @param postId - 投稿ID
 * @param executor - クエリを実行するオブジェクト
 * @returns 投稿日時の昇順（古い順）に並べたスレッド
 */
export async function selectComments(postId: number, executor: Executor = db): Promise<ManagedComment[]> {
  const rows = await executor
    .select({
      id: postCommentsTable.id,
      threadId: postCommentsTable.threadId,
      parentId: postCommentsTable.parentId,
      authorId: postCommentsTable.authorId,
      authorName: postCommentsTable.authorName,
      authorEmail: postCommentsTable.authorEmail,
      staffName: usersTable.name,
      staffDisplayName: usersTable.displayName,
      postAuthorId: postsTable.authorId,
      visitorId: postCommentsTable.visitorId,
      content: postCommentsTable.content,
      isHidden: postCommentsTable.isHidden,
      createdAt: postCommentsTable.createdAt,
      updatedAt: postCommentsTable.updatedAt,
    })
    .from(postCommentsTable)
    .innerJoin(postsTable, eq(postCommentsTable.postId, postsTable.id))
    .leftJoin(usersTable, eq(postCommentsTable.authorId, usersTable.id))
    .where(eq(postCommentsTable.postId, postId))
    .orderBy(asc(postCommentsTable.createdAt), asc(postCommentsTable.id));

  type Row = typeof rows[number];
  const toAuthor = (row: Row): ManagedCommentAuthor => (row.authorId === null
    ? { type: 'visitor', name: row.authorName, email: row.authorEmail ?? '', visitorId: row.visitorId ?? '' }
    : {
      type: 'staff',
      id: row.authorId,
      name: row.staffDisplayName || row.staffName || '',
      isPostAuthor: row.authorId === row.postAuthorId,
    });
  const toBase = (row: Row) => ({
    id: row.id,
    author: toAuthor(row),
    content: row.content,
    isHidden: row.isHidden,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // 保存時の誤差で作成日時と更新日時がずれることがあるため、1秒以上後に更新された場合のみ編集済みとする
    isEdited: row.updatedAt.getTime() - row.createdAt.getTime() >= 1000,
  });

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const repliesByThread = new Map<number, ManagedReply[]>();
  for (const row of rows) {
    if (row.threadId === null) {
      continue;
    }
    let replyTo: ManagedReply['replyTo'];
    if (row.parentId === null) {
      // 返信先が削除された
      replyTo = 'unavailable';
    } else if (row.parentId === row.threadId) {
      replyTo = null;
    } else {
      const target = rowsById.get(row.parentId);
      replyTo = target
        ? { id: target.id, authorName: getCommentAuthorName(toAuthor(target)), isHidden: target.isHidden }
        : 'unavailable';
    }
    repliesByThread.set(row.threadId, [...(repliesByThread.get(row.threadId) ?? []), { ...toBase(row), replyTo }]);
  }

  return rows
    .filter((row) => row.threadId === null)
    .map((row) => ({ ...toBase(row), replies: repliesByThread.get(row.id) ?? [] }));
}


/**
 * 返信先のコメントを取得する。
 *
 * @param postId - 投稿ID
 * @param commentId - 返信先のコメントID
 * @param executor - クエリを実行するオブジェクト
 * @returns 返信先が属するスレッドの起点のコメントID、返信先とスレッドが公開ページに表示されているかどうか。
 *          見つからない場合は `null`
 */
export async function findReplyTarget(
  postId: number,
  commentId: number,
  executor: Executor = db,
): Promise<{ threadId: number; isVisible: boolean } | null> {
  const thread = alias(postCommentsTable, 'thread');
  const target = await executor
    .select({
      threadId: postCommentsTable.threadId,
      isHidden: postCommentsTable.isHidden,
      isThreadHidden: thread.isHidden,
    })
    .from(postCommentsTable)
    .leftJoin(thread, eq(postCommentsTable.threadId, thread.id))
    .where(and(eq(postCommentsTable.id, commentId), eq(postCommentsTable.postId, postId)))
    .limit(1)
    .then((result) => result.at(0));
  if (!target) {
    return null;
  }
  return {
    threadId: target.threadId ?? commentId,
    isVisible: !target.isHidden && !target.isThreadHidden,
  };
}


/**
 * 記事ごとのコメント数を取得する。
 *
 * @param postId - 投稿ID（省略した場合はすべての記事）
 * @param executor - クエリを実行するオブジェクト
 * @returns 記事ごとの、訪問者のコメント数（返信を含む）と、返信が必要なスレッドの数（`needsReply` と同じ条件）。
 *          コメントがない記事は含まない
 */
export async function selectCommentCounts(
  postId?: number,
  executor: Executor = db,
): Promise<{ postId: number; commentCount: number; unrepliedCount: number }[]> {
  // スレッド内で表示中の最新のコメントが訪問者のものかどうか
  // NOTE: サブクエリ内のテーブルに別名を付け、外側の `post_comments` と区別する
  const latest = sql.raw('"latest"');
  const isLatestFromVisitor = sql.join([
    sql`(SELECT ${latest}."author_id" IS NULL FROM ${postCommentsTable} AS ${latest}`,
    sql`WHERE (${latest}."id" = ${postCommentsTable.id} OR ${latest}."thread_id" = ${postCommentsTable.id})`,
    sql`AND NOT ${latest}."is_hidden"`,
    sql`ORDER BY ${latest}."created_at" DESC, ${latest}."id" DESC LIMIT 1)`,
  ], sql` `);
  const needsReplyCondition = and(
    isNull(postCommentsTable.threadId),
    not(postCommentsTable.isHidden),
    isLatestFromVisitor,
  );
  return await executor
    .select({
      postId: postCommentsTable.postId,
      commentCount: sql<number>`COUNT(*) FILTER (WHERE ${isNull(postCommentsTable.authorId)})`.mapWith(Number),
      unrepliedCount: sql<number>`COUNT(*) FILTER (WHERE ${needsReplyCondition})`.mapWith(Number),
    })
    .from(postCommentsTable)
    .where(postId === undefined ? undefined : eq(postCommentsTable.postId, postId))
    .groupBy(postCommentsTable.postId);
}


/**
 * 訪問者が直近の一定期間に投稿したコメントの数を数える（連続投稿の制限に使用する）。
 *
 * @param visitorId - 訪問者ID
 * @param period - 数える期間（ms）
 * @param executor - クエリを実行するオブジェクト
 * @returns コメント数
 */
export async function countRecentVisitorComments(
  visitorId: string,
  period: number,
  executor: Executor = db,
): Promise<number> {
  const row = await executor
    .select({ count: count() })
    .from(postCommentsTable)
    .where(and(
      eq(postCommentsTable.visitorId, visitorId),
      gte(postCommentsTable.createdAt, new Date(Date.now() - period)),
    ))
    .then((result) => result.at(0));
  return row?.count ?? 0;
}
