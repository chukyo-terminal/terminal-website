import { desc, eq, isNotNull, min } from 'drizzle-orm';

import AchievementManager from './_components/achievement-manager';
import { AchievementFormSchema } from './_lib/achievement';
import { getPostStatus } from '../posts/_lib/post-status';
import { achievementsTable, postContentsTable, postsTable, publishedPostsView } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { getFiscalYear } from '@/utils/date';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';
import type { SQL } from 'drizzle-orm';
import type { Achievement, AchievementFormValues, RelatedPostOption } from './_lib/achievement';

export const dynamic = 'force-dynamic';


/**
 * 実績の列。
 */
const ACHIEVEMENT_COLUMNS = {
  id: achievementsTable.id,
  title: achievementsTable.title,
  description: achievementsTable.description,
  postId: achievementsTable.postId,
  date: achievementsTable.date,
  createdAt: achievementsTable.createdAt,
  updatedAt: achievementsTable.updatedAt,
};


/**
 * 実績を取得する。
 *
 * @param where - 絞り込み条件
 * @returns 日付の降順に並べた実績
 */
async function selectAchievements(where?: SQL): Promise<Achievement[]> {
  return await db
    .select(ACHIEVEMENT_COLUMNS)
    .from(achievementsTable)
    .where(where)
    .orderBy(desc(achievementsTable.date), desc(achievementsTable.id));
}


/**
 * 関連記事として選択できる記事を取得する。
 *
 * @returns 新しい順に並べた記事
 */
async function selectRelatedPostOptions(): Promise<RelatedPostOption[]> {
  const [latestContents, firstPublications, publicPosts] = await Promise.all([
    // 各投稿の最新の版
    db
      .selectDistinctOn([postsTable.id], {
        id: postsTable.id,
        slug: postsTable.slug,
        isPrivate: postsTable.isPrivate,
        title: postContentsTable.title,
        description: postContentsTable.description,
        publishedAt: postContentsTable.publishedAt,
      })
      .from(postsTable)
      .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
      .orderBy(desc(postsTable.id), desc(postContentsTable.identifier)),
    // 各投稿が初めて公開された日時
    db
      .select({ postId: postContentsTable.postId, publishedAt: min(postContentsTable.publishedAt) })
      .from(postContentsTable)
      .where(isNotNull(postContentsTable.publishedAt))
      .groupBy(postContentsTable.postId),
    // 公開ページに表示されている記事
    db
      .select({ id: publishedPostsView.id, slug: publishedPostsView.slug, publishedAt: publishedPostsView.publishedAt })
      .from(publishedPostsView),
  ]);

  const firstPublishedAtByPost = new Map(firstPublications.map((row) => [row.postId, row.publishedAt]));
  const publicPathByPost = new Map(publicPosts.flatMap((post) => (
    post.publishedAt ? [[post.id, `/posts/${getFiscalYear(post.publishedAt)}/${post.slug}`] as const] : []
  )));

  return latestContents.map((content) => {
    const firstPublishedAt = firstPublishedAtByPost.get(content.id) ?? null;
    return {
      id: content.id,
      title: content.title,
      description: content.description,
      slug: content.slug,
      status: getPostStatus(content.publishedAt, firstPublishedAt),
      isPrivate: content.isPrivate,
      firstPublishedAt,
      publicPath: publicPathByPost.get(content.id) ?? null,
    };
  });
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


/**
 * 実績の入力値を検証する。
 *
 * @param values - 入力値
 * @returns 検証済みの入力値、またはエラーメッセージ
 */
async function parseAchievementForm(
  values: AchievementFormValues,
): Promise<{ ok: true; data: typeof achievementsTable.$inferInsert } | { ok: false; error: string }> {
  const parsed = AchievementFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
  }
  if (parsed.data.postId !== null) {
    const [post] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(eq(postsTable.id, parsed.data.postId));
    if (!post) {
      return { ok: false, error: '関連記事が見つかりませんでした。削除された可能性があります。' };
    }
  }
  return { ok: true, data: parsed.data };
}


export default async function AchievementsControlPage(): Promise<JSX.Element> {
  const [achievements, posts] = await Promise.all([selectAchievements(), selectRelatedPostOptions()]);

  async function createAchievement(values: AchievementFormValues): Promise<ActionResult<Achievement>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = await parseAchievementForm(values);
    if (!parsed.ok) {
      return parsed;
    }
    try {
      const [created] = await db
        .insert(achievementsTable)
        .values(parsed.data)
        .returning(ACHIEVEMENT_COLUMNS);
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
    const parsed = await parseAchievementForm(values);
    if (!parsed.ok) {
      return parsed;
    }
    try {
      const [updated] = await db
        .update(achievementsTable)
        .set(parsed.data)
        .where(eq(achievementsTable.id, id))
        .returning(ACHIEVEMENT_COLUMNS);
      if (!updated) {
        return { ok: false, error: '実績が見つかりませんでした。削除された可能性があります。' };
      }
      return { ok: true, data: updated };
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
      posts={posts}
      onCreate={createAchievement}
      onUpdate={updateAchievement}
      onDelete={deleteAchievement}
    />
  );
}
