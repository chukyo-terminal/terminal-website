import { z } from 'zod';


/**
 * 分類名の最大文字数。
 */
export const FAQ_CATEGORY_TITLE_MAX_LENGTH = 50;


/**
 * 質問の最大文字数。
 */
export const FAQ_QUESTION_MAX_LENGTH = 200;


/**
 * 回答の最大文字数。
 */
export const FAQ_ANSWER_MAX_LENGTH = 5000;


/**
 * 管理画面で扱うQ&A。
 */
export type ManagedFaq = {
  id: number;
  categoryId: number;
  question: string;
  /** 回答（Markdown形式） */
  answer: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 管理画面で扱う分類。Q&Aを表示順に並べて含む。
 */
export type ManagedFaqCategory = {
  id: number;
  title: string;
  faqs: ManagedFaq[];
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 追加・編集したQ&Aまたは分類のIDと、操作後のすべての分類。
 */
export type FaqMutationResult = {
  id: number;
  categories: ManagedFaqCategory[];
};


/**
 * 分類の追加・編集フォームの入力値のスキーマ定義。
 */
export const FaqCategoryFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '分類名を入力してください。')
    .max(FAQ_CATEGORY_TITLE_MAX_LENGTH, `分類名は${FAQ_CATEGORY_TITLE_MAX_LENGTH}文字以内で入力してください。`),
});


/**
 * 分類の追加・編集フォームの入力値。
 */
export type FaqCategoryFormValues = z.input<typeof FaqCategoryFormSchema>;


/**
 * Q&Aの追加・編集フォームの入力値のスキーマ定義。
 */
export const FaqFormSchema = z.object({
  categoryId: z.number('分類を選択してください。').int().positive('分類を選択してください。'),
  question: z
    .string()
    .trim()
    .min(1, '質問を入力してください。')
    .max(FAQ_QUESTION_MAX_LENGTH, `質問は${FAQ_QUESTION_MAX_LENGTH}文字以内で入力してください。`),
  answer: z
    .string()
    .trim()
    .min(1, '回答を入力してください。')
    .max(FAQ_ANSWER_MAX_LENGTH, `回答は${FAQ_ANSWER_MAX_LENGTH}文字以内で入力してください。`),
  isPrivate: z.boolean(),
});


/**
 * Q&Aの追加・編集フォームの入力値。
 */
export type FaqFormValues = z.input<typeof FaqFormSchema>;


/**
 * 並べ替え後のIDの一覧のスキーマ定義。
 */
export const FaqOrderSchema = z
  .array(z.number().int().positive())
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length);


/**
 * 並べ替え後のIDの一覧が、現在のIDの一覧と同じ要素からなるかどうかを判定する。
 *
 * @param currentIds - 現在のIDの一覧
 * @param orderedIds - 並べ替え後のIDの一覧（重複がないこと）
 * @returns 同じ要素からなる場合は `true`
 */
export function hasSameIds(currentIds: readonly number[], orderedIds: readonly number[]): boolean {
  const current = new Set(currentIds);
  return current.size === orderedIds.length && orderedIds.every((id) => current.has(id));
}


/**
 * 配列の要素を、指定した方向に1つ移動する。
 *
 * @param items - 配列
 * @param index - 移動する要素の位置
 * @param offset - 移動する方向（`-1` は前、`1` は後ろ）
 * @returns 移動後の配列。移動できない場合は `null`
 */
export function moveItem<T>(items: readonly T[], index: number, offset: -1 | 1): T[] | null {
  const destination = index + offset;
  if (index < 0 || index >= items.length || destination < 0 || destination >= items.length) {
    return null;
  }
  const moved = [...items];
  [moved[index], moved[destination]] = [moved[destination], moved[index]];
  return moved;
}


/**
 * 回答の Markdown を、一覧に表示する短いプレーンテキストに変換する。
 *
 * @param markdown - 回答（Markdown形式）
 * @returns リンクや強調などの記法を取り除き、空白をまとめたテキスト
 */
export function toAnswerExcerpt(markdown: string): string {
  return markdown
    // 画像・リンクは、表示するテキストのみを残す
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行頭の見出し・引用・リストの記号
    .replaceAll(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    // 強調・コードの記号
    .replaceAll(/[*_`~]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
