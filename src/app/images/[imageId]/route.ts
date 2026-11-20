import { eq } from 'drizzle-orm';

import { imagesTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { IMAGE_FORMATS, getFileNameStem, isValidImageId } from '@/lib/images';

export const dynamic = 'force-dynamic';


/**
 * 画像のキャッシュの設定。
 *
 * 同じIDの画像の内容は変わらないが、削除した画像がいつまでも表示されないよう、キャッシュする期間は短めにする。
 */
const CACHE_CONTROL = 'public, max-age=86400';


/**
 * 画像が見つからない場合のレスポンスを返す。
 *
 * @returns 404 のレスポンス
 */
const notFound = (): Response => new Response('Not Found', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});


/**
 * `Content-Disposition` ヘッダーの値を生成する。
 *
 * @param fileName - ファイルの名前
 * @returns ヘッダーの値
 */
function toContentDisposition(fileName: string): string {
  // filename* に対応していないクライアントのために、ASCII 文字だけの名前も指定する
  const asciiFileName = fileName.replaceAll(/[^\u0020-\u007E]|["\\]/g, '_');
  return `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}


/**
 * アップロードされた画像を返す。
 *
 * @param request - リクエスト
 * @param context - ルートのパラメータ
 * @returns 画像のレスポンス
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> },
): Promise<Response> {
  const { imageId } = await params;
  if (!isValidImageId(imageId)) {
    return notFound();
  }

  // 画像の内容は変わらないため、IDを ETag として使い、キャッシュが有効な場合はデータを読み込まずに返す
  const etag = `"${imageId}"`;
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) {
    const exists = await db
      .select({ id: imagesTable.id })
      .from(imagesTable)
      .where(eq(imagesTable.id, imageId))
      .limit(1);
    if (exists.length > 0) {
      return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': CACHE_CONTROL } });
    }
  }

  const image = await db
    .select({ data: imagesTable.data, mimeType: imagesTable.mimeType, fileName: imagesTable.fileName })
    .from(imagesTable)
    .where(eq(imagesTable.id, imageId))
    .limit(1)
    .then((result) => result.at(0));
  if (!image) {
    return notFound();
  }

  // 保存時に形式を変換していなくても、ファイルの名前の拡張子は実際の形式に合わせる
  const fileName = `${getFileNameStem(image.fileName)}.${IMAGE_FORMATS[image.mimeType]}`;
  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.mimeType,
      'Content-Length': String(image.data.length),
      'Content-Disposition': toContentDisposition(fileName),
      'Cache-Control': CACHE_CONTROL,
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'default-src \'none\'; sandbox',
    },
  });
}
