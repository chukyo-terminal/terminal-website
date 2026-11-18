import { desc, eq } from 'drizzle-orm';

import AchievementManager from './_components/achievement-manager';
import { AchievementFormSchema } from './_lib/achievement';
import { achievementsTable, postsTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';
import type { SQL } from 'drizzle-orm';
import type { Achievement, AchievementFormValues } from './_lib/achievement';

export const dynamic = 'force-dynamic';


/**
 * 実績を取得する。
 *
 * @param where - 絞り込み条件
 * @returns 日付の降順に並べた実績
 */
async function selectAchievements(where?: SQL): Promise<Achievement[]> {
  const rows = await db
    .select({
      id: achievementsTable.id,
      title: achievementsTable.title,
      description: achievementsTable.description,
      postId: postsTable.id,
      postSlug: postsTable.slug,
      date: achievementsTable.date,
      createdAt: achievementsTable.createdAt,
      updatedAt: achievementsTable.updatedAt,
    })
    .from(achievementsTable)
    .leftJoin(postsTable, eq(achievementsTable.postId, postsTable.id))
    .where(where)
    .orderBy(desc(achievementsTable.date), desc(achievementsTable.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    post: row.postId !== null && row.postSlug !== null ? { id: row.postId, slug: row.postSlug } : null,
    date: new Date(`${row.date}T00:00:00.000Z`),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
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


export default async function AchievementsControlPage(): Promise<JSX.Element> {
  const achievements = await selectAchievements();

  async function createAchievement(values: AchievementFormValues): Promise<ActionResult<Achievement>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = AchievementFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const [{ id }] = await db
        .insert(achievementsTable)
        .values({ ...parsed.data, postId: null })
        .returning({ id: achievementsTable.id });
      const [created] = await selectAchievements(eq(achievementsTable.id, id));
      return { ok: true, data: created };
    } catch (e) {
      console.error('Failed to create achievement:', e);
      return { ok: false, error: '実績の追加に失敗しました。' };
    }
  }

  async function updateAchievement(
    id: number,
    values: AchievementFormValues,
  ): Promise<ActionResult<Achievement>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: '実績IDが正しくありません。' };
    }
    const parsed = AchievementFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const updated = await db
        .update(achievementsTable)
        .set(parsed.data)
        .where(eq(achievementsTable.id, id))
        .returning({ id: achievementsTable.id });
      if (updated.length === 0) {
        return { ok: false, error: '実績が見つかりませんでした。' };
      }
      const [achievement] = await selectAchievements(eq(achievementsTable.id, id));
      return { ok: true, data: achievement };
    } catch (e) {
      console.error('Failed to update achievement:', e);
      return { ok: false, error: '実績の編集に失敗しました。' };
    }
  }

  async function deleteAchievement(id: number): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: '実績IDが正しくありません。' };
    }
    try {
      await db.delete(achievementsTable).where(eq(achievementsTable.id, id));
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete achievement:', e);
      return { ok: false, error: '実績の削除に失敗しました。' };
    }
  }

  return (
    <AchievementManager
      initialAchievements={achievements}
      onCreate={createAchievement}
      onUpdate={updateAchievement}
      onDelete={deleteAchievement}
    />
  );
}
