import { DrizzleQueryError, and, eq, inArray, or } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import { postTagsTable, tagsTable } from '@/db/schema';

import type { db } from '@/lib/drizzle';
import type { PostTag } from './post-form';


/**
 * トランザクション内でクエリを実行するオブジェクト。
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];


/**
 * 保存・公開処理を中断し、利用者にメッセージを表示するためのエラー。
 */
export class PostActionError extends Error {}


/**
 * 一意性制約違反のエラーの場合に、違反した制約の名前を返す。
 *
 * @param e - エラー
 * @returns 違反した制約の名前（一意性制約違反でない場合は `null`）
 */
function getViolatedUniqueConstraint(e: unknown): string | null {
  if (
    e instanceof DrizzleQueryError
    && e.cause instanceof DatabaseError
    && e.cause.code === PostgresError.UNIQUE_VIOLATION
  ) {
    return e.cause.constraint ?? '';
  }
  return null;
}


/**
 * 保存・公開処理で発生したエラーを、利用者に表示するメッセージに変換する。
 *
 * @param e - エラー
 * @param fallback - 想定外のエラーの場合のメッセージ
 * @returns 表示するメッセージ
 */
export function toErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof PostActionError) {
    return e.message;
  }
  switch (getViolatedUniqueConstraint(e)) {
    case null: {
      return fallback;
    }
    case 'posts_year_slug_unique': {
      return '同じ年度に同じスラッグの記事が既に存在します。別のスラッグを指定してください。';
    }
    case 'tags_name_unique':
    case 'tags_slug_unique': {
      return '同じタグが別の操作で同時に登録されました。もう一度保存してください。';
    }
    default: {
      return fallback;
    }
  }
}


/**
 * 記事に設定するタグを更新する。存在しないタグは新しく登録する。
 *
 * @param tx - トランザクション
 * @param postId - 投稿ID
 * @param tags - 設定するタグ
 */
export async function syncPostTags(tx: Transaction, postId: number, tags: readonly PostTag[]): Promise<void> {
  const existingTags = tags.length > 0
    ? await tx
      .select({ id: tagsTable.id, name: tagsTable.name, slug: tagsTable.slug })
      .from(tagsTable)
      .where(or(
        inArray(tagsTable.slug, tags.map((tag) => tag.slug)),
        inArray(tagsTable.name, tags.map((tag) => tag.name)),
      ))
    : [];

  const tagIds: number[] = [];
  const newTags: PostTag[] = [];
  for (const tag of tags) {
    const sameSlug = existingTags.find((existing) => existing.slug === tag.slug);
    const sameName = existingTags.find((existing) => existing.name === tag.name);
    if (sameSlug && sameSlug.name === tag.name) {
      tagIds.push(sameSlug.id);
    } else if (sameSlug) {
      throw new PostActionError(`タグのスラッグ「${tag.slug}」は、既にタグ「${sameSlug.name}」で使われています。`);
    } else if (sameName) {
      throw new PostActionError(`タグ「${tag.name}」は、既に別のスラッグ（${sameName.slug}）で登録されています。`);
    } else {
      newTags.push(tag);
    }
  }

  if (newTags.length > 0) {
    const inserted = await tx
      .insert(tagsTable)
      .values(newTags.map((tag) => ({ name: tag.name, slug: tag.slug })))
      .returning({ id: tagsTable.id });
    tagIds.push(...inserted.map((row) => row.id));
  }

  const currentTagIds = new Set(
    await tx
      .select({ tagId: postTagsTable.tagId })
      .from(postTagsTable)
      .where(eq(postTagsTable.postId, postId))
      .then((rows) => rows.map((row) => row.tagId)),
  );
  const nextTagIds = new Set(tagIds);
  const removedTagIds = [...currentTagIds].filter((tagId) => !nextTagIds.has(tagId));
  const addedTagIds = [...nextTagIds].filter((tagId) => !currentTagIds.has(tagId));
  if (removedTagIds.length > 0) {
    await tx
      .delete(postTagsTable)
      .where(and(eq(postTagsTable.postId, postId), inArray(postTagsTable.tagId, removedTagIds)));
  }
  if (addedTagIds.length > 0) {
    await tx
      .insert(postTagsTable)
      // eslint-disable-next-line unicorn/no-unused-array-method-return
      .values(addedTagIds.map((tagId) => ({ postId, tagId })));
  }
}
