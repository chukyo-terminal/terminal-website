/**
 * 記事に掲載する画像に関する型とユーティリティ。
 *
 * サーバーとブラウザの両方で使用できるよう、データベースや画像処理のライブラリには依存しない。
 */

import type { ActionResult } from '@/types';


/**
 * アップロードできる画像の形式（MIME タイプと拡張子）。
 *
 * SVG はスクリプトを埋め込めるため、対応しない。
 */
export const IMAGE_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
} as const;


/**
 * アップロードできる画像の MIME タイプ。
 */
export type ImageMimeType = keyof typeof IMAGE_FORMATS;


/**
 * ファイル選択欄の `accept` 属性に指定する値。
 */
export const IMAGE_ACCEPT = Object.keys(IMAGE_FORMATS).join(',');


/**
 * アップロードできるファイルの最大サイズ（バイト）。
 *
 * 変更する場合は、`next.config.ts` の Server Action のリクエストの大きさの上限も合わせて変更すること。
 */
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;


/**
 * 保存する画像の最大の幅・高さ（px）。これより大きい画像は、縦横比を保って縮小する。
 */
export const MAX_IMAGE_DIMENSION = 2560;


/**
 * 一度にアップロードできるファイルの数。
 */
export const MAX_IMAGE_FILES_PER_UPLOAD = 10;


/**
 * 同時に送信するファイルの数。
 */
const UPLOAD_CONCURRENCY = 3;


/**
 * アップロードされたファイルの名前の最大文字数。
 */
const MAX_FILE_NAME_LENGTH = 200;


/**
 * 画像の情報（データを除く）。
 */
export type ImageInfo = {
  id: string;
  /** アップロードされたファイルの名前 */
  fileName: string;
  mimeType: ImageMimeType;
  /** データの大きさ（バイト） */
  size: number;
  width: number;
  height: number;
  /** アップロード日時 */
  createdAt: Date;
};


/**
 * 画像を使用している記事。
 */
export type ImageUsage = {
  postId: number;
  /** 記事の最新の版のタイトル */
  title: string;
  /** 最新の版（下書きを含む）で使用しているかどうか（`false` の場合は、過去の版でのみ使用している） */
  isInLatestVersion: boolean;
};


/**
 * 管理画面で扱う画像（アップロードしたユーザーと、使用している記事を含む）。
 */
export type ManagedImage = ImageInfo & {
  /** アップロードしたユーザーの表示名（ユーザーが削除された場合は `null`） */
  uploaderName: string | null;
  /** 画像を使用している記事 */
  usages: ImageUsage[];
};


/**
 * 画像をアップロードする Server Action。
 *
 * `FormData` の `file` にファイルを1つ設定して呼び出す。
 */
export type UploadImageAction<T extends ImageInfo = ImageInfo> = (formData: FormData) => Promise<ActionResult<T>>;


/**
 * 画像の UUID のパターン（小文字のみ）。
 */
const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;


/**
 * 本文に含まれる画像の URL のパスのパターン（PostgreSQL の正規表現。1番目のグループが画像ID）。
 *
 * 絶対 URL（`https://…/images/{id}`）で書かれている場合も一致する。
 */
export const IMAGE_PATH_PATTERN_SQL = '/images/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';


/**
 * 画像IDが正しい形式であるかを検証する。
 *
 * @param id - 検証する値
 * @returns 正しい形式の場合は `true`
 */
export function isValidImageId(id: unknown): id is string {
  return typeof id === 'string' && IMAGE_ID_PATTERN.test(id);
}


/**
 * 画像を公開する URL のパスを返す。
 *
 * @param id - 画像ID
 * @returns URL のパス（例: `/images/0b6c…`）
 */
export const getImagePath = (id: string): string => `/images/${id}`;


/**
 * 対応している画像の形式であるかを判定する。
 *
 * @param mimeType - MIME タイプ
 * @returns 対応している場合は `true`
 */
export function isImageMimeType(mimeType: string): mimeType is ImageMimeType {
  return Object.hasOwn(IMAGE_FORMATS, mimeType);
}


/**
 * ファイルサイズを読みやすい形式にする。
 *
 * @param bytes - バイト数
 * @returns フォーマット済みのサイズ（例: `1.2 MB`）
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}


/**
 * アップロードされたファイルの名前を整える。制御文字を除き、長すぎる場合は拡張子を残して切り詰める。
 *
 * @param name - ファイルの名前
 * @returns 整えた名前。空の場合は `image`
 */
export function normalizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replaceAll(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '').replaceAll(/[/\\]/g, '_').trim();
  const characters = [...cleaned];
  if (characters.length <= MAX_FILE_NAME_LENGTH) {
    return cleaned || 'image';
  }
  const extension = /\.[^.]{1,10}$/.exec(cleaned)?.[0] ?? '';
  return characters.slice(0, MAX_FILE_NAME_LENGTH - extension.length).join('') + extension;
}


/**
 * ファイルの名前から拡張子を除いた部分を返す。
 *
 * @param name - ファイルの名前
 * @returns 拡張子を除いた名前
 */
export const getFileNameStem = (name: string): string => name.replace(/\.[^.]+$/, '') || name;


/**
 * アップロードする前に、ファイルの形式とサイズを検証する（内容はサーバーで改めて検証する）。
 *
 * @param file - ファイル
 * @returns エラーメッセージ。問題がない場合は `null`
 */
export function validateImageFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return `「${file.name}」は HEIC 形式のため、アップロードできません。JPEG や PNG に変換してください。`;
  }
  if (!isImageMimeType(file.type)) {
    return `「${file.name}」は対応していない形式です（JPEG・PNG・GIF・WebP・AVIF に対応しています）。`;
  }
  if (file.size === 0) {
    return `「${file.name}」は空のファイルです。`;
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return `「${file.name}」は大きすぎます（${formatFileSize(MAX_IMAGE_FILE_SIZE)}まで）。`;
  }
  return null;
}


/**
 * Markdown の画像の代替テキストに使えるよう、文字列をエスケープする。
 *
 * @param text - 代替テキスト
 * @returns エスケープした代替テキスト
 */
export const escapeMarkdownAlt = (text: string): string => text
  .replaceAll(/\s+/g, ' ')
  .replaceAll(/[\\[\]]/g, String.raw`\$&`)
  .trim();


/**
 * 画像を表示する Markdown を生成する。
 *
 * @param image - 画像（代替テキストには、ファイルの名前から拡張子を除いたものを使う）
 * @returns Markdown（例: `![photo](/images/0b6c…)`）
 */
export const toImageMarkdown = (image: Pick<ImageInfo, 'id' | 'fileName'>): string => (
  `![${escapeMarkdownAlt(getFileNameStem(image.fileName))}](${getImagePath(image.id)})`
);


/**
 * ファイルを1つずつ `FormData` に設定して、画像をアップロードする Server Action を呼び出す。
 *
 * サーバーの負荷を抑えるため、同時に送信するファイルの数を制限する。
 *
 * @param files - アップロードするファイル
 * @param upload - 画像をアップロードする Server Action
 * @param onSettled - ファイルごとに、アップロードが終わったときに呼ばれる（通信に失敗した場合もエラーとして呼ばれる）
 */
export async function uploadImageFiles<T extends ImageInfo>(
  files: readonly File[],
  upload: UploadImageAction<T>,
  onSettled: (file: File, result: ActionResult<T>) => void,
): Promise<void> {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < files.length) {
      const file = files[nextIndex++];
      const formData = new FormData();
      formData.set('file', file);
      let result: ActionResult<T>;
      try {
        result = await upload(formData);
      } catch (e) {
        console.error('Failed to upload image:', e);
        result = { ok: false, error: `「${file.name}」をアップロードできませんでした。通信状況を確認してください。` };
      }
      onSettled(file, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
}
