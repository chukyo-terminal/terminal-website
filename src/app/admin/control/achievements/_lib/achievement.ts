import { z } from 'zod';


/**
 * 管理画面で扱う実績。
 */
export type Achievement = {
  id: number;
  title: string;
  description: string | null;
  post: { id: number; slug: string } | null;
  /** 設定日（UTCの0時） */
  date: Date;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 実績の追加・編集フォームの入力値のスキーマ定義。
 */
export const AchievementFormSchema = z.object({
  title: z.string().trim().min(1, 'タイトルを入力してください。'),
  description: z.string().trim().min(1, '説明を入力してください。'),
  /** YYYY-MM-DD */
  date: z.iso.date('日付が正しくありません。'),
});


/**
 * 実績の追加・編集フォームの入力値。
 */
export type AchievementFormValues = z.input<typeof AchievementFormSchema>;


/**
 * 日付をinput[type="date"]向けの文字列（YYYY-MM-DD）に整形する。
 *
 * @param date - 日付（UTCの0時）
 * @returns 整形した文字列
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}
