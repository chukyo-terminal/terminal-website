import { desc, eq, sql } from 'drizzle-orm';

import { imagesTable, postContentsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { IMAGE_PATH_PATTERN_SQL, getImagePath } from '@/utils/images';

import type { ImageUsage, ManagedImage } from '@/utils/images';


/**
 * 画像の情報（データを除く）を取得する列。
 *
 * 画像のデータは大きいため、一覧などでは `imagesTable` のすべての列を取得せず、この列を指定すること。
 */
export const imageInfoColumns = {
  id: imagesTable.id,
  fileName: imagesTable.fileName,
  mimeType: imagesTable.mimeType,
  size: imagesTable.size,
  width: imagesTable.width,
  height: imagesTable.height,
  createdAt: imagesTable.createdAt,
};


/**
 * 記事の本文（過去の版を含む）に含まれる画像の URL から、画像を使用している記事を取得する。
 *
 * @param imageId - 画像ID（指定しない場合は、すべての画像について取得する）
 * @returns 画像IDごとの、画像を使用している記事（新しい記事の順）
 */
export async function selectImageUsages(imageId?: string): Promise<Map<string, ImageUsage[]>> {
  // 画像を指定した場合は、本文にその画像の URL を含む版だけを調べる
  const filter = imageId === undefined
    ? sql``
    : sql`WHERE STRPOS(${postContentsTable.content}, ${getImagePath(imageId)}) > 0 AND matches[1] = ${imageId}`;
  const result = await db.execute<{
    image_id: string;
    post_id: number;
    title: string;
    is_in_latest_version: boolean;
  }>(sql`
    WITH image_references AS (
      SELECT DISTINCT
        ${postContentsTable.postId} AS post_id,
        ${postContentsTable.identifier} AS identifier,
        matches[1] AS image_id
      FROM ${postContentsTable}
      CROSS JOIN LATERAL REGEXP_MATCHES(${postContentsTable.content}, ${IMAGE_PATH_PATTERN_SQL}, 'g') AS matches
      ${filter}
    ),
    latest_contents AS (
      SELECT DISTINCT ON (${postContentsTable.postId})
        ${postContentsTable.postId} AS post_id,
        ${postContentsTable.identifier} AS identifier,
        ${postContentsTable.title} AS title
      FROM ${postContentsTable}
      ORDER BY ${postContentsTable.postId}, ${postContentsTable.identifier} DESC
    )
    SELECT
      image_references.image_id,
      image_references.post_id,
      latest_contents.title,
      BOOL_OR(image_references.identifier = latest_contents.identifier) AS is_in_latest_version
    FROM image_references
    INNER JOIN latest_contents ON latest_contents.post_id = image_references.post_id
    GROUP BY image_references.image_id, image_references.post_id, latest_contents.title
    ORDER BY image_references.post_id DESC
  `);

  const usages = new Map<string, ImageUsage[]>();
  for (const row of result.rows) {
    const usage: ImageUsage = {
      postId: Number(row.post_id),
      title: row.title,
      isInLatestVersion: row.is_in_latest_version,
    };
    usages.set(row.image_id, [...(usages.get(row.image_id) ?? []), usage]);
  }
  return usages;
}


/**
 * 画像を、アップロードしたユーザーと使用している記事とともに取得する。
 *
 * @param imageId - 画像ID（指定しない場合は、すべての画像を取得する）
 * @returns 新しい順に並べた画像
 */
export async function selectManagedImages(imageId?: string): Promise<ManagedImage[]> {
  const [images, usages] = await Promise.all([
    db
      .select({
        ...imageInfoColumns,
        uploaderName: usersTable.name,
        uploaderDisplayName: usersTable.displayName,
      })
      .from(imagesTable)
      .leftJoin(usersTable, eq(imagesTable.uploadedBy, usersTable.id))
      .where(imageId === undefined ? undefined : eq(imagesTable.id, imageId))
      .orderBy(desc(imagesTable.createdAt)),
    selectImageUsages(imageId),
  ]);
  return images.map(({ uploaderName, uploaderDisplayName, ...image }) => ({
    ...image,
    uploaderName: uploaderDisplayName || uploaderName,
    usages: usages.get(image.id) ?? [],
  }));
}
