'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

import { ArrowLeft, Merge, Pen, Plus, Search, SearchX, Tags, Trash2, TriangleAlert, X } from 'lucide-react';

import { TAG_NAME_MAX_LENGTH } from '../../[postId]/_lib/post-form';
import { suggestTagSlug } from '../../[postId]/_lib/tags';
import { formatDate, formatDateTime } from '../../_lib/date-format';
import {
  DEFAULT_TAG_FILTERS, TAG_SORT_ORDERS, TagFormSchema, USAGE_FILTERS, countByUsage, filterAndSortTags,
  findTagConflict,
} from '../_lib/tag';
import Modal from '@/components/elements/modal';

import type { FormEvent, JSX } from 'react';
import type { ActionResult } from '@/types';
import type { ManagedTag, TagFormValues, TagListFilters, TagSortOrder } from '../_lib/tag';


/**
 * 主要な操作ボタン（新規タグ）の共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 font-medium '
  + 'text-white hover:bg-emerald-700';


/**
 * モーダル内のボタンの共通クラス。
 */
const MODAL_BUTTON_CLASS_NAME = 'rounded px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60';


/**
 * 入力欄の共通クラス。
 */
const INPUT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 '
  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';


/**
 * 一覧が空のときの表示の共通クラス。
 */
const EMPTY_STATE_CLASS_NAME = 'flex flex-col items-center rounded-lg border border-dashed border-gray-700 px-6 '
  + 'text-center';


/**
 * 行の操作ボタンの共通クラス。
 */
const ROW_BUTTON_CLASS_NAME = 'rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700 '
  + 'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';


/**
 * 表示中のモーダルと、その操作対象のタグ。
 */
type ModalState =
  | { type: 'create' }
  | { type: 'edit'; tagId: number }
  | { type: 'delete'; tagId: number }
  | { type: 'merge'; tagId: number };


/**
 * モーダルでの送信処理の状態を管理する。
 *
 * @returns 送信中かどうか、エラーメッセージ、送信処理を実行する関数
 */
function useSubmission(): {
  isSubmitting: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  submit: (action: () => Promise<string | null>, fallback: string) => Promise<void>;
} {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 送信処理を実行する。失敗した場合はエラーメッセージを表示する。
   *
   * @param action - 送信処理。失敗した場合はエラーメッセージを返す
   * @param fallback - 想定外のエラーの場合のメッセージ
   */
  async function submit(action: () => Promise<string | null>, fallback: string): Promise<void> {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const message = await action();
      if (message) {
        setError(message);
      }
    } catch (e) {
      console.error(fallback, e);
      setError(fallback);
    } finally {
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, error, setError, submit };
}


/**
 * モーダル内のエラーメッセージ。
 *
 * @param properties - プロパティ
 * @returns エラーメッセージの要素
 */
function ErrorMessage({ message }: { message: string | null }): JSX.Element | null {
  if (!message) {
    return null;
  }
  return <p role="alert" className="text-sm text-red-400">{message}</p>;
}


/**
 * タグの名前の表示（`#` 付きのラベル）。
 *
 * @param properties - プロパティ
 * @returns タグの名前の要素
 */
function TagLabel({ name }: { name: string }): JSX.Element {
  return (
    <span
      className={
        'inline-flex max-w-full items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-sm text-emerald-300'
      }
    >
      <span className="truncate" title={`#${name}`}>#{name}</span>
    </span>
  );
}


/**
 * タグの作成・編集モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function TagFormModal({
  title,
  submitLabel,
  submitClassName,
  initialValues,
  originalSlug,
  tags,
  excludeId,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  submitClassName: string;
  initialValues: { name: string; slug: string };
  /** 編集前のスラッグ（作成時は `undefined`）。作成時は、スラッグをタグ名に合わせて自動で入力する */
  originalSlug?: string;
  /** 既存のタグ（重複の確認に使用する） */
  tags: readonly ManagedTag[];
  /** 重複の確認から除くタグのID（編集中のタグ自身） */
  excludeId?: number;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: (values: { name: string; slug: string }) => Promise<string | null>;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, setError, submit } = useSubmission();
  const [values, setValues] = useState(initialValues);
  const isCreating = originalSlug === undefined;
  const isSlugChanged = !isCreating && values.slug.trim() !== originalSlug;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsed = TagFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    const conflict = findTagConflict(tags, parsed.data, excludeId);
    if (conflict) {
      setError(conflict);
      return;
    }
    await submit(() => onSubmit(parsed.data), `タグの${isCreating ? '作成' : '編集'}に失敗しました。`);
  };

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      contentLabel={title}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">タグ名</span>
          <input
            type="text"
            name="name"
            value={values.name}
            maxLength={TAG_NAME_MAX_LENGTH}
            placeholder="例: プログラミング"
            autoFocus
            required
            onChange={(event) => {
              const name = event.target.value;
              // 作成時、スラッグを手動で変更していない場合は、タグ名に合わせて更新する
              setValues((previous) => ({
                name,
                slug: isCreating && previous.slug === suggestTagSlug(previous.name)
                  ? suggestTagSlug(name)
                  : previous.slug,
              }));
              setError(null);
            }}
            className={INPUT_CLASS_NAME}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">スラッグ</span>
          <input
            type="text"
            name="slug"
            value={values.slug}
            placeholder="例: programming"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            required
            onChange={(event) => {
              const slug = event.target.value.toLowerCase().replaceAll(/[\s_]+/g, '-');
              setValues((previous) => ({ ...previous, slug }));
              setError(null);
            }}
            className={`${INPUT_CLASS_NAME} font-mono`}
          />
          <span className="text-xs text-gray-400">
            半角英小文字・数字・ハイフン。タグで絞り込んだ投稿一覧の URL（
            <span className="font-mono">/posts?tags={values.slug.trim() || '…'}</span>
            ）に使われます。
          </span>
        </label>
        {isSlugChanged && (
          <p
            className={
              'flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'
            }
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              スラッグを変更すると、これまでの URL（
              <span className="font-mono">/posts?tags={originalSlug}</span>
              ）ではこのタグで絞り込めなくなります。
            </span>
          </p>
        )}
        <ErrorMessage message={error} />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-gray-600 hover:bg-gray-500`}
            disabled={isSubmitting}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${MODAL_BUTTON_CLASS_NAME} text-white ${submitClassName}`}
            disabled={isSubmitting}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}


/**
 * タグの削除モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function DeleteTagModal({
  tag,
  canMerge,
  onSubmit,
  onMergeInstead,
  onClose,
}: {
  tag: ManagedTag;
  /** 統合先にできるタグがあるかどうか */
  canMerge: boolean;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: () => Promise<string | null>;
  onMergeInstead: () => void;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, submit } = useSubmission();

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      contentLabel="タグの削除"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(onSubmit, 'タグの削除に失敗しました。');
        }}
        className="flex flex-col gap-4"
      >
        <p className="flex flex-wrap items-center gap-1">
          <TagLabel name={tag.name} />
          <span>を削除します。</span>
        </p>
        {tag.postCount > 0 ? (
          <div className="flex gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p>このタグは{tag.postCount}件の記事に設定されています。削除すると、これらの記事からタグが外れます。</p>
              {canMerge && (
                <p className="text-red-200/80">
                  同じ意味のタグがある場合は、
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={onMergeInstead}
                    className="text-emerald-300 underline hover:text-emerald-200"
                  >
                    統合
                  </button>
                  すると記事のタグを付け替えられます。
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">このタグはどの記事にも設定されていません。</p>
        )}
        <ErrorMessage message={error} />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-gray-600 hover:bg-gray-500`}
            disabled={isSubmitting}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-red-600 text-white hover:bg-red-700`}
            disabled={isSubmitting}
          >
            削除
          </button>
        </div>
      </form>
    </Modal>
  );
}


/**
 * タグの統合モーダル。統合元のタグを、選択したタグに置き換えて削除する。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function MergeTagModal({
  source,
  tags,
  onSubmit,
  onClose,
}: {
  /** 統合元のタグ */
  source: ManagedTag;
  /** 既存のタグ */
  tags: readonly ManagedTag[];
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: (targetId: number) => Promise<string | null>;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, setError, submit } = useSubmission();
  const [targetId, setTargetId] = useState('');
  const candidates = useMemo(
    () => tags.filter((tag) => tag.id !== source.id).toSorted((a, b) => a.name.localeCompare(b.name, 'ja')),
    [tags, source.id],
  );
  const target = candidates.find((tag) => String(tag.id) === targetId);

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      contentLabel="タグの統合"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!target) {
            setError('統合先のタグを選択してください。');
            return;
          }
          await submit(() => onSubmit(target.id), 'タグの統合に失敗しました。');
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">統合元</span>
          <p className="flex flex-wrap items-center gap-2">
            <TagLabel name={source.name} />
            <span className="text-sm text-gray-400">{source.postCount}件の記事</span>
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">統合先</span>
          <select
            value={targetId}
            autoFocus
            required
            onChange={(event) => {
              setTargetId(event.target.value);
              setError(null);
            }}
            className={INPUT_CLASS_NAME}
          >
            <option value="">タグを選択</option>
            {candidates.map((tag) => (
              <option key={tag.id} value={String(tag.id)}>#{tag.name}（{tag.postCount}件）</option>
            ))}
          </select>
        </label>
        {target && (
          <div
            className={
              'flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200'
            }
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              {source.postCount > 0
                ? `「#${source.name}」が設定されている${source.postCount}件の記事に「#${target.name}」を設定し、`
                : ''}
              「#{source.name}」を削除します。この操作は元に戻せません。
            </p>
          </div>
        )}
        <ErrorMessage message={error} />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-gray-600 hover:bg-gray-500`}
            disabled={isSubmitting}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-emerald-600 text-white hover:bg-emerald-700`}
            disabled={isSubmitting}
          >
            統合
          </button>
        </div>
      </form>
    </Modal>
  );
}


type TagManagerProperties = {
  initialTags: ManagedTag[];
  onCreate: (values: TagFormValues) => Promise<ActionResult<ManagedTag>>;
  onUpdate: (id: number, values: TagFormValues) => Promise<ActionResult<ManagedTag>>;
  onDelete: (id: number) => Promise<ActionResult>;
  onMerge: (sourceId: number, targetId: number) => Promise<ActionResult<ManagedTag>>;
};


/**
 * タグ管理画面を生成する。タグの一覧を表示し、作成・編集・削除・統合ができる。
 *
 * @param properties - 初期表示するタグと、タグを操作するServer Action
 * @returns 生成した画面
 */
export default function TagManager({
  initialTags,
  onCreate,
  onUpdate,
  onDelete,
  onMerge,
}: TagManagerProperties): JSX.Element {
  const searchInputReference = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<ManagedTag[]>(initialTags);
  const [filters, setFilters] = useState<TagListFilters>(DEFAULT_TAG_FILTERS);
  const [modal, setModal] = useState<ModalState | null>(null);

  const visibleTags = useMemo(() => filterAndSortTags(tags, filters), [tags, filters]);
  const usageCounts = useMemo(() => countByUsage(tags, filters.query), [tags, filters.query]);
  const isFiltered = filters.query.trim() !== '' || filters.usage !== DEFAULT_TAG_FILTERS.usage;
  const modalTarget = modal && modal.type !== 'create' ? tags.find((tag) => tag.id === modal.tagId) : undefined;

  /**
   * 表示条件を変更する。
   *
   * @param changes - 変更する条件
   */
  function updateFilters(changes: Partial<TagListFilters>): void {
    setFilters((previous) => ({ ...previous, ...changes }));
  }

  /**
   * 絞り込み条件を解除する（並び順は保つ）。
   */
  function clearFilters(): void {
    updateFilters({ query: DEFAULT_TAG_FILTERS.query, usage: DEFAULT_TAG_FILTERS.usage });
  }

  /**
   * 一覧のタグを置き換える（存在しない場合は追加する）。
   *
   * @param tag - 新しいタグ
   */
  function upsertTag(tag: ManagedTag): void {
    setTags((previous) => (
      previous.some((current) => current.id === tag.id)
        ? previous.map((current) => (current.id === tag.id ? tag : current))
        : [...previous, tag]
    ));
  }

  const closeModal = (): void => setModal(null);

  return (
    <div className="mx-auto flex flex-col gap-6 px-4 py-12">
      {modal?.type === 'create' && (
        <TagFormModal
          title="タグの作成"
          submitLabel="作成"
          submitClassName="bg-emerald-600 hover:bg-emerald-700"
          initialValues={{ name: '', slug: '' }}
          tags={tags}
          onSubmit={async (values) => {
            const result = await onCreate(values);
            if (!result.ok) {
              return result.error;
            }
            upsertTag(result.data);
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'edit' && modalTarget && (
        <TagFormModal
          title="タグの編集"
          submitLabel="保存"
          submitClassName="bg-blue-600 hover:bg-blue-700"
          initialValues={{ name: modalTarget.name, slug: modalTarget.slug }}
          originalSlug={modalTarget.slug}
          tags={tags}
          excludeId={modalTarget.id}
          onSubmit={async (values) => {
            // 変更がない場合は保存しない
            if (values.name === modalTarget.name && values.slug === modalTarget.slug) {
              closeModal();
              return null;
            }
            const result = await onUpdate(modalTarget.id, values);
            if (!result.ok) {
              return result.error;
            }
            upsertTag(result.data);
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'delete' && modalTarget && (
        <DeleteTagModal
          tag={modalTarget}
          canMerge={tags.length > 1}
          onSubmit={async () => {
            const result = await onDelete(modalTarget.id);
            if (!result.ok) {
              return result.error;
            }
            setTags((previous) => previous.filter((tag) => tag.id !== modalTarget.id));
            closeModal();
            return null;
          }}
          onMergeInstead={() => setModal({ type: 'merge', tagId: modalTarget.id })}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'merge' && modalTarget && (
        <MergeTagModal
          source={modalTarget}
          tags={tags}
          onSubmit={async (targetId) => {
            const result = await onMerge(modalTarget.id, targetId);
            if (!result.ok) {
              return result.error;
            }
            setTags((previous) => previous.filter((tag) => tag.id !== modalTarget.id));
            upsertTag(result.data);
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {/* ヘッダー */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/admin/control/posts"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            投稿一覧
          </Link>
          <h1 className="mt-2 text-2xl">タグ管理</h1>
          <p className="mt-1 text-sm text-gray-400">
            全{tags.length}件のタグ
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ type: 'create' })}
          className={PRIMARY_BUTTON_CLASS_NAME}
        >
          <Plus className="h-4 w-4" aria-hidden />
          新規タグ
        </button>
      </div>

      {tags.length === 0 ? (
        // タグが1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-4 py-16`}>
          <Tags className="h-10 w-10 text-gray-600" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-gray-200">まだタグがありません</p>
            <p className="text-sm text-gray-400">タグは、ここで作成するほか、記事の編集画面でも作成できます。</p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: 'create' })}
            className={`${PRIMARY_BUTTON_CLASS_NAME} text-sm`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            新規タグ
          </button>
        </div>
      ) : (
        <>
          {/* 使用状況による絞り込み */}
          <div role="group" aria-label="使用状況で絞り込む" className="flex flex-wrap gap-1">
            {USAGE_FILTERS.map((filter) => {
              const isSelected = filters.usage === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateFilters({ usage: filter.value })}
                  className={
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors '
                    + (isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200')
                  }
                >
                  {filter.label}
                  <span
                    className={
                      'rounded-full px-1.5 text-xs tabular-nums '
                      + (isSelected ? 'bg-emerald-500/25 text-emerald-100' : 'bg-gray-800 text-gray-400')
                    }
                  >
                    {usageCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* キーワード・並び順 */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden
              />
              <input
                ref={searchInputReference}
                type="search"
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && filters.query !== '') {
                    event.preventDefault();
                    updateFilters({ query: '' });
                  }
                }}
                placeholder="タグ名・スラッグで検索"
                aria-label="キーワードで検索"
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 py-2 pr-10 pl-9 text-sm text-gray-200 '
                  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 '
                  + '[&::-webkit-search-cancel-button]:hidden'
                }
              />
              {filters.query !== '' && (
                <button
                  type="button"
                  aria-label="キーワードを消去"
                  onClick={() => {
                    updateFilters({ query: '' });
                    searchInputReference.current?.focus();
                  }}
                  className={
                    'absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-700 '
                    + 'hover:text-white'
                  }
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <select
              aria-label="並び順"
              value={filters.sort}
              onChange={(event) => updateFilters({ sort: event.target.value as TagSortOrder })}
              className={
                'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
                + 'focus:outline-none focus:ring-2 focus:ring-emerald-500'
              }
            >
              {TAG_SORT_ORDERS.map((order) => (
                <option key={order.value} value={order.value}>{order.label}</option>
              ))}
            </select>
          </div>

          {/* 件数 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered ? `${tags.length}件中 ${visibleTags.length}件を表示` : `${visibleTags.length}件`}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                条件をクリア
              </button>
            )}
          </div>

          {visibleTags.length > 0 ? (
            // NOTE: スクリーンリーダー用の要素（sr-only）がはみ出さないよう、スクロール領域を基準に配置させる
            <div className="relative overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700 bg-gray-800/60 text-left text-xs text-gray-400">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium sm:px-4">タグ名</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">スラッグ</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium sm:px-4">記事数</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">作成日</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">更新日</th>
                    <th scope="col" className="px-1 py-2 sm:px-2">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {visibleTags.map((tag) => (
                    <tr key={tag.id} className="transition-colors hover:bg-gray-800/40">
                      <td className="px-3 py-2 sm:px-4">
                        {/* 表のセルには max-width が効かないため、内側の要素で長いタグ名を省略させる */}
                        <div className="max-w-30 sm:max-w-40 lg:max-w-56 xl:max-w-xs">
                          <TagLabel name={tag.name} />
                          <span className="mt-0.5 block truncate font-mono text-xs text-gray-500 sm:hidden">
                            {tag.slug}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-2 font-mono text-gray-400 sm:table-cell">
                        <div className="max-w-36 truncate lg:max-w-56 xl:max-w-xs" title={tag.slug}>{tag.slug}</div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums sm:px-4">
                        {tag.postCount > 0 ? (
                          <Link
                            href={`/admin/control/posts?tag=${encodeURIComponent(tag.slug)}`}
                            title={`タグ「${tag.name}」の記事を投稿管理で表示`}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            {tag.postCount}件
                          </Link>
                        ) : (
                          <span className="text-gray-500">未使用</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2 whitespace-nowrap text-gray-400 lg:table-cell">
                        <time dateTime={tag.createdAt.toISOString()} title={formatDateTime(tag.createdAt)}>
                          {formatDate(tag.createdAt)}
                        </time>
                      </td>
                      <td className="hidden px-4 py-2 whitespace-nowrap text-gray-400 lg:table-cell">
                        <time dateTime={tag.updatedAt.toISOString()} title={formatDateTime(tag.updatedAt)}>
                          {formatDate(tag.updatedAt)}
                        </time>
                      </td>
                      <td className="px-1 py-1 sm:px-2">
                        <div className="flex justify-end sm:gap-0.5">
                          <button
                            type="button"
                            aria-label={`タグ「${tag.name}」を編集`}
                            title="編集"
                            onClick={() => setModal({ type: 'edit', tagId: tag.id })}
                            className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                          >
                            <Pen className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`タグ「${tag.name}」を別のタグに統合`}
                            title={tags.length > 1 ? '別のタグに統合' : '統合先のタグがありません'}
                            disabled={tags.length <= 1}
                            onClick={() => setModal({ type: 'merge', tagId: tag.id })}
                            className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                          >
                            <Merge className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`タグ「${tag.name}」を削除`}
                            title="削除"
                            onClick={() => setModal({ type: 'delete', tagId: tag.id })}
                            className={`${ROW_BUTTON_CLASS_NAME} hover:text-red-400`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // 条件に一致するタグがない場合
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致するタグはありません</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                条件をクリア
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
