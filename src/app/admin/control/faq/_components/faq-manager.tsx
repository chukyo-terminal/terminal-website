'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import {
  ArrowDown, ArrowUp, ExternalLink, FolderPlus, MessageCircleQuestionMark, Pen, Plus, Trash2, X,
} from 'lucide-react';

import { PrivateBadge } from '../../posts/_components/post-status-badge';
import { formatDateTime } from '../../posts/_lib/date-format';
import {
  FAQ_ANSWER_MAX_LENGTH, FAQ_CATEGORY_TITLE_MAX_LENGTH, FAQ_QUESTION_MAX_LENGTH, FaqCategoryFormSchema, FaqFormSchema,
  moveItem, toAnswerExcerpt,
} from '../_lib/faq';
import Modal from '@/components/elements/modal';
import { faqMarkdownIt } from '@/lib/markdown-it';
import '@/styles/markdown.css';

import type { FormEvent, JSX } from 'react';
import type { ActionResult } from '@/types';
import type {
  FaqCategoryFormValues, FaqFormValues, FaqMutationResult, ManagedFaq, ManagedFaqCategory,
} from '../_lib/faq';


/**
 * 主要な操作ボタン（新規Q&A）の共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 font-medium '
  + 'text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-600';


/**
 * 補助的な操作ボタン（分類の追加）の共通クラス。
 */
const SECONDARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-2 rounded border border-gray-600 px-4 py-2 '
  + 'font-medium text-gray-200 hover:bg-gray-800';


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
 * 操作結果の通知を表示する時間（ms）。
 */
const NOTICE_DURATION = 5000;


/**
 * 表示中のモーダルと、その操作対象。
 */
type ModalState =
  | { type: 'create-category' }
  | { type: 'edit-category'; categoryId: number }
  | { type: 'delete-category'; categoryId: number }
  | { type: 'create-faq'; categoryId: number }
  | { type: 'edit-faq'; faqId: number }
  | { type: 'delete-faq'; faqId: number };


/**
 * 操作結果の通知。
 */
type Notice = {
  type: 'success' | 'error';
  message: string;
  /** 強調表示する行（`category-{ID}` または `faq-{ID}`） */
  highlight?: string;
};


/**
 * Q&Aのフォームで編集中の入力値。
 */
type FaqFormState = {
  categoryId: number;
  question: string;
  answer: string;
  isPrivate: boolean;
};


/**
 * Q&Aをフォームの初期値に変換する。
 *
 * @param faq - Q&A
 * @returns フォームの初期値
 */
function toFaqFormState(faq: ManagedFaq): FaqFormState {
  return { categoryId: faq.categoryId, question: faq.question, answer: faq.answer, isPrivate: faq.isPrivate };
}


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
 * モーダルの操作ボタン（キャンセル・送信）。
 *
 * @param properties - プロパティ
 * @returns ボタンの要素
 */
function ModalActions({
  submitLabel,
  submitClassName,
  isSubmitting,
  onDelete,
  onClose,
}: {
  submitLabel: string;
  submitClassName: string;
  isSubmitting: boolean;
  /** 削除処理を始める（編集時のみ） */
  onDelete?: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {onDelete && (
        <button
          type="button"
          className={
            `${MODAL_BUTTON_CLASS_NAME} mr-auto inline-flex items-center gap-1 text-red-400 hover:bg-red-500/10`
          }
          disabled={isSubmitting}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          削除
        </button>
      )}
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
  );
}


/**
 * 回答の Markdown を、公開ページと同じ見た目で表示する。
 *
 * @param properties - プロパティ
 * @returns 回答の要素
 */
function AnswerPreview({ markdown }: { markdown: string }): JSX.Element {
  if (markdown.trim() === '') {
    return <p className="text-sm text-gray-500">回答が入力されていません</p>;
  }
  return (
    <div
      className="markdown-body text-sm text-gray-300"
      // HTML を使用できない設定で変換するため、無害化は不要
      dangerouslySetInnerHTML={{ __html: faqMarkdownIt.render(markdown) }}
    />
  );
}


/**
 * 分類の追加・編集モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function CategoryFormModal({
  title,
  submitLabel,
  submitClassName,
  initialTitle,
  onSubmit,
  onDelete,
  onClose,
}: {
  title: string;
  submitLabel: string;
  submitClassName: string;
  initialTitle: string;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: (values: FaqCategoryFormValues) => Promise<string | null>;
  /** 削除処理を始める（編集時のみ） */
  onDelete?: () => void;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, setError, submit } = useSubmission();
  const [categoryTitle, setCategoryTitle] = useState(initialTitle);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values: FaqCategoryFormValues = { title: categoryTitle };
    const parsed = FaqCategoryFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    await submit(() => onSubmit(values), `分類の${onDelete ? '編集' : '追加'}に失敗しました。`);
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
          <span className="text-sm font-medium">分類名</span>
          <input
            type="text"
            name="title"
            value={categoryTitle}
            maxLength={FAQ_CATEGORY_TITLE_MAX_LENGTH}
            placeholder="例: 入会について"
            autoFocus
            required
            disabled={isSubmitting}
            onChange={(event) => {
              setCategoryTitle(event.target.value);
              setError(null);
            }}
            className={INPUT_CLASS_NAME}
          />
          <span className="text-xs text-gray-400">公開ページでは、分類ごとに見出しを付けてQ&Aを表示します。</span>
        </label>
        <ErrorMessage message={error} />
        <ModalActions
          submitLabel={submitLabel}
          submitClassName={submitClassName}
          isSubmitting={isSubmitting}
          onDelete={onDelete}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}


/**
 * 分類の削除モーダル。Q&Aが残っている場合は、削除できない理由を表示する。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function DeleteCategoryModal({
  category,
  onSubmit,
  onClose,
}: {
  category: ManagedFaqCategory;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: () => Promise<string | null>;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, submit } = useSubmission();
  const isInUse = category.faqs.length > 0;

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      contentLabel="分類の削除"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(onSubmit, '分類の削除に失敗しました。');
        }}
        className="flex flex-col gap-4"
      >
        <p className="rounded border border-gray-700 bg-gray-900/60 px-3 py-2 font-medium break-words">
          {category.title}
        </p>
        {isInUse ? (
          <p className="text-sm text-gray-300">
            この分類には{category.faqs.length}件のQ&Aがあるため、削除できません。
            先にQ&Aを編集して別の分類に移動するか、Q&Aを削除してください。
          </p>
        ) : (
          <p className="text-sm text-gray-300">この分類を削除します。この操作は元に戻せません。</p>
        )}
        <ErrorMessage message={error} />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-gray-600 hover:bg-gray-500`}
            disabled={isSubmitting}
            onClick={onClose}
            autoFocus={isInUse}
          >
            {isInUse ? '閉じる' : 'キャンセル'}
          </button>
          {!isInUse && (
            <button
              type="submit"
              className={`${MODAL_BUTTON_CLASS_NAME} bg-red-600 text-white hover:bg-red-700`}
              disabled={isSubmitting}
              autoFocus
            >
              削除
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}


/**
 * Q&Aの追加・編集モーダル。回答は Markdown で入力し、公開ページでの見た目を確認できる。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function FaqFormModal({
  title,
  submitLabel,
  submitClassName,
  categories,
  initialValues,
  onSubmit,
  onDelete,
  onClose,
}: {
  title: string;
  submitLabel: string;
  submitClassName: string;
  categories: readonly ManagedFaqCategory[];
  initialValues: FaqFormState;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: (values: FaqFormValues) => Promise<string | null>;
  /** 削除処理を始める（編集時のみ） */
  onDelete?: () => void;
  onClose: () => void;
}): JSX.Element {
  const tabsId = useId();
  const { isSubmitting, error, setError, submit } = useSubmission();
  const [values, setValues] = useState<FaqFormState>(initialValues);
  const [answerTab, setAnswerTab] = useState<'edit' | 'preview'>('edit');

  /**
   * 入力値を変更する。
   *
   * @param changes - 変更する値
   */
  function update(changes: Partial<FaqFormState>): void {
    setValues((previous) => ({ ...previous, ...changes }));
    setError(null);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formValues: FaqFormValues = values;
    const parsed = FaqFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    await submit(() => onSubmit(formValues), `Q&Aの${onDelete ? '編集' : '追加'}に失敗しました。`);
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
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">分類</span>
          <select
            name="categoryId"
            value={values.categoryId}
            disabled={isSubmitting}
            onChange={(event) => update({ categoryId: Number(event.target.value) })}
            className={INPUT_CLASS_NAME}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.title}</option>
            ))}
          </select>
          {onDelete && values.categoryId !== initialValues.categoryId && (
            <span className="text-xs text-gray-400">保存すると、変更先の分類の末尾に移動します。</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">質問</span>
          <input
            type="text"
            name="question"
            value={values.question}
            maxLength={FAQ_QUESTION_MAX_LENGTH}
            placeholder="例: プログラミングの経験がなくても入会できますか？"
            autoFocus
            required
            disabled={isSubmitting}
            onChange={(event) => update({ question: event.target.value })}
            className={INPUT_CLASS_NAME}
          />
        </label>
        <div className="flex flex-col gap-1">
          <div className="flex items-end justify-between gap-2">
            <span id={`${tabsId}-label`} className="text-sm font-medium">回答</span>
            <div role="tablist" aria-labelledby={`${tabsId}-label`} className="flex gap-1 text-sm">
              {([['edit', '編集'], ['preview', 'プレビュー']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${tab}-tab`}
                  aria-selected={answerTab === tab}
                  aria-controls={`${tabsId}-${tab}`}
                  onClick={() => setAnswerTab(tab)}
                  className={
                    'rounded px-3 py-1 transition-colors '
                    + (answerTab === tab
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-700/60 hover:text-gray-200')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {answerTab === 'edit' ? (
            <div id={`${tabsId}-edit`} role="tabpanel" aria-labelledby={`${tabsId}-edit-tab`}>
              <textarea
                name="answer"
                aria-labelledby={`${tabsId}-label`}
                value={values.answer}
                rows={10}
                maxLength={FAQ_ANSWER_MAX_LENGTH}
                placeholder="回答を入力"
                required
                disabled={isSubmitting}
                onChange={(event) => update({ answer: event.target.value })}
                className={`${INPUT_CLASS_NAME} resize-y text-sm leading-relaxed`}
              />
            </div>
          ) : (
            <div
              id={`${tabsId}-preview`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-preview-tab`}
              className="min-h-56 rounded border border-gray-600 bg-gray-900 px-3 py-2"
            >
              <AnswerPreview markdown={values.answer} />
            </div>
          )}
          <span className="flex flex-wrap justify-between gap-x-4 text-xs text-gray-400">
            <span>
              Markdown形式で入力できます。リンクは <code className="text-gray-300">[会則](/bylaws)</code> のように書きます。
              HTMLは使用できません。
            </span>
            <span className="tabular-nums">{values.answer.length} / {FAQ_ANSWER_MAX_LENGTH}</span>
          </span>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="isPrivate"
            checked={values.isPrivate}
            disabled={isSubmitting}
            onChange={(event) => update({ isPrivate: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-500"
          />
          <span>
            非公開にする
            <span className="block text-xs text-gray-400">公開ページには表示されません。下書きとして保存する場合などに使います。</span>
          </span>
        </label>
        <ErrorMessage message={error} />
        <ModalActions
          submitLabel={submitLabel}
          submitClassName={submitClassName}
          isSubmitting={isSubmitting}
          onDelete={onDelete}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}


/**
 * Q&Aの削除モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function DeleteFaqModal({
  faq,
  onSubmit,
  onClose,
}: {
  faq: ManagedFaq;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: () => Promise<string | null>;
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
      contentLabel="Q&Aの削除"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(onSubmit, 'Q&Aの削除に失敗しました。');
        }}
        className="flex flex-col gap-4"
      >
        <div className="space-y-1 rounded border border-gray-700 bg-gray-900/60 px-3 py-2">
          <p className="font-medium break-words">{faq.question}</p>
          <p className="line-clamp-2 text-xs break-words text-gray-400">{toAnswerExcerpt(faq.answer)}</p>
        </div>
        <p className="text-sm text-gray-300">
          このQ&Aを削除します。この操作は元に戻せません。
          {!faq.isPrivate && '公開ページからも削除されます。'}
        </p>
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
            autoFocus
          >
            削除
          </button>
        </div>
      </form>
    </Modal>
  );
}


/**
 * 並べ替えボタン（上へ・下へ）。
 *
 * @param properties - プロパティ
 * @returns ボタンの要素
 */
function MoveButtons({
  label,
  index,
  count,
  onMove,
}: {
  /** 操作対象の名前（読み上げ用） */
  label: string;
  index: number;
  count: number;
  onMove: (offset: -1 | 1) => void;
}): JSX.Element {
  return (
    <>
      <button
        type="button"
        aria-label={`${label}を上に移動`}
        title="上に移動"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`${label}を下に移動`}
        title="下に移動"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}


type FaqManagerProperties = {
  initialCategories: ManagedFaqCategory[];
  onCreateCategory: (values: FaqCategoryFormValues) => Promise<ActionResult<FaqMutationResult>>;
  onUpdateCategory: (id: number, values: FaqCategoryFormValues) => Promise<ActionResult<FaqMutationResult>>;
  onDeleteCategory: (id: number) => Promise<ActionResult<ManagedFaqCategory[]>>;
  onReorderCategories: (orderedIds: number[]) => Promise<ActionResult<ManagedFaqCategory[]>>;
  onCreateFaq: (values: FaqFormValues) => Promise<ActionResult<FaqMutationResult>>;
  onUpdateFaq: (id: number, values: FaqFormValues) => Promise<ActionResult<FaqMutationResult>>;
  onDeleteFaq: (id: number) => Promise<ActionResult<ManagedFaqCategory[]>>;
  onReorderFaqs: (categoryId: number, orderedIds: number[]) => Promise<ActionResult<ManagedFaqCategory[]>>;
};


/**
 * Q&A管理画面を生成する。分類ごとにQ&Aを表示し、追加・編集・削除・並べ替えができる。
 *
 * @param properties - 初期表示する分類と、分類・Q&Aを操作するServer Action
 * @returns 生成した画面
 */
export default function FaqManager({
  initialCategories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onReorderCategories,
  onCreateFaq,
  onUpdateFaq,
  onDeleteFaq,
  onReorderFaqs,
}: FaqManagerProperties): JSX.Element {
  const [categories, setCategories] = useState<ManagedFaqCategory[]>(initialCategories);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const allFaqs = categories.flatMap((category) => category.faqs);
  const privateCount = allFaqs.filter((faq) => faq.isPrivate).length;
  const modalCategory = modal && (modal.type === 'edit-category' || modal.type === 'delete-category')
    ? categories.find((category) => category.id === modal.categoryId)
    : undefined;
  const modalFaq = modal && (modal.type === 'edit-faq' || modal.type === 'delete-faq')
    ? allFaqs.find((faq) => faq.id === modal.faqId)
    : undefined;

  // 操作結果の通知は、一定時間で消す
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [notice]);

  const closeModal = (): void => setModal(null);

  /**
   * 並べ替えを行う。結果を待たずに一覧に反映し、失敗した場合は元に戻す。
   *
   * @param reordered - 並べ替え後の分類
   * @param action - 並べ替えを保存する処理
   * @param fallback - 想定外のエラーの場合のメッセージ
   */
  async function reorder(
    reordered: ManagedFaqCategory[],
    action: () => Promise<ActionResult<ManagedFaqCategory[]>>,
    fallback: string,
  ): Promise<void> {
    // 保存中に続けて並べ替えると、保存の順序が前後するおそれがあるため受け付けない
    if (isReordering) {
      return;
    }
    const previous = categories;
    setCategories(reordered);
    setIsReordering(true);
    try {
      const result = await action();
      if (result.ok) {
        setCategories(result.data);
      } else {
        setCategories(previous);
        setNotice({ type: 'error', message: result.error });
      }
    } catch (e) {
      console.error(fallback, e);
      setCategories(previous);
      setNotice({ type: 'error', message: fallback });
    } finally {
      setIsReordering(false);
    }
  }

  /**
   * 分類を1つ移動する。
   *
   * @param index - 移動する分類の位置
   * @param offset - 移動する方向
   */
  function moveCategory(index: number, offset: -1 | 1): void {
    const moved = moveItem(categories, index, offset);
    if (moved) {
      void reorder(moved, () => onReorderCategories(moved.map((category) => category.id)), '分類の並べ替えに失敗しました。');
    }
  }

  /**
   * 分類内でQ&Aを1つ移動する。
   *
   * @param category - Q&Aの分類
   * @param index - 移動するQ&Aの位置
   * @param offset - 移動する方向
   */
  function moveFaq(category: ManagedFaqCategory, index: number, offset: -1 | 1): void {
    const moved = moveItem(category.faqs, index, offset);
    if (moved) {
      void reorder(
        categories.map((current) => (current.id === category.id ? { ...current, faqs: moved } : current)),
        () => onReorderFaqs(category.id, moved.map((faq) => faq.id)),
        'Q&Aの並べ替えに失敗しました。',
      );
    }
  }

  return (
    <div className="mx-auto flex flex-col gap-6 px-4 py-12">
      {modal?.type === 'create-category' && (
        <CategoryFormModal
          title="分類の追加"
          submitLabel="追加"
          submitClassName="bg-emerald-600 hover:bg-emerald-700"
          initialTitle=""
          onSubmit={async (values) => {
            const result = await onCreateCategory(values);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data.categories);
            setNotice({
              type: 'success',
              message: `分類「${values.title.trim()}」を追加しました。`,
              highlight: `category-${result.data.id}`,
            });
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'edit-category' && modalCategory && (
        <CategoryFormModal
          title="分類の編集"
          submitLabel="保存"
          submitClassName="bg-blue-600 hover:bg-blue-700"
          initialTitle={modalCategory.title}
          onSubmit={async (values) => {
            // 変更がない場合は保存しない
            if (values.title.trim() === modalCategory.title) {
              closeModal();
              return null;
            }
            const result = await onUpdateCategory(modalCategory.id, values);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data.categories);
            setNotice({
              type: 'success',
              message: `分類「${values.title.trim()}」を保存しました。`,
              highlight: `category-${result.data.id}`,
            });
            closeModal();
            return null;
          }}
          onDelete={() => setModal({ type: 'delete-category', categoryId: modalCategory.id })}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'delete-category' && modalCategory && (
        <DeleteCategoryModal
          category={modalCategory}
          onSubmit={async () => {
            const result = await onDeleteCategory(modalCategory.id);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data);
            setNotice({ type: 'success', message: `分類「${modalCategory.title}」を削除しました。` });
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'create-faq' && (
        <FaqFormModal
          title="Q&Aの追加"
          submitLabel="追加"
          submitClassName="bg-emerald-600 hover:bg-emerald-700"
          categories={categories}
          initialValues={{ categoryId: modal.categoryId, question: '', answer: '', isPrivate: false }}
          onSubmit={async (values) => {
            const result = await onCreateFaq(values);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data.categories);
            setNotice({
              type: 'success',
              message: `「${values.question.trim()}」を追加しました。`,
              highlight: `faq-${result.data.id}`,
            });
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'edit-faq' && modalFaq && (
        <FaqFormModal
          title="Q&Aの編集"
          submitLabel="保存"
          submitClassName="bg-blue-600 hover:bg-blue-700"
          categories={categories}
          initialValues={toFaqFormState(modalFaq)}
          onSubmit={async (values) => {
            const original = toFaqFormState(modalFaq);
            // 変更がない場合は保存しない
            if (
              values.categoryId === original.categoryId
              && values.question.trim() === original.question
              && values.answer.trim() === original.answer
              && values.isPrivate === original.isPrivate
            ) {
              closeModal();
              return null;
            }
            const result = await onUpdateFaq(modalFaq.id, values);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data.categories);
            setNotice({
              type: 'success',
              message: `「${values.question.trim()}」を保存しました。`,
              highlight: `faq-${result.data.id}`,
            });
            closeModal();
            return null;
          }}
          onDelete={() => setModal({ type: 'delete-faq', faqId: modalFaq.id })}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'delete-faq' && modalFaq && (
        <DeleteFaqModal
          faq={modalFaq}
          onSubmit={async () => {
            const result = await onDeleteFaq(modalFaq.id);
            if (!result.ok) {
              return result.error;
            }
            setCategories(result.data);
            setNotice({ type: 'success', message: `「${modalFaq.question}」を削除しました。` });
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {/* ヘッダー */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Q&A管理</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>
              全{allFaqs.length}件のQ&A
              {privateCount > 0 && `（うち非公開${privateCount}件）`}
            </span>
            <Link
              href="/faq"
              target="_blank"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              公開ページを表示
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModal({ type: 'create-category' })}
            className={SECONDARY_BUTTON_CLASS_NAME}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            分類を追加
          </button>
          {categories.length > 0 && (
            <button
              type="button"
              onClick={() => setModal({ type: 'create-faq', categoryId: categories[0].id })}
              className={PRIMARY_BUTTON_CLASS_NAME}
            >
              <Plus className="h-4 w-4" aria-hidden />
              新規Q&A
            </button>
          )}
        </div>
      </div>

      {/* 操作結果の通知 */}
      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <p
            className={
              'flex items-start gap-2 rounded border px-3 py-2 text-sm '
              + (notice.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200')
            }
          >
            <span className="flex-1">{notice.message}</span>
            <button
              type="button"
              aria-label="通知を閉じる"
              onClick={() => setNotice(null)}
              className="rounded p-0.5 hover:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </p>
        )}
      </div>

      {categories.length === 0 ? (
        // 分類が1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-4 py-16`}>
          <MessageCircleQuestionMark className="h-10 w-10 text-gray-600" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-gray-200">まだ分類がありません</p>
            <p className="text-sm text-gray-400">
              Q&Aは分類ごとに表示します。まず「入会について」などの分類を追加してください。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: 'create-category' })}
            className={`${PRIMARY_BUTTON_CLASS_NAME} text-sm`}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            分類を追加
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {categories.map((category, categoryIndex) => (
            <section
              key={category.id}
              aria-labelledby={`faq-category-${category.id}`}
              className={
                'overflow-hidden rounded-lg border transition-colors duration-700 '
                + (notice?.highlight === `category-${category.id}` ? 'border-emerald-500/60' : 'border-gray-700')
              }
            >
              <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800/60 py-2 pr-2 pl-4">
                <h2 id={`faq-category-${category.id}`} className="min-w-0 flex-1 font-semibold break-words">
                  {category.title}
                  <span className="ml-2 text-xs font-normal text-gray-400 tabular-nums">{category.faqs.length}件</span>
                </h2>
                <div className="flex shrink-0 sm:gap-0.5">
                  <MoveButtons
                    label={`分類「${category.title}」`}
                    index={categoryIndex}
                    count={categories.length}
                    onMove={(offset) => moveCategory(categoryIndex, offset)}
                  />
                  <button
                    type="button"
                    aria-label={`分類「${category.title}」を編集`}
                    title="分類を編集"
                    onClick={() => setModal({ type: 'edit-category', categoryId: category.id })}
                    className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                  >
                    <Pen className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`分類「${category.title}」を削除`}
                    title="分類を削除"
                    onClick={() => setModal({ type: 'delete-category', categoryId: category.id })}
                    className={`${ROW_BUTTON_CLASS_NAME} hover:text-red-400`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              {category.faqs.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">この分類にはまだQ&Aがありません</p>
              ) : (
                <ol className="divide-y divide-gray-800">
                  {category.faqs.map((faq, faqIndex) => (
                    <li
                      key={faq.id}
                      className={
                        'flex items-start gap-3 py-3 pr-2 pl-4 transition-colors duration-700 '
                        + (notice?.highlight === `faq-${faq.id}` ? 'bg-emerald-500/10' : 'hover:bg-gray-800/40')
                      }
                    >
                      <span className="mt-0.5 text-sm font-bold text-emerald-400" aria-hidden>Q.</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'edit-faq', faqId: faq.id })}
                            className={
                              'max-w-full text-left font-medium break-words text-gray-100 hover:text-emerald-300'
                            }
                          >
                            {faq.question}
                          </button>
                          {faq.isPrivate && <PrivateBadge />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs break-words text-gray-400">
                          {toAnswerExcerpt(faq.answer)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          <time dateTime={faq.updatedAt.toISOString()}>更新: {formatDateTime(faq.updatedAt)}</time>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end sm:gap-0.5">
                        <MoveButtons
                          label={`Q&A「${faq.question}」`}
                          index={faqIndex}
                          count={category.faqs.length}
                          onMove={(offset) => moveFaq(category, faqIndex, offset)}
                        />
                        {!faq.isPrivate && (
                          <Link
                            href={`/faq#faq-${faq.id}`}
                            target="_blank"
                            aria-label={`Q&A「${faq.question}」を公開ページで表示`}
                            title="公開ページで表示"
                            className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden />
                          </Link>
                        )}
                        <button
                          type="button"
                          aria-label={`Q&A「${faq.question}」を編集`}
                          title="編集"
                          onClick={() => setModal({ type: 'edit-faq', faqId: faq.id })}
                          className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                        >
                          <Pen className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Q&A「${faq.question}」を削除`}
                          title="削除"
                          onClick={() => setModal({ type: 'delete-faq', faqId: faq.id })}
                          className={`${ROW_BUTTON_CLASS_NAME} hover:text-red-400`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <div className="border-t border-gray-800 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setModal({ type: 'create-faq', categoryId: category.id })}
                  className={
                    'inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300 hover:underline'
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  この分類にQ&Aを追加
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
