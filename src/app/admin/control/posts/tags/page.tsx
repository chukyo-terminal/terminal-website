import { DrizzleQueryError, asc, count, eq, inArray } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import TagManager from './_components/tag-manager';
import { TagFormSchema, findTagConflict } from './_lib/tag';
import { postTagsTable, tagsTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';
import type { SQL } from 'drizzle-orm';
import type { ManagedTag, TagFormValues } from './_lib/tag';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * 処理を中断し、利用者にメッセージを表示するためのエラー。
 */
class TagActionError extends Error {}


/**
 * タグを、設定されている記事の数とともに取得する。
 *
 * @param where - 絞り込み条件
 * @returns 名前順に並べたタグ
 */
async function selectTags(where?: SQL): Promise<ManagedTag[]> {
  return await db
    .select({
      id: tagsTable.id,
      name: tagsTable.name,
      slug: tagsTable.slug,
      postCount: count(postTagsTable.postId),
      createdAt: tagsTable.createdAt,
      updatedAt: tagsTable.updatedAt,
    })
    .from(tagsTable)
    .leftJoin(postTagsTable, eq(tagsTable.id, postTagsTable.tagId))
    .where(where)
    .groupBy(tagsTable.id)
    .orderBy(asc(tagsTable.name));
}


/**
 * 名前またはスラッグが既存のタグと重複していないかを検証する。
 *
 * @param values - 検証するタグの名前とスラッグ
 * @param excludeId - 比較から除くタグのID（編集中のタグ自身）
 * @returns エラーメッセージ。重複がない場合は `null`
 */
async function checkTagConflict(values: { name: string; slug: string }, excludeId?: number): Promise<string | null> {
  const tags = await db.select({ id: tagsTable.id, name: tagsTable.name, slug: tagsTable.slug }).from(tagsTable);
  return findTagConflict(tags, values, excludeId);
}


/**
 * タグの登録・更新で発生したエラーを、利用者に表示するメッセージに変換する。
 *
 * @param e - エラー
 * @param values - 登録・更新しようとしたタグの名前とスラッグ
 * @returns 表示するメッセージ。想定外のエラーの場合は `null`
 */
function toTagErrorMessage(e: unknown, values: { name: string; slug: string }): string | null {
  if (!(e instanceof DrizzleQueryError && e.cause instanceof DatabaseError)) {
    return null;
  }
  const { code, constraint } = e.cause;
  if (code === PostgresError.UNIQUE_VIOLATION && constraint === 'tags_name_unique') {
    return `「${values.name}」というタグは既に存在します。`;
  }
  if (code === PostgresError.UNIQUE_VIOLATION && constraint === 'tags_slug_unique') {
    return `スラッグ「${values.slug}」は既に別のタグで使われています。`;
  }
  if (code === PostgresError.CHECK_VIOLATION && constraint === 'valid_slug') {
    return 'スラッグは半角英小文字・数字・ハイフンで入力してください（先頭と末尾のハイフンは不可）。';
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


export default async function TagsControlPage(): Promise<JSX.Element> {
  const tags = await selectTags();

  async function createTag(values: TagFormValues): Promise<ActionResult<ManagedTag>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = TagFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const conflict = await checkTagConflict(parsed.data);
      if (conflict) {
        return { ok: false, error: conflict };
      }
      const [{ id }] = await db
        .insert(tagsTable)
        .values(parsed.data)
        .returning({ id: tagsTable.id });
      const [created] = await selectTags(eq(tagsTable.id, id));
      return { ok: true, data: created };
    } catch (e) {
      const message = toTagErrorMessage(e, parsed.data);
      if (message) {
        return { ok: false, error: message };
      }
      console.error('Failed to create tag:', e);
      return { ok: false, error: 'タグの作成に失敗しました。' };
    }
  }

  async function updateTag(id: number, values: TagFormValues): Promise<ActionResult<ManagedTag>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: 'タグIDが正しくありません。' };
    }
    const parsed = TagFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const conflict = await checkTagConflict(parsed.data, id);
      if (conflict) {
        return { ok: false, error: conflict };
      }
      const updated = await db
        .update(tagsTable)
        .set(parsed.data)
        .where(eq(tagsTable.id, id))
        .returning({ id: tagsTable.id });
      if (updated.length === 0) {
        return { ok: false, error: 'タグが見つかりませんでした。' };
      }
      const [tag] = await selectTags(eq(tagsTable.id, id));
      return { ok: true, data: tag };
    } catch (e) {
      const message = toTagErrorMessage(e, parsed.data);
      if (message) {
        return { ok: false, error: message };
      }
      console.error('Failed to update tag:', e);
      return { ok: false, error: 'タグの編集に失敗しました。' };
    }
  }

  async function deleteTag(id: number): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: 'タグIDが正しくありません。' };
    }
    try {
      // 記事への設定（post_tags）は、外部キー制約によって一緒に削除される
      await db.delete(tagsTable).where(eq(tagsTable.id, id));
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete tag:', e);
      return { ok: false, error: 'タグの削除に失敗しました。' };
    }
  }

  async function mergeTag(sourceId: number, targetId: number): Promise<ActionResult<ManagedTag>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(sourceId) || !isValidId(targetId)) {
      return { ok: false, error: 'タグIDが正しくありません。' };
    }
    if (sourceId === targetId) {
      return { ok: false, error: '統合先には別のタグを選択してください。' };
    }
    try {
      await db.transaction(async (tx) => {
        const found = await tx
          .select({ id: tagsTable.id })
          .from(tagsTable)
          .where(inArray(tagsTable.id, [sourceId, targetId]))
          .for('update');
        if (found.length !== 2) {
          throw new TagActionError('タグが見つかりませんでした。ページを再読み込みしてください。');
        }
        // 統合元のタグが設定されている記事に、統合先のタグを設定する（設定済みの記事はそのまま）
        const sourcePosts = await tx
          .select({ postId: postTagsTable.postId })
          .from(postTagsTable)
          .where(eq(postTagsTable.tagId, sourceId));
        if (sourcePosts.length > 0) {
          await tx
            .insert(postTagsTable)
            .values(sourcePosts.map(({ postId }) => ({ postId, tagId: targetId })))
            .onConflictDoNothing();
        }
        // 統合元のタグの記事への設定は、外部キー制約によって一緒に削除される
        await tx.delete(tagsTable).where(eq(tagsTable.id, sourceId));
      });
      const [target] = await selectTags(eq(tagsTable.id, targetId));
      return { ok: true, data: target };
    } catch (e) {
      if (e instanceof TagActionError) {
        return { ok: false, error: e.message };
      }
      console.error('Failed to merge tags:', e);
      return { ok: false, error: 'タグの統合に失敗しました。' };
    }
  }

  return (
    <TagManager
      initialTags={tags}
      onCreate={createTag}
      onUpdate={updateTag}
      onDelete={deleteTag}
      onMerge={mergeTag}
    />
  );
}
