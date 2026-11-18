import { DrizzleQueryError, asc, eq } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import UserManager from './_components/user-manager';
import { UserCreateFormSchema, UserUpdateFormSchema } from './_lib/user';
import { sudoersTable, usersTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';
import type { SQL } from 'drizzle-orm';
import type { Sudoer, User, UserCreateFormValues, UserUpdateFormValues } from './_lib/user';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * ユーザーを取得する。
 *
 * @param where - 絞り込み条件
 * @returns ID順に並べたユーザー
 */
async function selectUsers(where?: SQL): Promise<User[]> {
  return await db
    .select({
      id: usersTable.id,
      cuId: usersTable.cuId,
      name: usersTable.name,
      displayName: usersTable.displayName,
      email: usersTable.email,
      roles: usersTable.roles,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(where)
    .orderBy(asc(usersTable.id));
}


/**
 * データベースの制約違反のエラーの場合に、エラーコードと違反した制約の名前を返す。
 *
 * @param e - エラー
 * @returns エラーコードと制約の名前（データベースのエラーでない場合は `null`）
 */
function getDatabaseError(e: unknown): { code: string | undefined; constraint: string | undefined } | null {
  if (e instanceof DrizzleQueryError && e.cause instanceof DatabaseError) {
    return { code: e.cause.code, constraint: e.cause.constraint };
  }
  return null;
}


/**
 * IDが正しい形式であるかを検証する。
 *
 * @param id - 検証する値
 * @returns 正の整数であれば `true`
 */
function isValidId(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) > 0;
}


export default async function RootControlPage(): Promise<JSX.Element> {
  const [users, sudoers] = await Promise.all([
    selectUsers(),
    db
      .select({ id: sudoersTable.id, createdAt: sudoersTable.createdAt })
      .from(sudoersTable)
      .orderBy(asc(sudoersTable.id)),
  ]);

  async function createSudoer(userId: number): Promise<ActionResult<Sudoer>> {
    'use server';
    const permissionError = await checkPermission('root');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(userId)) {
      return { ok: false, error: 'ユーザーIDが正しくありません。' };
    }
    try {
      const [sudoer] = await db
        .insert(sudoersTable)
        .values({ id: userId })
        .returning({ id: sudoersTable.id, createdAt: sudoersTable.createdAt });
      return { ok: true, data: sudoer };
    } catch (e) {
      switch (getDatabaseError(e)?.code) {
        case PostgresError.UNIQUE_VIOLATION: {
          return { ok: false, error: '既に上級管理者に登録されています。' };
        }
        case PostgresError.FOREIGN_KEY_VIOLATION: {
          return { ok: false, error: 'ユーザーが見つかりませんでした。' };
        }
        default: {
          console.error('Failed to create sudoer:', e);
          return { ok: false, error: '上級管理者の追加に失敗しました。' };
        }
      }
    }
  }

  async function deleteSudoer(userId: number): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('root');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(userId)) {
      return { ok: false, error: 'ユーザーIDが正しくありません。' };
    }
    try {
      await db.delete(sudoersTable).where(eq(sudoersTable.id, userId));
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete sudoer:', e);
      return { ok: false, error: '上級管理者の削除に失敗しました。' };
    }
  }

  async function createUser(values: UserCreateFormValues): Promise<ActionResult<User>> {
    'use server';
    const permissionError = await checkPermission('root');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = UserCreateFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const [{ id }] = await db
        .insert(usersTable)
        .values(parsed.data)
        .returning({ id: usersTable.id });
      const [user] = await selectUsers(eq(usersTable.id, id));
      return { ok: true, data: user };
    } catch (e) {
      const error = getDatabaseError(e);
      if (error?.code === PostgresError.UNIQUE_VIOLATION && error.constraint === 'users_cu_id_unique') {
        return { ok: false, error: `CU_ID「${parsed.data.cuId}」のユーザーは既に存在します。` };
      }
      if (error?.code === PostgresError.CHECK_VIOLATION && error.constraint === 'valid_cu_id') {
        return { ok: false, error: 'CU_IDの形式が正しくありません。' };
      }
      console.error('Failed to create user:', e);
      return { ok: false, error: '一般管理者の追加に失敗しました。' };
    }
  }

  async function updateUser(userId: number, values: UserUpdateFormValues): Promise<ActionResult<User>> {
    'use server';
    const permissionError = await checkPermission('root');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(userId)) {
      return { ok: false, error: 'ユーザーIDが正しくありません。' };
    }
    const parsed = UserUpdateFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const updated = await db
        .update(usersTable)
        .set(parsed.data)
        .where(eq(usersTable.id, userId))
        .returning({ id: usersTable.id });
      if (updated.length === 0) {
        return { ok: false, error: 'ユーザーが見つかりませんでした。' };
      }
      const [user] = await selectUsers(eq(usersTable.id, userId));
      return { ok: true, data: user };
    } catch (e) {
      const error = getDatabaseError(e);
      if (error?.code === PostgresError.UNIQUE_VIOLATION && error.constraint === 'users_email_unique') {
        return { ok: false, error: 'このメールアドレスは別のユーザーが使用しています。' };
      }
      if (error?.code === PostgresError.CHECK_VIOLATION && error.constraint === 'valid_email') {
        return { ok: false, error: 'メールアドレスが正しくありません（m.chukyo-u.ac.jp のアドレスは登録できません）。' };
      }
      console.error('Failed to update user:', e);
      return { ok: false, error: '一般管理者の編集に失敗しました。' };
    }
  }

  async function deleteUser(userId: number): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('root');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(userId)) {
      return { ok: false, error: 'ユーザーIDが正しくありません。' };
    }
    try {
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete user:', e);
      return { ok: false, error: '一般管理者の削除に失敗しました。' };
    }
  }

  return (
    <UserManager
      initialUsers={users}
      initialSudoers={sudoers}
      onCreateSudoer={createSudoer}
      onDeleteSudoer={deleteSudoer}
      onCreateUser={createUser}
      onUpdateUser={updateUser}
      onDeleteUser={deleteUser}
    />
  );
}
