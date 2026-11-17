import { z } from 'zod';

import { isNotEmptyString } from '@/utils/string';


/**
 * スラッグとして許可する形式（数字・小文字の英字・ハイフン。先頭と末尾のハイフンは不可）。
 *
 * `posts` テーブルの `valid_slug` 制約と同じ条件。
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;


/**
 * 説明文の推奨最大文字数（検索結果や SNS で省略されずに表示されやすい長さの目安）。
 */
export const RECOMMENDED_DESCRIPTION_LENGTH = 120;


/**
 * 記事編集フォームの値の形式（入力途中の値も許容する）。
 */
export const PostFormValuesSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  isPrivate: z.boolean(),
  content: z.string(),
});


/**
 * 保存時に検証する記事編集フォームのスキーマ。
 */
export const PostFormSchema = PostFormValuesSchema.extend({
  title: z.string().refine((value) => isNotEmptyString(value), 'タイトルを入力してください。'),
  slug: z.string().regex(SLUG_PATTERN, 'スラッグは半角英小文字・数字・ハイフンで入力してください（先頭と末尾のハイフンは不可）。'),
});


/**
 * 記事編集フォームの値。
 */
export type PostFormValues = z.infer<typeof PostFormValuesSchema>;


/**
 * 記事の公開状態。
 *
 * - `draft`: 一度も公開されていない
 * - `published`: 最新の内容が公開されている
 * - `published-with-draft`: 公開済みだが、公開されていない変更（下書き）がある
 */
export type PostStatus = 'draft' | 'published' | 'published-with-draft';


/**
 * 保存処理の結果。
 */
export type SaveResult =
  | { ok: true; savedAt: Date }
  | { ok: false; error: string };


/**
 * 公開処理の結果。
 */
export type PublishResult =
  | {
    ok: true;
    /** 公開年度（記事 URL に含まれる） */
    year: number;
    slug: string;
    title: string;
    description: string | null;
    /** 初回の公開かどうか */
    isFirstPublication: boolean;
  }
  | { ok: false; error: string };


/**
 * 説明文を正規化する。空白のみの場合は `null` とする。
 *
 * @param description - 説明文
 * @returns 正規化した説明文
 */
export function normalizeDescription(description: string | null): string | null {
  return isNotEmptyString(description) ? description : null;
}


/**
 * 2つのフォームの値が（保存内容として）等しいかどうかを判定する。
 *
 * @param a - 比較する値
 * @param b - 比較する値
 * @returns 等しい場合は `true`
 */
export function isSamePostFormValues(a: PostFormValues, b: PostFormValues): boolean {
  return a.title === b.title
    && normalizeDescription(a.description) === normalizeDescription(b.description)
    && a.slug === b.slug
    && a.isPrivate === b.isPrivate
    && a.content === b.content;
}
