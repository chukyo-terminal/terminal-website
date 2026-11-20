import { asc, eq } from 'drizzle-orm';

import { postContentsTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { numberPostVersions } from '@/utils/post-versions';

import type { PostVersion } from '@/utils/post-versions';


/**
 * クエリを実行するオブジェクト（`db` またはトランザクション）。
 */
type Executor = Pick<typeof db, 'select'>;


/**
 * 記事のすべての版を取得する（非公開にした版や、未公開の版（下書き）を含む）。
 *
 * 公開ページで使用する場合は、`isPublicVersion` で表示できる版に絞り込むこと。
 *
 * @param postId - 投稿ID
 * @param executor - クエリを実行するオブジェクト
 * @returns 識別子の昇順（古い順）に並べた版
 */
export async function selectPostVersions(postId: number, executor: Executor = db): Promise<PostVersion[]> {
  const rows = await executor
    .select({
      identifier: postContentsTable.identifier,
      title: postContentsTable.title,
      description: postContentsTable.description,
      content: postContentsTable.content,
      isPrivate: postContentsTable.isPrivate,
      publishedAt: postContentsTable.publishedAt,
      createdAt: postContentsTable.createdAt,
      updatedAt: postContentsTable.updatedAt,
    })
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postId))
    .orderBy(asc(postContentsTable.identifier));
  return numberPostVersions(rows);
}
