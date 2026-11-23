import { DrizzleQueryError, asc, count, eq, max, sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { PostgresError } from 'pg-error-enum';

import FaqManager from './_components/faq-manager';
import { FaqCategoryFormSchema, FaqFormSchema, FaqOrderSchema, hasSameIds } from './_lib/faq';
import { faqCategoriesTable, faqsTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { db } from '@/lib/drizzle';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';
import type {
  FaqCategoryFormValues, FaqFormValues, FaqMutationResult, ManagedFaq, ManagedFaqCategory,
} from './_lib/faq';

export const dynamic = 'force-dynamic';


/**
 * 処理を中断し、利用者にメッセージを表示するためのエラー。
 */
class FaqActionError extends Error {}


/**
 * 一覧が他の操作で変更されていた場合のメッセージ。
 */
const STALE_LIST_MESSAGE = '一覧が他の操作で変更されています。ページを再読み込みしてください。';


/**
 * 分類とQ&Aを、すべて取得する。
 *
 * @returns 表示順に並べた分類（Q&Aも表示順に並べる）
 */
async function selectFaqCategories(): Promise<ManagedFaqCategory[]> {
  const [categories, faqs] = await Promise.all([
    db
      .select({
        id: faqCategoriesTable.id,
        title: faqCategoriesTable.title,
        createdAt: faqCategoriesTable.createdAt,
        updatedAt: faqCategoriesTable.updatedAt,
      })
      .from(faqCategoriesTable)
      .orderBy(asc(faqCategoriesTable.sortOrder), asc(faqCategoriesTable.id)),
    db
      .select({
        id: faqsTable.id,
        categoryId: faqsTable.categoryId,
        question: faqsTable.question,
        answer: faqsTable.answer,
        isPrivate: faqsTable.isPrivate,
        createdAt: faqsTable.createdAt,
        updatedAt: faqsTable.updatedAt,
      })
      .from(faqsTable)
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.id)),
  ]);

  const faqsByCategory = Map.groupBy<number, ManagedFaq>(faqs, (faq) => faq.categoryId);
  return categories.map((category) => ({ ...category, faqs: faqsByCategory.get(category.id) ?? [] }));
}


/**
 * Q&Aが残っている分類を削除しようとした場合のメッセージ。
 */
const CATEGORY_IN_USE_MESSAGE = 'この分類にはQ&Aがあるため削除できません。先にQ&Aを別の分類に移動するか、削除してください。';


/**
 * データベースのエラーが、指定した制約への違反であるかどうかを判定する。
 *
 * @param e - エラー
 * @param code - エラーコード
 * @param constraint - 制約の名前
 * @returns 指定した制約への違反である場合は `true`
 */
function isConstraintViolation(e: unknown, code: PostgresError, constraint: string): boolean {
  return e instanceof DrizzleQueryError && e.cause instanceof DatabaseError
    && e.cause.code === code && e.cause.constraint === constraint;
}


/**
 * 分類の登録・更新で発生したエラーを、利用者に表示するメッセージに変換する。
 *
 * @param e - エラー
 * @param title - 登録・更新しようとした分類名
 * @returns 表示するメッセージ。想定外のエラーの場合は `null`
 */
function toCategoryErrorMessage(e: unknown, title: string): string | null {
  if (isConstraintViolation(e, PostgresError.UNIQUE_VIOLATION, 'faq_categories_title_unique')) {
    return `「${title}」という分類は既に存在します。`;
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


/**
 * 並べ替えで変更しないよう、更新日時を現在の値のまま保つための値。
 */
const KEEP_UPDATED_AT = {
  categories: sql`${faqCategoriesTable.updatedAt}`,
  faqs: sql`${faqsTable.updatedAt}`,
};


export default async function FaqControlPage(): Promise<JSX.Element> {
  const categories = await selectFaqCategories();

  async function createCategory(values: FaqCategoryFormValues): Promise<ActionResult<FaqMutationResult>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = FaqCategoryFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      // 末尾に追加する
      const [created] = await db
        .insert(faqCategoriesTable)
        .values({
          title: parsed.data.title,
          sortOrder: sql`(SELECT COALESCE(MAX(${faqCategoriesTable.sortOrder}) + 1, 0) FROM ${faqCategoriesTable})`,
        })
        .returning({ id: faqCategoriesTable.id });
      return { ok: true, data: { id: created.id, categories: await selectFaqCategories() } };
    } catch (e) {
      const message = toCategoryErrorMessage(e, parsed.data.title);
      if (message) {
        return { ok: false, error: message };
      }
      console.error('Failed to create FAQ category:', e);
      return { ok: false, error: '分類の追加に失敗しました。' };
    }
  }

  async function updateCategory(
    id: number,
    values: FaqCategoryFormValues,
  ): Promise<ActionResult<FaqMutationResult>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: '分類IDが正しくありません。' };
    }
    const parsed = FaqCategoryFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const updated = await db
        .update(faqCategoriesTable)
        .set({ title: parsed.data.title })
        .where(eq(faqCategoriesTable.id, id))
        .returning({ id: faqCategoriesTable.id });
      if (updated.length === 0) {
        return { ok: false, error: '分類が見つかりませんでした。削除された可能性があります。' };
      }
      return { ok: true, data: { id, categories: await selectFaqCategories() } };
    } catch (e) {
      const message = toCategoryErrorMessage(e, parsed.data.title);
      if (message) {
        return { ok: false, error: message };
      }
      console.error('Failed to update FAQ category:', e);
      return { ok: false, error: '分類の編集に失敗しました。' };
    }
  }

  async function deleteCategory(id: number): Promise<ActionResult<ManagedFaqCategory[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: '分類IDが正しくありません。' };
    }
    try {
      const [{ faqCount }] = await db
        .select({ faqCount: count() })
        .from(faqsTable)
        .where(eq(faqsTable.categoryId, id));
      if (faqCount > 0) {
        return { ok: false, error: CATEGORY_IN_USE_MESSAGE };
      }
      // 確認の後にQ&Aが追加された場合は、外部キー制約によって削除できない
      await db.delete(faqCategoriesTable).where(eq(faqCategoriesTable.id, id));
      return { ok: true, data: await selectFaqCategories() };
    } catch (e) {
      if (isConstraintViolation(e, PostgresError.FOREIGN_KEY_VIOLATION, 'faqs_category_id_faq_categories_id_fk')) {
        return { ok: false, error: CATEGORY_IN_USE_MESSAGE };
      }
      console.error('Failed to delete FAQ category:', e);
      return { ok: false, error: '分類の削除に失敗しました。' };
    }
  }

  async function reorderCategories(orderedIds: number[]): Promise<ActionResult<ManagedFaqCategory[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = FaqOrderSchema.safeParse(orderedIds);
    if (!parsed.success) {
      return { ok: false, error: '並び順が正しくありません。' };
    }
    try {
      await db.transaction(async (tx) => {
        const current = await tx
          .select({ id: faqCategoriesTable.id })
          .from(faqCategoriesTable)
          .for('update');
        if (!hasSameIds(current.map((category) => category.id), parsed.data)) {
          throw new FaqActionError(STALE_LIST_MESSAGE);
        }
        for (const [index, id] of parsed.data.entries()) {
          await tx
            .update(faqCategoriesTable)
            .set({ sortOrder: index, updatedAt: KEEP_UPDATED_AT.categories })
            .where(eq(faqCategoriesTable.id, id));
        }
      });
      return { ok: true, data: await selectFaqCategories() };
    } catch (e) {
      if (e instanceof FaqActionError) {
        return { ok: false, error: e.message };
      }
      console.error('Failed to reorder FAQ categories:', e);
      return { ok: false, error: '分類の並べ替えに失敗しました。' };
    }
  }

  async function createFaq(values: FaqFormValues): Promise<ActionResult<FaqMutationResult>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = FaqFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      const id = await db.transaction(async (tx) => {
        // 同時に追加された場合に表示順が重複しないよう、分類を更新中にする
        const [category] = await tx
          .select({ id: faqCategoriesTable.id })
          .from(faqCategoriesTable)
          .where(eq(faqCategoriesTable.id, parsed.data.categoryId))
          .for('update');
        if (!category) {
          throw new FaqActionError('分類が見つかりませんでした。削除された可能性があります。');
        }
        // 分類の末尾に追加する
        const [{ lastSortOrder }] = await tx
          .select({ lastSortOrder: max(faqsTable.sortOrder) })
          .from(faqsTable)
          .where(eq(faqsTable.categoryId, category.id));
        const [created] = await tx
          .insert(faqsTable)
          .values({ ...parsed.data, sortOrder: lastSortOrder === null ? 0 : lastSortOrder + 1 })
          .returning({ id: faqsTable.id });
        return created.id;
      });
      return { ok: true, data: { id, categories: await selectFaqCategories() } };
    } catch (e) {
      if (e instanceof FaqActionError) {
        return { ok: false, error: e.message };
      }
      console.error('Failed to create FAQ:', e);
      return { ok: false, error: 'Q&Aの追加に失敗しました。' };
    }
  }

  async function updateFaq(id: number, values: FaqFormValues): Promise<ActionResult<FaqMutationResult>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: 'Q&AのIDが正しくありません。' };
    }
    const parsed = FaqFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    try {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ categoryId: faqsTable.categoryId })
          .from(faqsTable)
          .where(eq(faqsTable.id, id))
          .for('update');
        if (!current) {
          throw new FaqActionError('Q&Aが見つかりませんでした。削除された可能性があります。');
        }
        if (current.categoryId === parsed.data.categoryId) {
          await tx.update(faqsTable).set(parsed.data).where(eq(faqsTable.id, id));
          return;
        }
        // 分類を変更した場合は、変更先の分類の末尾に移動する
        const [category] = await tx
          .select({ id: faqCategoriesTable.id })
          .from(faqCategoriesTable)
          .where(eq(faqCategoriesTable.id, parsed.data.categoryId))
          .for('update');
        if (!category) {
          throw new FaqActionError('変更先の分類が見つかりませんでした。削除された可能性があります。');
        }
        const [{ lastSortOrder }] = await tx
          .select({ lastSortOrder: max(faqsTable.sortOrder) })
          .from(faqsTable)
          .where(eq(faqsTable.categoryId, category.id));
        await tx
          .update(faqsTable)
          .set({ ...parsed.data, sortOrder: lastSortOrder === null ? 0 : lastSortOrder + 1 })
          .where(eq(faqsTable.id, id));
      });
      return { ok: true, data: { id, categories: await selectFaqCategories() } };
    } catch (e) {
      if (e instanceof FaqActionError) {
        return { ok: false, error: e.message };
      }
      console.error('Failed to update FAQ:', e);
      return { ok: false, error: 'Q&Aの編集に失敗しました。' };
    }
  }

  async function deleteFaq(id: number): Promise<ActionResult<ManagedFaqCategory[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(id)) {
      return { ok: false, error: 'Q&AのIDが正しくありません。' };
    }
    try {
      await db.delete(faqsTable).where(eq(faqsTable.id, id));
      return { ok: true, data: await selectFaqCategories() };
    } catch (e) {
      console.error('Failed to delete FAQ:', e);
      return { ok: false, error: 'Q&Aの削除に失敗しました。' };
    }
  }

  async function reorderFaqs(categoryId: number, orderedIds: number[]): Promise<ActionResult<ManagedFaqCategory[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!isValidId(categoryId)) {
      return { ok: false, error: '分類IDが正しくありません。' };
    }
    const parsed = FaqOrderSchema.safeParse(orderedIds);
    if (!parsed.success) {
      return { ok: false, error: '並び順が正しくありません。' };
    }
    try {
      await db.transaction(async (tx) => {
        const current = await tx
          .select({ id: faqsTable.id })
          .from(faqsTable)
          .where(eq(faqsTable.categoryId, categoryId))
          .for('update');
        if (!hasSameIds(current.map((faq) => faq.id), parsed.data)) {
          throw new FaqActionError(STALE_LIST_MESSAGE);
        }
        for (const [index, id] of parsed.data.entries()) {
          await tx
            .update(faqsTable)
            .set({ sortOrder: index, updatedAt: KEEP_UPDATED_AT.faqs })
            .where(eq(faqsTable.id, id));
        }
      });
      return { ok: true, data: await selectFaqCategories() };
    } catch (e) {
      if (e instanceof FaqActionError) {
        return { ok: false, error: e.message };
      }
      console.error('Failed to reorder FAQs:', e);
      return { ok: false, error: 'Q&Aの並べ替えに失敗しました。' };
    }
  }

  return (
    <FaqManager
      initialCategories={categories}
      onCreateCategory={createCategory}
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      onReorderCategories={reorderCategories}
      onCreateFaq={createFaq}
      onUpdateFaq={updateFaq}
      onDeleteFaq={deleteFaq}
      onReorderFaqs={reorderFaqs}
    />
  );
}
