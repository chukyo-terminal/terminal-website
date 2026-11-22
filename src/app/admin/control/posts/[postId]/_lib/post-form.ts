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
 * タグ名の最大文字数。
 */
export const TAG_NAME_MAX_LENGTH = 30;


/**
 * 1つの記事に設定できるタグの最大数。
 */
export const MAX_TAGS_PER_POST = 10;


/**
 * 記事に設定するタグ（スラッグで識別する）。
 */
export const PostTagSchema = z.object({
  name: z.string(),
  slug: z.string(),
});


/**
 * 記事編集フォームの値の形式（入力途中の値も許容する）。
 */
export const PostFormValuesSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  isPrivate: z.boolean(),
  tags: z.array(PostTagSchema),
  content: z.string(),
});


/**
 * 保存時に検証する記事編集フォームのスキーマ。
 */
export const PostFormSchema = PostFormValuesSchema.extend({
  title: z.string().refine((value) => isNotEmptyString(value), 'タイトルを入力してください。'),
  slug: z.string().regex(SLUG_PATTERN, 'スラッグは半角英小文字・数字・ハイフンで入力してください（先頭と末尾のハイフンは不可）。'),
  tags: z
    .array(PostTagSchema.extend({
      name: z
        .string()
        .refine((value) => isNotEmptyString(value), 'タグ名を入力してください。')
        .refine((value) => value.length <= TAG_NAME_MAX_LENGTH, `タグ名は${TAG_NAME_MAX_LENGTH}文字以内で入力してください。`),
      slug: z.string().regex(SLUG_PATTERN, 'タグのスラッグは半角英小文字・数字・ハイフンで入力してください。'),
    }))
    .max(MAX_TAGS_PER_POST, `タグは${MAX_TAGS_PER_POST}個まで設定できます。`)
    .refine((tags) => new Set(tags.map((tag) => tag.slug)).size === tags.length, '同じタグが重複しています。'),
});


/**
 * 記事編集フォームの値。
 */
export type PostFormValues = z.infer<typeof PostFormValuesSchema>;


/**
 * 記事に設定するタグ。
 */
export type PostTag = z.infer<typeof PostTagSchema>;


/**
 * タグの入力候補（既存のタグ）。
 */
export type TagOption = PostTag & {
  /** このタグが設定されている記事の数 */
  postCount: number;
};


export type { PostStatus } from '../../_lib/post-status';


/**
 * 保存処理の結果。
 */
export type SaveResult =
  | {
    ok: true;
    savedAt: Date;
    /** 内容の変更により、公開予約を取り消したかどうか */
    isScheduleCanceled: boolean;
    /** 内容の変更により、審査中・承認済みのレビューを取り消したかどうか */
    isReviewInvalidated: boolean;
  }
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
 * 2つのタグの一覧が（順序を問わず）等しいかどうかを判定する。
 *
 * @param a - 比較する一覧
 * @param b - 比較する一覧
 * @returns 等しい場合は `true`
 */
export function isSameTags(a: readonly PostTag[], b: readonly PostTag[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const names = new Map(a.map((tag) => [tag.slug, tag.name]));
  return b.every((tag) => names.get(tag.slug) === tag.name);
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
    && isSameTags(a.tags, b.tags)
    && a.content === b.content;
}
