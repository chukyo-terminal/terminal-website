import { z } from 'zod';

import { CU_ID_PATTERN } from '@/utils/cu-id';
import { trimUnprintableCharacters } from '@/utils/string';


/**
 * ユーザーに付与できるロール。
 */
export const USER_ROLES = ['ADMIN', 'REVIEWER', 'CONTRIBUTOR'] as const;


/**
 * ユーザーのロール。
 */
export type UserRole = (typeof USER_ROLES)[number];


/**
 * 管理画面で扱うユーザー（一般管理者）。
 */
export type User = {
  id: number;
  cuId: string;
  name: string;
  displayName: string | null;
  email: string | null;
  roles: UserRole[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 管理画面で扱う上級管理者。
 */
export type Sudoer = {
  id: number;
  createdAt: Date;
};


/**
 * 空文字列（印刷できない文字のみの場合を含む）を `null` に変換するスキーマ定義。
 */
const NullableStringSchema = z
  .string()
  .nullable()
  .transform((value) => trimUnprintableCharacters(value) || null);


/**
 * 空でない文字列のスキーマ定義。
 */
function nonEmptyString(message: string) {
  return z.string().transform((value) => trimUnprintableCharacters(value) ?? '').pipe(z.string().min(1, message));
}


/**
 * ユーザーの追加フォームの入力値のスキーマ定義。
 *
 * 氏名とメールアドレスは LDAP の会員情報から取得するため、入力は学籍番号（CU_ID）のみ。
 */
export const UserCreateFormSchema = z.object({
  cuId: nonEmptyString('CU_IDを入力してください。')
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(CU_ID_PATTERN, 'CU_IDの形式が正しくありません。')),
  roles: z.array(z.enum(USER_ROLES)),
});


/**
 * ユーザーの追加フォームの入力値。
 */
export type UserCreateFormValues = z.input<typeof UserCreateFormSchema>;


/**
 * ユーザーの編集フォームの入力値のスキーマ定義。
 *
 * 氏名とメールアドレスは LDAP で管理するため、編集できるのは表示名・ロール・有効性のみ。
 */
export const UserUpdateFormSchema = z.object({
  displayName: NullableStringSchema,
  roles: z.array(z.enum(USER_ROLES)),
  isActive: z.boolean(),
});


/**
 * ユーザーの編集フォームの入力値。
 */
export type UserUpdateFormValues = z.input<typeof UserUpdateFormSchema>;
