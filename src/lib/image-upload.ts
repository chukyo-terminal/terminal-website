import sharp from 'sharp';

import { imagesTable } from '@/db/schema';
import { checkPermission, getCurrentUserId } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { imageInfoColumns } from '@/lib/image-queries';
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_FILE_SIZE, formatFileSize, normalizeFileName } from '@/lib/images';

import type { Metadata, Sharp } from 'sharp';
import type { ImageInfo, ImageMimeType } from '@/lib/images';
import type { ActionResult } from '@/types';


/**
 * 画像を保存できない理由を、利用者に表示するためのエラー。
 */
class ImageUploadError extends Error {}


/**
 * 保存する画像。
 */
type ProcessedImage = {
  data: Buffer;
  mimeType: ImageMimeType;
  width: number;
  height: number;
};


/**
 * sharp が判定した形式と、MIME タイプの対応（AVIF は HEIF として判定されるため、別に扱う）。
 */
const MIME_TYPES_BY_SHARP_FORMAT: Readonly<Partial<Record<string, ImageMimeType>>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};


/**
 * 画像の内容から形式を判定する。
 *
 * @param metadata - 画像のメタデータ
 * @returns MIME タイプ。対応していない形式の場合は `null`
 */
function detectMimeType(metadata: Metadata): ImageMimeType | null {
  if (metadata.format === 'heif') {
    return metadata.compression === 'av1' ? 'image/avif' : null;
  }
  return MIME_TYPES_BY_SHARP_FORMAT[metadata.format] ?? null;
}


/**
 * 画像が、位置情報などを含む可能性のあるメタデータを持っているかどうかを判定する。
 *
 * @param metadata - 画像のメタデータ
 * @returns 持っている場合は `true`
 */
function hasPrivateMetadata(metadata: Metadata): boolean {
  return !!(metadata.exif || metadata.xmp || metadata.iptc || metadata.comments?.length);
}


/**
 * 画像を元と同じ形式で書き出す設定を行う。
 *
 * @param pipeline - 画像の処理
 * @param mimeType - 形式
 * @returns 書き出しの設定を行った処理
 */
function encodeAs(pipeline: Sharp, mimeType: ImageMimeType): Sharp {
  switch (mimeType) {
    case 'image/jpeg': {
      return pipeline.jpeg({ quality: 85, mozjpeg: true });
    }
    case 'image/png': {
      return pipeline.png({ compressionLevel: 9 });
    }
    case 'image/gif': {
      return pipeline.gif();
    }
    case 'image/webp': {
      return pipeline.webp({ quality: 85 });
    }
    case 'image/avif': {
      return pipeline.avif({ quality: 60 });
    }
  }
}


/**
 * アップロードされた画像を検証し、保存する形に変換する。
 *
 * - 画像の内容から形式を判定する（ファイルの名前や、ブラウザが送信した MIME タイプは信用しない）
 * - 位置情報などのメタデータを除去する（書き出すと除去される）
 * - EXIF の向きの情報に従って回転させる（メタデータを除去すると向きの情報も失われるため）
 * - 大きすぎる画像は縮小する
 *
 * @param input - アップロードされたデータ
 * @param fileName - ファイルの名前（エラーメッセージに使う）
 * @returns 保存する画像
 */
async function processImage(input: Buffer, fileName: string): Promise<ProcessedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { animated: true }).metadata();
  } catch {
    throw new ImageUploadError(`「${fileName}」は画像として読み込めませんでした。`);
  }
  const mimeType = detectMimeType(metadata);
  if (!mimeType) {
    throw new ImageUploadError(metadata.format === 'heif'
      ? `「${fileName}」は HEIC 形式のため、アップロードできません。JPEG や PNG に変換してください。`
      : `「${fileName}」は対応していない形式です（JPEG・PNG・GIF・WebP・AVIF に対応しています）。`);
  }

  try {
    // アニメーション画像は、フレームを保つため、縮小せずにそのまま保存する。メタデータを含む場合のみ、書き出して除去する
    if ((metadata.pages ?? 1) > 1) {
      const data = hasPrivateMetadata(metadata)
        ? await encodeAs(sharp(input, { animated: true, failOn: 'error' }), mimeType).toBuffer()
        : input;
      return { data, mimeType, width: metadata.width, height: metadata.pageHeight ?? metadata.height };
    }

    const pipeline = sharp(input, { failOn: 'error' })
      .autoOrient()
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true });
    const { data, info } = await encodeAs(pipeline, mimeType).toBuffer({ resolveWithObject: true });

    // 変換する必要がない画像は、書き出すと大きくなる場合（減色した PNG など）は元のデータを保存する
    const needsConversion = (metadata.orientation ?? 1) !== 1
      || Math.max(metadata.width, metadata.height) > MAX_IMAGE_DIMENSION
      || hasPrivateMetadata(metadata);
    if (!needsConversion && input.length <= data.length) {
      return { data: input, mimeType, width: metadata.width, height: metadata.height };
    }
    return { data, mimeType, width: info.width, height: info.height };
  } catch (e) {
    console.warn('Failed to process image:', e);
    throw new ImageUploadError(`「${fileName}」を画像として処理できませんでした。ファイルが壊れていないか確認してください。`);
  }
}


/**
 * `FormData` の `file` に設定された画像を検証・変換して保存する。画像をアップロードする Server Action から呼び出す。
 *
 * @param formData - 画像のファイルを `file` に設定した `FormData`
 * @returns 保存した画像の情報
 */
export async function saveUploadedImage(formData: FormData): Promise<ActionResult<ImageInfo>> {
  const permissionError = await checkPermission('user');
  if (permissionError) {
    return { ok: false, error: permissionError };
  }
  const file = formData instanceof FormData ? formData.get('file') : null;
  if (!(file instanceof File)) {
    return { ok: false, error: 'ファイルが選択されていません。' };
  }
  const fileName = normalizeFileName(file.name);
  if (file.size === 0) {
    return { ok: false, error: `「${fileName}」は空のファイルです。` };
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return { ok: false, error: `「${fileName}」は大きすぎます（${formatFileSize(MAX_IMAGE_FILE_SIZE)}まで）。` };
  }

  try {
    const image = await processImage(Buffer.from(await file.arrayBuffer()), fileName);
    const [saved] = await db
      .insert(imagesTable)
      .values({
        fileName,
        mimeType: image.mimeType,
        size: image.data.length,
        width: image.width,
        height: image.height,
        data: image.data,
        uploadedBy: await getCurrentUserId(),
      })
      .returning(imageInfoColumns);
    return { ok: true, data: saved };
  } catch (e) {
    if (e instanceof ImageUploadError) {
      return { ok: false, error: e.message };
    }
    console.error('Failed to save image:', e);
    return { ok: false, error: `「${fileName}」のアップロードに失敗しました。` };
  }
}
