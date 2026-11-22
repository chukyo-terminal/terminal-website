import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';

import { postContentsTable, postsTable } from '@/db/schema';
import { getFiscalYear } from '@/utils/date';

import type { db } from '@/lib/drizzle';


/**
 * トランザクション内でクエリを実行するオブジェクト。
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];


/**
 * 投稿が初めて公開された日時を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @returns 初めて公開された日時。未公開の場合は `null`
 */
export async function getFirstPublishedAt(executor: Pick<Transaction, 'select'>, postId: number): Promise<Date | null> {
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
 * 版を公開する。公開日時を設定し、公開予約は解除する。
 *
 * 記事の URL の年度は初回の公開日時で決まるため、公開年度は初回の公開時に確定させ、更新の公開では変更しない。
 *
 * @param tx - トランザクション
 * @param postId - 投稿ID
 * @param identifier - 版の識別子
 * @param publishedAt - 公開日時（公開予約の時刻に公開する場合は、その時刻）
 * @returns 記事の公開年度と、初回の公開かどうか
 */
export async function publishPostVersion(
  tx: Transaction,
  postId: number,
  identifier: number,
  publishedAt: Date,
): Promise<{ year: number; isFirstPublication: boolean }> {
  const firstPublishedAt = await getFirstPublishedAt(tx, postId);
  const post = await tx
    .select({ year: postsTable.year })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1)
    .then((rows) => rows.at(0));

  await tx
    .update(postContentsTable)
    .set({ publishedAt, scheduledPublishAt: null })
    .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, identifier)));

  if (post?.year === null) {
    const year = getFiscalYear(firstPublishedAt ?? publishedAt);
    await tx
      .update(postsTable)
      .set({ year })
      .where(and(eq(postsTable.id, postId), isNull(postsTable.year)));
    return { year, isFirstPublication: firstPublishedAt === null };
  }
  return { year: post?.year ?? getFiscalYear(publishedAt), isFirstPublication: firstPublishedAt === null };
}
