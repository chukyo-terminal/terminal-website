'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  ExternalLink, FileText, Pen, Plus, Search, SearchX, Sparkles, Trash2, TriangleAlert, Trophy, X,
} from 'lucide-react';

import { PostStatusBadge, PrivateBadge } from '../../posts/_components/post-status-badge';
import { formatDate, formatDateTime } from '../../posts/_lib/date-format';
import {
  ACHIEVEMENT_SORT_ORDERS, ACHIEVEMENT_TITLE_MAX_LENGTH, AchievementFormSchema, DEFAULT_ACHIEVEMENT_FILTERS,
  LINK_FILTERS, countByLink, filterAndSortAchievements, formatAchievementDate, listFiscalYears, searchRelatedPosts,
} from '../_lib/achievement';
import Modal from '@/components/elements/modal';

import type { FormEvent, JSX } from 'react';
import type { ActionResult } from '@/types';
import type {
  Achievement, AchievementFormValues, AchievementListFilters, AchievementSortOrder, RelatedPostMap,
  RelatedPostOption,
} from '../_lib/achievement';


/**
 * 主要な操作ボタン（新規実績）の共通クラス。
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
 * 絞り込み・並び順の入力欄の共通クラス。
 */
const FILTER_SELECT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500';


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
 * 警告の共通クラス。
 */
const WARNING_CLASS_NAME = 'flex gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs '
  + 'text-amber-200';


/**
 * 関連記事の候補として一度に表示する件数。
 */
const MAX_POST_SUGGESTIONS = 20;


/**
 * 操作結果の通知を表示する時間（ms）。
 */
const NOTICE_DURATION = 5000;


/**
 * 表示中のモーダルと、その操作対象の実績。
 */
type ModalState =
  | { type: 'create' }
  | { type: 'edit'; achievementId: number }
  | { type: 'delete'; achievementId: number };


/**
 * フォームで編集中の入力値。
 */
type FormState = {
  title: string;
  description: string;
  /** YYYY-MM-DD（未入力の場合は空文字列） */
  date: string;
  postId: number | null;
};


/**
 * 日時を、日本標準時の日付（YYYY-MM-DD）に変換する。
 *
 * @param date - 日時
 * @returns 日付（YYYY-MM-DD）
 */
const toDateInputValue = (date: Date): string => formatDate(date).replaceAll('/', '-');


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
 * 記事がサイトに表示されていないことを表すバッジ。
 *
 * @returns バッジ
 */
function HiddenPostBadge(): JSX.Element {
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/60 px-2.5 py-0.5 text-xs '
        + 'whitespace-nowrap text-amber-300'
      }
      title="記事がサイトに表示されていないため、活動実績のページに関連記事として表示されません"
    >
      <TriangleAlert className="h-3 w-3" aria-hidden />
      サイトに非表示
    </span>
  );
}


/**
 * 記事の状態を表すバッジ。サイトに表示されている場合は表示しない。
 *
 * @param properties - プロパティ
 * @returns バッジ
 */
function RelatedPostBadges({ post }: { post: RelatedPostOption }): JSX.Element | null {
  if (post.publicPath) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-1">
      <HiddenPostBadge />
      {post.isPrivate ? <PrivateBadge /> : post.status === 'draft' && <PostStatusBadge status={post.status} />}
    </span>
  );
}


/**
 * 記事の編集画面・公開ページへのリンク。
 *
 * @param properties - プロパティ
 * @returns リンクの要素
 */
function RelatedPostLinks({ post }: { post: RelatedPostOption }): JSX.Element {
  return (
    <span className="flex shrink-0 items-center">
      <Link
        href={`/admin/control/posts/${post.id}`}
        target="_blank"
        aria-label={`記事「${post.title}」の編集画面を新しいタブで開く`}
        title="記事の編集画面を開く"
        className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
      >
        <Pen className="h-3.5 w-3.5" aria-hidden />
      </Link>
      {post.publicPath && (
        <Link
          href={post.publicPath}
          target="_blank"
          aria-label={`記事「${post.title}」の公開ページを新しいタブで開く`}
          title="記事の公開ページを開く"
          className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </span>
  );
}


/**
 * 関連記事の選択欄。記事のタイトル・スラッグで検索して選択する。
 *
 * @param properties - プロパティ
 * @returns 選択欄の要素
 */
function RelatedPostPicker({
  posts,
  postsById,
  value,
  disabled,
  onChange,
}: {
  posts: readonly RelatedPostOption[];
  postsById: RelatedPostMap;
  value: number | null;
  disabled: boolean;
  onChange: (post: RelatedPostOption | null) => void;
}): JSX.Element {
  const listboxId = useId();
  const inputReference = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const candidates = useMemo(() => searchRelatedPosts(posts, query), [posts, query]);
  const visibleCandidates = candidates.slice(0, MAX_POST_SUGGESTIONS);

  if (value !== null) {
    const selected = postsById.get(value);
    return (
      <div className="flex items-start gap-2 rounded border border-gray-600 bg-gray-900 px-3 py-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          {selected ? (
            <>
              <p className="truncate text-sm text-gray-100" title={selected.title}>{selected.title}</p>
              <p className="truncate font-mono text-xs text-gray-500">{selected.publicPath ?? selected.slug}</p>
              <RelatedPostBadges post={selected} />
            </>
          ) : (
            <p className="text-sm text-gray-400">記事が見つかりません（削除された可能性があります）</p>
          )}
        </div>
        {selected && <RelatedPostLinks post={selected} />}
        <button
          type="button"
          aria-label="関連記事の設定を解除"
          title="解除"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setQuery('');
            setIsOpen(true);
            // 解除した後は、そのまま別の記事を検索できるようにする
            requestAnimationFrame(() => inputReference.current?.focus());
          }}
          className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  /**
   * 記事を選択する。
   *
   * @param post - 選択した記事
   */
  function select(post: RelatedPostOption): void {
    onChange(post);
    setIsOpen(false);
    setQuery('');
  }

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
          aria-hidden
        />
        <input
          ref={inputReference}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && visibleCandidates[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          value={query}
          disabled={disabled}
          placeholder={posts.length > 0 ? '記事のタイトル・スラッグで検索' : '記事がありません'}
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case 'ArrowDown': {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((index) => Math.min(index + 1, visibleCandidates.length - 1));
                break;
              }
              case 'ArrowUp': {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
                break;
              }
              case 'Enter': {
                // 候補の一覧を表示している間は、フォームを送信せずに記事を選択する
                if (isOpen && visibleCandidates[activeIndex]) {
                  event.preventDefault();
                  select(visibleCandidates[activeIndex]);
                }
                break;
              }
              case 'Escape': {
                // 候補の一覧だけを閉じ、モーダルは閉じない
                if (isOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsOpen(false);
                }
                break;
              }
            }
          }}
          className={`${INPUT_CLASS_NAME} pl-9 text-sm`}
        />
      </div>
      {isOpen && posts.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="関連記事の候補"
          className="mt-1 max-h-52 overflow-y-auto rounded border border-gray-600 bg-gray-900 py-1 text-sm"
        >
          {visibleCandidates.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">一致する記事はありません</li>
          ) : visibleCandidates.map((post, index) => (
            <li
              key={post.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // 入力欄からフォーカスが外れて一覧が閉じないよう、マウスダウンの既定の動作を止める
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(post)}
              className={
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 '
                + (index === activeIndex ? 'bg-gray-700/70' : '')
              }
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gray-100">{post.title}</span>
                <span className="block truncate font-mono text-xs text-gray-500">{post.slug}</span>
              </span>
              {!post.publicPath && <span className="shrink-0 text-xs text-amber-300">非表示</span>}
            </li>
          ))}
          {candidates.length > visibleCandidates.length && (
            <li className="px-3 py-1.5 text-xs text-gray-500">
              他{candidates.length - visibleCandidates.length}件。キーワードで絞り込んでください。
            </li>
          )}
        </ul>
      )}
    </div>
  );
}


/**
 * 実績の追加・編集モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function AchievementFormModal({
  title,
  submitLabel,
  submitClassName,
  initialValues,
  posts,
  postsById,
  onSubmit,
  onDelete,
  onClose,
}: {
  title: string;
  submitLabel: string;
  submitClassName: string;
  initialValues: FormState;
  posts: readonly RelatedPostOption[];
  postsById: RelatedPostMap;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: (values: AchievementFormValues) => Promise<string | null>;
  /** 削除処理を始める（編集時のみ） */
  onDelete?: () => void;
  onClose: () => void;
}): JSX.Element {
  const { isSubmitting, error, setError, submit } = useSubmission();
  const [values, setValues] = useState<FormState>(initialValues);
  const [autofilled, setAutofilled] = useState<string[]>([]);
  const selectedPost = values.postId === null ? undefined : postsById.get(values.postId);
  const isDescriptionRequired = values.postId === null;

  /**
   * 入力値を変更する。
   *
   * @param changes - 変更する値
   */
  function update(changes: Partial<FormState>): void {
    setValues((previous) => ({ ...previous, ...changes }));
    setError(null);
  }

  /**
   * 関連記事を変更する。タイトル・日付が未入力の場合は、記事のタイトル・公開日を入力する。
   *
   * @param post - 選択した記事（解除した場合は `null`）
   */
  function changePost(post: RelatedPostOption | null): void {
    if (!post) {
      update({ postId: null });
      setAutofilled([]);
      return;
    }
    const changes: Partial<FormState> = { postId: post.id };
    const filled: string[] = [];
    if (values.title.trim() === '') {
      changes.title = post.title.slice(0, ACHIEVEMENT_TITLE_MAX_LENGTH);
      filled.push('タイトル');
    }
    if (values.date === '' && post.firstPublishedAt) {
      changes.date = toDateInputValue(post.firstPublishedAt);
      filled.push('日付');
    }
    update(changes);
    setAutofilled(filled);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const formValues: AchievementFormValues = values;
    const parsed = AchievementFormSchema.safeParse(formValues);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    await submit(() => onSubmit(formValues), `実績の${onDelete ? '編集' : '追加'}に失敗しました。`);
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
          <span className="text-sm font-medium">タイトル</span>
          <input
            type="text"
            name="title"
            value={values.title}
            maxLength={ACHIEVEMENT_TITLE_MAX_LENGTH}
            placeholder="例: ○○ハッカソン 最優秀賞"
            autoFocus
            required
            disabled={isSubmitting}
            onChange={(event) => update({ title: event.target.value })}
            className={INPUT_CLASS_NAME}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">日付</span>
          <input
            type="date"
            name="date"
            value={values.date}
            required
            disabled={isSubmitting}
            onChange={(event) => update({ date: event.target.value })}
            className={`${INPUT_CLASS_NAME} scheme-dark`}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            関連記事
            <span className="ml-2 text-xs font-normal text-gray-400">任意</span>
          </span>
          <RelatedPostPicker
            posts={posts}
            postsById={postsById}
            value={values.postId}
            disabled={isSubmitting}
            onChange={changePost}
          />
          {autofilled.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              記事から{autofilled.join('と')}を入力しました。
            </span>
          )}
          {selectedPost && !selectedPost.publicPath && (
            <p className={`${WARNING_CLASS_NAME} mt-1`}>
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                この記事は現在サイトに表示されていないため、活動実績のページには関連記事として表示されません。
                記事が公開されると表示されます。
              </span>
            </p>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            説明
            <span className="ml-2 text-xs font-normal text-gray-400">{isDescriptionRequired ? '必須' : '任意'}</span>
          </span>
          <textarea
            name="description"
            value={values.description}
            rows={4}
            placeholder={selectedPost?.description ?? '実績の内容を入力'}
            required={isDescriptionRequired}
            disabled={isSubmitting}
            onChange={(event) => update({ description: event.target.value })}
            className={`${INPUT_CLASS_NAME} resize-y`}
          />
          <span className="text-xs text-gray-400">
            {isDescriptionRequired
              ? '関連記事を設定した場合は省略できます。'
              : '省略した場合、活動実績のページでは関連記事の概要のみが表示されます。'}
          </span>
        </label>
        <ErrorMessage message={error} />
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
      </form>
    </Modal>
  );
}


/**
 * 実績の削除モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function DeleteAchievementModal({
  achievement,
  post,
  onSubmit,
  onClose,
}: {
  achievement: Achievement;
  post: RelatedPostOption | undefined;
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
      contentLabel="実績の削除"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(onSubmit, '実績の削除に失敗しました。');
        }}
        className="flex flex-col gap-4"
      >
        <div className="space-y-1 rounded border border-gray-700 bg-gray-900/60 px-3 py-2">
          <p className="text-xs text-gray-400 tabular-nums">{formatAchievementDate(achievement.date)}</p>
          <p className="font-medium break-words">{achievement.title}</p>
          {post && (
            <p className="flex items-center gap-1 text-xs text-gray-400">
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{post.title}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-gray-300">
          この実績を削除します。この操作は元に戻せません。
          {post && '関連記事は削除されません。'}
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
 * 一覧の関連記事の表示。
 *
 * @param properties - プロパティ
 * @returns 関連記事の要素
 */
function RelatedPostCell({
  postId,
  post,
}: {
  postId: number | null;
  post: RelatedPostOption | undefined;
}): JSX.Element {
  if (postId === null) {
    return <span className="text-gray-500">なし</span>;
  }
  if (!post) {
    return <span className="text-gray-500">記事が見つかりません</span>;
  }
  return (
    <div className="flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          <span className="truncate" title={post.title}>{post.title}</span>
        </p>
        <RelatedPostBadges post={post} />
      </div>
      <RelatedPostLinks post={post} />
    </div>
  );
}


type AchievementManagerProperties = {
  initialAchievements: Achievement[];
  /** 関連記事として選択できる記事 */
  posts: RelatedPostOption[];
  onCreate: (values: AchievementFormValues) => Promise<ActionResult<Achievement>>;
  onUpdate: (id: number, values: AchievementFormValues) => Promise<ActionResult<Achievement>>;
  onDelete: (id: number) => Promise<ActionResult>;
};


/**
 * 実績管理画面を生成する。実績の一覧を表示し、追加・編集・削除ができる。
 *
 * @param properties - 初期表示する実績、関連記事の候補と、実績を操作するServer Action
 * @returns 生成した画面
 */
export default function AchievementManager({
  initialAchievements,
  posts,
  onCreate,
  onUpdate,
  onDelete,
}: AchievementManagerProperties): JSX.Element {
  const searchInputReference = useRef<HTMLInputElement>(null);
  const [achievements, setAchievements] = useState<Achievement[]>(initialAchievements);
  const [filters, setFilters] = useState<AchievementListFilters>(DEFAULT_ACHIEVEMENT_FILTERS);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);

  const postsById = useMemo<RelatedPostMap>(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const visibleAchievements = useMemo(
    () => filterAndSortAchievements(achievements, postsById, filters),
    [achievements, postsById, filters],
  );
  const linkCounts = useMemo(() => countByLink(achievements, postsById, filters), [achievements, postsById, filters]);
  const fiscalYears = useMemo(() => listFiscalYears(achievements), [achievements]);
  const isFiltered = filters.query.trim() !== ''
    || filters.link !== DEFAULT_ACHIEVEMENT_FILTERS.link
    || filters.fiscalYear !== DEFAULT_ACHIEVEMENT_FILTERS.fiscalYear;
  const modalTarget = modal && modal.type !== 'create'
    ? achievements.find((achievement) => achievement.id === modal.achievementId)
    : undefined;

  // 操作結果の通知は、一定時間で消す
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * 表示条件を変更する。
   *
   * @param changes - 変更する条件
   */
  function updateFilters(changes: Partial<AchievementListFilters>): void {
    setFilters((previous) => ({ ...previous, ...changes }));
  }

  /**
   * 絞り込み条件を解除する（並び順は保つ）。
   */
  function clearFilters(): void {
    updateFilters({
      query: DEFAULT_ACHIEVEMENT_FILTERS.query,
      link: DEFAULT_ACHIEVEMENT_FILTERS.link,
      fiscalYear: DEFAULT_ACHIEVEMENT_FILTERS.fiscalYear,
    });
  }

  /**
   * 一覧の実績を置き換え（存在しない場合は追加し）、結果を通知する。
   *
   * @param achievement - 新しい実績
   * @param action - 行った操作の名前
   */
  function upsertAchievement(achievement: Achievement, action: string): void {
    setAchievements((previous) => (
      previous.some((current) => current.id === achievement.id)
        ? previous.map((current) => (current.id === achievement.id ? achievement : current))
        : [...previous, achievement]
    ));
    const isVisible = filterAndSortAchievements([achievement], postsById, filters).length > 0;
    setNotice({
      id: achievement.id,
      message: `「${achievement.title}」を${action}しました。`
        + (isVisible ? '' : '現在の表示条件では一覧に表示されません。'),
    });
  }

  /**
   * 実績をフォームの初期値に変換する。
   *
   * @param achievement - 実績
   * @returns フォームの初期値
   */
  function toFormState(achievement: Achievement): FormState {
    return {
      title: achievement.title,
      description: achievement.description ?? '',
      date: achievement.date,
      postId: achievement.postId,
    };
  }

  const closeModal = (): void => setModal(null);
  const openCreateModal = (): void => setModal({ type: 'create' });

  return (
    <div className="mx-auto flex flex-col gap-6 px-4 py-12">
      {modal?.type === 'create' && (
        <AchievementFormModal
          title="実績の追加"
          submitLabel="追加"
          submitClassName="bg-emerald-600 hover:bg-emerald-700"
          initialValues={{ title: '', description: '', date: '', postId: null }}
          posts={posts}
          postsById={postsById}
          onSubmit={async (values) => {
            const result = await onCreate(values);
            if (!result.ok) {
              return result.error;
            }
            upsertAchievement(result.data, '追加');
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'edit' && modalTarget && (
        <AchievementFormModal
          title="実績の編集"
          submitLabel="保存"
          submitClassName="bg-blue-600 hover:bg-blue-700"
          initialValues={toFormState(modalTarget)}
          posts={posts}
          postsById={postsById}
          onSubmit={async (values) => {
            const original = toFormState(modalTarget);
            // 変更がない場合は保存しない
            if (
              values.title.trim() === original.title
              && (values.description ?? '').trim() === original.description
              && values.date === original.date
              && values.postId === original.postId
            ) {
              closeModal();
              return null;
            }
            const result = await onUpdate(modalTarget.id, values);
            if (!result.ok) {
              return result.error;
            }
            upsertAchievement(result.data, '保存');
            closeModal();
            return null;
          }}
          onDelete={() => setModal({ type: 'delete', achievementId: modalTarget.id })}
          onClose={closeModal}
        />
      )}

      {modal?.type === 'delete' && modalTarget && (
        <DeleteAchievementModal
          achievement={modalTarget}
          post={modalTarget.postId === null ? undefined : postsById.get(modalTarget.postId)}
          onSubmit={async () => {
            const result = await onDelete(modalTarget.id);
            if (!result.ok) {
              return result.error;
            }
            setAchievements((previous) => previous.filter((achievement) => achievement.id !== modalTarget.id));
            setNotice({ id: modalTarget.id, message: `「${modalTarget.title}」を削除しました。` });
            closeModal();
            return null;
          }}
          onClose={closeModal}
        />
      )}

      {/* ヘッダー */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">活動実績管理</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
            <span>全{achievements.length}件の実績</span>
            <Link
              href="/achievements"
              target="_blank"
              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              公開ページを表示
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </p>
        </div>
        <button type="button" onClick={openCreateModal} className={PRIMARY_BUTTON_CLASS_NAME}>
          <Plus className="h-4 w-4" aria-hidden />
          新規実績
        </button>
      </div>

      {/* 操作結果の通知 */}
      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <p
            className={
              'flex items-start gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm '
              + 'text-emerald-200'
            }
          >
            <span className="flex-1">{notice.message}</span>
            <button
              type="button"
              aria-label="通知を閉じる"
              onClick={() => setNotice(null)}
              className="rounded p-0.5 text-emerald-300 hover:bg-emerald-500/20"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </p>
        )}
      </div>

      {achievements.length === 0 ? (
        // 実績が1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-4 py-16`}>
          <Trophy className="h-10 w-10 text-gray-600" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-gray-200">まだ実績がありません</p>
            <p className="text-sm text-gray-400">
              受賞やイベントの開催などを登録すると、活動実績のページに表示されます。記事を関連付けることもできます。
            </p>
          </div>
          <button type="button" onClick={openCreateModal} className={`${PRIMARY_BUTTON_CLASS_NAME} text-sm`}>
            <Plus className="h-4 w-4" aria-hidden />
            新規実績
          </button>
        </div>
      ) : (
        <>
          {/* 関連記事による絞り込み */}
          <div role="group" aria-label="関連記事で絞り込む" className="flex flex-wrap gap-1">
            {LINK_FILTERS.map((filter) => {
              const isSelected = filters.link === filter.value;
              // 関連記事が非表示の実績は、該当がない場合は選択肢に出さない
              if (filter.value === 'hidden-post' && linkCounts[filter.value] === 0 && !isSelected) {
                return null;
              }
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateFilters({ link: filter.value })}
                  className={
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors '
                    + (isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200')
                  }
                >
                  {filter.value === 'hidden-post' && (
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                  )}
                  {filter.label}
                  <span
                    className={
                      'rounded-full px-1.5 text-xs tabular-nums '
                      + (isSelected ? 'bg-emerald-500/25 text-emerald-100' : 'bg-gray-800 text-gray-400')
                    }
                  >
                    {linkCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* キーワード・年度・並び順 */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_12rem]">
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
                placeholder="タイトル・説明・関連記事で検索"
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
              aria-label="年度"
              value={filters.fiscalYear ?? ''}
              onChange={(event) => updateFilters({
                fiscalYear: event.target.value === '' ? null : Number(event.target.value),
              })}
              className={FILTER_SELECT_CLASS_NAME}
            >
              <option value="">すべての年度</option>
              {fiscalYears.map((year) => (
                <option key={year} value={year}>{year}年度</option>
              ))}
            </select>
            <select
              aria-label="並び順"
              value={filters.sort}
              onChange={(event) => updateFilters({ sort: event.target.value as AchievementSortOrder })}
              className={FILTER_SELECT_CLASS_NAME}
            >
              {ACHIEVEMENT_SORT_ORDERS.map((order) => (
                <option key={order.value} value={order.value}>{order.label}</option>
              ))}
            </select>
          </div>

          {/* 件数 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered
                ? `${achievements.length}件中 ${visibleAchievements.length}件を表示`
                : `${visibleAchievements.length}件`}
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

          {visibleAchievements.length > 0 ? (
            // NOTE: スクリーンリーダー用の要素（sr-only）がはみ出さないよう、スクロール領域を基準に配置させる
            <div className="relative overflow-x-auto rounded-lg border border-gray-700">
              {/* 関連記事のタイトルを省略して表示するため、列の幅を固定する */}
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-gray-700 bg-gray-800/60 text-left text-xs text-gray-400">
                  <tr>
                    <th scope="col" className="hidden w-28 px-4 py-2 font-medium sm:table-cell">日付</th>
                    <th scope="col" className="px-3 py-2 font-medium sm:px-4">実績</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell md:w-64 xl:w-80">関連記事</th>
                    <th scope="col" className="hidden w-28 px-4 py-2 font-medium lg:table-cell">更新日</th>
                    <th scope="col" className="w-20 px-1 py-2 sm:px-2">
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {visibleAchievements.map((achievement) => {
                    const post = achievement.postId === null ? undefined : postsById.get(achievement.postId);
                    const isHighlighted = notice?.id === achievement.id;
                    return (
                      <tr
                        key={achievement.id}
                        className={
                          'align-top transition-colors duration-700 '
                          + (isHighlighted ? 'bg-emerald-500/10' : 'hover:bg-gray-800/40')
                        }
                      >
                        <td className="hidden px-4 py-3 whitespace-nowrap text-gray-300 tabular-nums sm:table-cell">
                          <time dateTime={achievement.date}>{formatAchievementDate(achievement.date)}</time>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {/* 狭い画面では、日付を実績の上に表示する */}
                          <time
                            dateTime={achievement.date}
                            className="block text-xs text-gray-400 tabular-nums sm:hidden"
                          >
                            {formatAchievementDate(achievement.date)}
                          </time>
                          <button
                            type="button"
                            onClick={() => setModal({ type: 'edit', achievementId: achievement.id })}
                            className={
                              'max-w-full text-left font-medium break-words text-gray-100 hover:text-emerald-300'
                            }
                          >
                            {achievement.title}
                          </button>
                          {achievement.description ? (
                            <p className="mt-0.5 line-clamp-2 text-xs break-words whitespace-pre-line text-gray-400">
                              {achievement.description}
                            </p>
                          ) : post?.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs break-words text-gray-500 italic">
                              {post.description}
                            </p>
                          )}
                          {/* 狭い画面では、関連記事を実績の下に表示する */}
                          {achievement.postId !== null && (
                            <div className="mt-2 text-xs text-gray-300 md:hidden">
                              <RelatedPostCell postId={achievement.postId} post={post} />
                            </div>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-gray-300 md:table-cell">
                          <RelatedPostCell postId={achievement.postId} post={post} />
                        </td>
                        <td className="hidden px-4 py-3 whitespace-nowrap text-gray-400 lg:table-cell">
                          <time
                            dateTime={achievement.updatedAt.toISOString()}
                            title={`更新: ${formatDateTime(achievement.updatedAt)}\n`
                              + `登録: ${formatDateTime(achievement.createdAt)}`}
                          >
                            {formatDate(achievement.updatedAt)}
                          </time>
                        </td>
                        <td className="px-1 py-2 sm:px-2">
                          <div className="flex justify-end sm:gap-0.5">
                            <button
                              type="button"
                              aria-label={`実績「${achievement.title}」を編集`}
                              title="編集"
                              onClick={() => setModal({ type: 'edit', achievementId: achievement.id })}
                              className={`${ROW_BUTTON_CLASS_NAME} hover:text-white`}
                            >
                              <Pen className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`実績「${achievement.title}」を削除`}
                              title="削除"
                              onClick={() => setModal({ type: 'delete', achievementId: achievement.id })}
                              className={`${ROW_BUTTON_CLASS_NAME} hover:text-red-400`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // 条件に一致する実績がない場合
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致する実績はありません</p>
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
