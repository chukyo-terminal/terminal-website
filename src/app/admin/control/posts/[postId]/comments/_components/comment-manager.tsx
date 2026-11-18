'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

import {
  ArrowLeft, CornerDownRight, ExternalLink, Eye, EyeOff, LoaderCircle, Mail, MessageSquare, Pen, RefreshCw, Reply,
  Search, SearchX, ThumbsDown, ThumbsUp, Trash2, X,
} from 'lucide-react';

import Modal from '@/components/elements/modal';
import { formatDateTime, formatRelativeTime } from '../../../_lib/date-format';
import {
  COMMENT_SORT_ORDERS, COMMENT_STATUS_FILTERS, DEFAULT_COMMENT_FILTERS, countByCommentStatus, filterAndSortComments,
  formatVisitorTag,
} from '../_lib/comment-list';
import { COMMENT_MAX_LENGTH, ReplyContentSchema, getCommentAuthorName, needsReply } from '@/lib/post-feedback';

import type { JSX, ReactNode } from 'react';
import type { CommentListFilters, CommentSortOrder } from '../_lib/comment-list';
import type { ManagedComment, ManagedCommentAuthor, ManagedReply, RatingSummary } from '@/lib/post-feedback';
import type { ActionResult } from '@/types';


/**
 * 入力欄の共通クラス。
 */
const INPUT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 '
  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60';


/**
 * 一覧が空のときの表示の共通クラス。
 */
const EMPTY_STATE_CLASS_NAME = 'flex flex-col items-center rounded-lg border border-dashed border-gray-700 px-6 '
  + 'text-center';


/**
 * コメントの操作ボタンの共通クラス。
 */
const ACTION_BUTTON_CLASS_NAME = 'inline-flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 '
  + 'text-sm text-gray-300 hover:border-gray-500 hover:bg-gray-800 hover:text-white '
  + 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';


/**
 * 主要な操作ボタンの共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm '
  + 'font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 '
  + 'disabled:hover:bg-emerald-600';


/**
 * 削除の確認の対象。
 */
type DeleteTarget = {
  entry: ManagedComment | ManagedReply;
  /** スレッドの起点のコメントかどうか（削除するとスレッド全体が削除される） */
  isThread: boolean;
};


/**
 * 返信の入力欄（新規返信と返信の編集で共用する）。
 *
 * @param properties - プロパティ
 * @returns 入力欄の要素
 */
function ReplyEditor({
  initialValue,
  submitLabel,
  isBusy,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  submitLabel: string;
  isBusy: boolean;
  onSubmit: (content: string) => Promise<boolean>;
  onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const textareaId = useId();

  /**
   * 入力内容を検証して送信する。
   */
  async function submit(): Promise<void> {
    if (isBusy) {
      return;
    }
    const parsed = ReplyContentSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    setError(null);
    await onSubmit(parsed.data);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="sr-only">{submitLabel}の内容</label>
      <textarea
        id={textareaId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        rows={3}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder="返信を入力（Ctrl+Enter で送信）"
        disabled={isBusy}
        // 返信フォームを開いたらすぐに入力できるようにする
        autoFocus
        className={`${INPUT_CLASS_NAME} resize-y`}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && <p role="alert" className="mr-auto text-sm text-red-400">{error}</p>}
        <span className="text-xs text-gray-500 tabular-nums">{value.length} / {COMMENT_MAX_LENGTH}</span>
        <button type="button" onClick={onCancel} disabled={isBusy} className={ACTION_BUTTON_CLASS_NAME}>
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isBusy || value.trim() === ''}
          className={PRIMARY_BUTTON_CLASS_NAME}
        >
          {isBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}


/**
 * 評価の集計。
 *
 * @param properties - プロパティ
 * @returns 集計の要素
 */
function RatingSummaryCard({ summary }: { summary: RatingSummary }): JSX.Element {
  const total = summary.positive + summary.negative;
  const positiveRatio = total === 0 ? 0 : summary.positive / total;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="text-sm font-medium text-gray-300">記事の評価</h2>
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <ThumbsUp className="h-4 w-4" aria-hidden />
          良かった <span className="font-bold tabular-nums">{summary.positive}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-rose-300">
          <ThumbsDown className="h-4 w-4" aria-hidden />
          いまいち <span className="font-bold tabular-nums">{summary.negative}</span>
        </span>
        <span className="text-sm text-gray-500">
          {total === 0 ? 'まだ評価はありません' : `全${total}件・良かった ${Math.round(positiveRatio * 100)}%`}
        </span>
      </div>
      {total > 0 && (
        <div
          role="img"
          aria-label={`良かった ${summary.positive}件、いまいち ${summary.negative}件`}
          className="flex h-2 overflow-hidden rounded-full bg-gray-800"
        >
          <div className="bg-emerald-500" style={{ width: `${positiveRatio * 100}%` }} />
          <div className="flex-1 bg-rose-500/70" />
        </div>
      )}
    </div>
  );
}


/**
 * コメントの投稿者（訪問者の場合はメールアドレスと識別記号を含む）。
 *
 * @param properties - プロパティ
 * @returns 投稿者の要素
 */
function AuthorLabel({ author }: { author: ManagedCommentAuthor }): JSX.Element {
  if (author.type === 'staff') {
    return (
      <>
        <span className="font-medium break-all text-emerald-200">{author.name}</span>
        <span className="rounded border border-emerald-500/50 px-1.5 text-xs text-emerald-300">
          {author.isPostAuthor ? '著者' : '運営'}
        </span>
      </>
    );
  }
  return (
    <>
      <span className={`font-medium break-all ${author.name ? 'text-gray-100' : 'text-gray-400'}`}>
        {getCommentAuthorName(author)}
      </span>
      <a
        href={`mailto:${author.email}`}
        title="メールで連絡する（メールアドレスは公開されていません）"
        className={
          'inline-flex items-center gap-1 text-xs break-all text-gray-400 hover:text-emerald-300 hover:underline'
        }
      >
        <Mail className="h-3 w-3 shrink-0" aria-hidden />
        {author.email}
      </a>
      <span
        className="font-mono text-xs text-gray-500"
        title="訪問者を識別する記号です。同じ訪問者（同じブラウザ）のコメントには同じ記号が表示されます。"
      >
        {formatVisitorTag(author.visitorId)}
      </span>
    </>
  );
}


/**
 * スレッド内のコメント（起点のコメントと返信）の1件分。
 *
 * @param properties - プロパティ
 * @returns コメントの要素
 */
function CommentEntry({
  entry,
  replyTo,
  now,
  badges,
  busyKey,
  isReplying,
  isEditing,
  onStartReply,
  onCancelReply,
  onReply,
  onStartEdit,
  onCancelEdit,
  onSave,
  onToggleHidden,
  onDelete,
}: {
  entry: ManagedComment | ManagedReply;
  /** 返信先（起点のコメントや、起点のコメントへの返信は `null`） */
  replyTo: ManagedReply['replyTo'];
  now: Date;
  /** 追加で表示するバッジ */
  badges?: ReactNode;
  busyKey: BusyKey;
  isReplying: boolean;
  isEditing: boolean;
  onStartReply: () => void;
  onCancelReply: () => void;
  onReply: (content: string) => Promise<boolean>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (content: string) => Promise<boolean>;
  onToggleHidden: () => void;
  onDelete: () => void;
}): JSX.Element {
  const isBusy = busyKey !== null;
  const isSelfBusy = busyKey === `comment:${entry.id}`;
  const isVisitor = entry.author.type === 'visitor';
  return (
    <article id={`comment-${entry.id}`} className="flex scroll-mt-24 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AuthorLabel author={entry.author} />
        <time
          dateTime={entry.createdAt.toISOString()}
          title={formatDateTime(entry.createdAt)}
          className="text-xs text-gray-500"
        >
          {formatRelativeTime(entry.createdAt, now)}
        </time>
        {entry.isEdited && (
          <span className="text-xs text-gray-500" title={`${formatDateTime(entry.updatedAt)} に編集`}>（編集済み）</span>
        )}
        {entry.isHidden && (
          <span
            className={
              'inline-flex items-center gap-1 rounded border border-amber-500/50 px-1.5 text-xs text-amber-300'
            }
          >
            <EyeOff className="h-3 w-3" aria-hidden />
            非表示
          </span>
        )}
        {badges}
      </div>

      {replyTo !== null && (
        <p className="flex items-center gap-1 text-xs text-gray-400">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {replyTo === 'unavailable' ? (
            '削除されたコメントへの返信'
          ) : (
            <a href={`#comment-${replyTo.id}`} className="break-all hover:text-emerald-300 hover:underline">
              {replyTo.authorName} への返信{replyTo.isHidden && '（返信先は非表示）'}
            </a>
          )}
        </p>
      )}

      {isEditing ? (
        <ReplyEditor
          initialValue={entry.content}
          submitLabel="更新"
          isBusy={isSelfBusy}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <p className={`whitespace-pre-wrap break-words ${entry.isHidden ? 'text-gray-500' : 'text-gray-200'}`}>
          {entry.content}
        </p>
      )}

      {!isEditing && !isReplying && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onStartReply} disabled={isBusy} className={ACTION_BUTTON_CLASS_NAME}>
            <Reply className="h-4 w-4" aria-hidden />
            返信
          </button>
          {isVisitor ? (
            <button
              type="button"
              onClick={onToggleHidden}
              disabled={isBusy}
              title={entry.isHidden ? '公開ページに表示する' : '公開ページに表示しない'}
              className={ACTION_BUTTON_CLASS_NAME}
            >
              {isSelfBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {!isSelfBusy && (entry.isHidden
                ? <Eye className="h-4 w-4" aria-hidden />
                : <EyeOff className="h-4 w-4" aria-hidden />)}
              {entry.isHidden ? '表示する' : '非表示にする'}
            </button>
          ) : (
            <button type="button" onClick={onStartEdit} disabled={isBusy} className={ACTION_BUTTON_CLASS_NAME}>
              <Pen className="h-4 w-4" aria-hidden />
              編集
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            className={`${ACTION_BUTTON_CLASS_NAME} hover:border-red-500/60 hover:text-red-300`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            削除
          </button>
        </div>
      )}

      {isReplying && (
        <div className="rounded-lg border border-gray-700 bg-gray-950/40 p-3">
          <p className="mb-2 text-sm break-all text-gray-300">{getCommentAuthorName(entry.author)} への返信</p>
          <ReplyEditor
            initialValue=""
            submitLabel="返信する"
            isBusy={isSelfBusy}
            onSubmit={onReply}
            onCancel={onCancelReply}
          />
        </div>
      )}
    </article>
  );
}


/**
 * 操作中の処理を表すキー。
 */
type BusyKey = `comment:${number}` | 'reload' | null;


type CommentManagerProperties = {
  postId: number;
  /** 最新の版のタイトル */
  postTitle: string;
  /** 公開ページのパス（サイトに表示されていない場合は `null`） */
  publicPath: string | null;
  ratingSummary: RatingSummary;
  initialComments: ManagedComment[];
  /** 相対時刻（「3時間前」など）の基準日時 */
  now: Date;
  onReload: () => Promise<ActionResult<ManagedComment[]>>;
  /** コメント（スレッドの起点のコメントまたは返信）に返信する */
  onReply: (commentId: number, content: string) => Promise<ActionResult<ManagedComment[]>>;
  onUpdateReply: (replyId: number, content: string) => Promise<ActionResult<ManagedComment[]>>;
  onSetHidden: (commentId: number, isHidden: boolean) => Promise<ActionResult<ManagedComment[]>>;
  onDelete: (commentId: number) => Promise<ActionResult<ManagedComment[]>>;
};


/**
 * 記事のコメント管理画面。
 *
 * スレッド内のどのコメントにも返信でき、管理者の返信の編集・削除、訪問者のコメントの非表示・削除ができる。
 *
 * @param properties - プロパティ
 * @returns コメント管理画面
 */
export default function CommentManager({
  postId,
  postTitle,
  publicPath,
  ratingSummary,
  initialComments,
  now: initialNow,
  onReload,
  onReply,
  onUpdateReply,
  onSetHidden,
  onDelete,
}: CommentManagerProperties): JSX.Element {
  const [comments, setComments] = useState(initialComments);
  const [now, setNow] = useState(initialNow);
  const [filters, setFilters] = useState<CommentListFilters>(DEFAULT_COMMENT_FILTERS);
  const [busyKey, setBusyKey] = useState<BusyKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const visibleComments = useMemo(() => filterAndSortComments(comments, filters), [comments, filters]);
  const statusCounts = useMemo(() => countByCommentStatus(comments, filters.query), [comments, filters.query]);
  const isFiltered = filters.query.trim() !== '' || filters.status !== 'all';
  const editPath = `/admin/control/posts/${postId}`;

  /**
   * コメントを操作し、成功した場合は一覧を更新する。
   *
   * @param key - 操作中の処理を表すキー
   * @param action - 操作
   * @returns 成功した場合は `true`
   */
  async function run(key: BusyKey, action: () => Promise<ActionResult<ManagedComment[]>>): Promise<boolean> {
    if (busyKey !== null) {
      return false;
    }
    setBusyKey(key);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setComments(result.data);
      setNow(new Date());
      return true;
    } catch (e) {
      console.error('Comment action failed:', e);
      setError('操作に失敗しました。通信環境を確認して、再度お試しください。');
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * 削除の確認で「削除する」が押されたときに、コメントを削除する。
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }
    const { id } = deleteTarget.entry;
    const isSucceeded = await run(`comment:${id}`, () => onDelete(id));
    if (isSucceeded) {
      setDeleteTarget(null);
      if (editingId === id) {
        setEditingId(null);
      }
      if (replyingTo === id) {
        setReplyingTo(null);
      }
    }
  }

  /**
   * スレッド内のコメントの1件分を表示する。
   *
   * @param entry - コメント
   * @param options - 返信先、スレッドの起点かどうか、追加のバッジ
   * @returns コメントの要素
   */
  function renderEntry(
    entry: ManagedComment | ManagedReply,
    options: { replyTo: ManagedReply['replyTo']; isThread: boolean; badges?: ReactNode },
  ): JSX.Element {
    return (
      <CommentEntry
        entry={entry}
        replyTo={options.replyTo}
        now={now}
        badges={options.badges}
        busyKey={busyKey}
        isReplying={replyingTo === entry.id}
        isEditing={editingId === entry.id}
        onStartReply={() => {
          setReplyingTo(entry.id);
          setEditingId(null);
        }}
        onCancelReply={() => setReplyingTo(null)}
        onReply={async (content) => {
          const isSucceeded = await run(`comment:${entry.id}`, () => onReply(entry.id, content));
          if (isSucceeded) {
            setReplyingTo(null);
          }
          return isSucceeded;
        }}
        onStartEdit={() => {
          setEditingId(entry.id);
          setReplyingTo(null);
        }}
        onCancelEdit={() => setEditingId(null)}
        onSave={async (content) => {
          const isSucceeded = await run(`comment:${entry.id}`, () => onUpdateReply(entry.id, content));
          if (isSucceeded) {
            setEditingId(null);
          }
          return isSucceeded;
        }}
        onToggleHidden={() => void run(`comment:${entry.id}`, () => onSetHidden(entry.id, !entry.isHidden))}
        onDelete={() => setDeleteTarget({ entry, isThread: options.isThread })}
      />
    );
  }

  /**
   * 削除の確認の説明文を返す。
   *
   * @param target - 削除の対象
   * @returns 説明文
   */
  function describeDeletion(target: DeleteTarget): string {
    if (target.isThread) {
      const replyCount = 'replies' in target.entry ? target.entry.replies.length : 0;
      return (replyCount > 0 ? `このコメントと、スレッド内の${replyCount}件の返信を削除します。` : 'このコメントを削除します。')
        + 'この操作は取り消せません。';
    }
    return 'この返信を削除します。この返信への返信は削除されません。この操作は取り消せません。';
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={editPath} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            投稿編集
          </Link>
          <h1 className="text-2xl">コメント管理</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void run('reload', onReload)}
              disabled={busyKey !== null}
              className={ACTION_BUTTON_CLASS_NAME}
            >
              <RefreshCw className={`h-4 w-4 ${busyKey === 'reload' ? 'animate-spin' : ''}`} aria-hidden />
              再読み込み
            </button>
            {publicPath && (
              <a
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"
              >
                公開ページを表示
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
        <p className="text-sm break-words text-gray-400">
          {postTitle.trim() || <span className="text-gray-500">タイトル未設定</span>}
        </p>
      </div>

      {!publicPath && (
        <p className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3 text-sm text-gray-300">
          この記事は現在サイトに表示されていないため、新しい評価やコメントは受け付けていません。
        </p>
      )}

      <RatingSummaryCard summary={ratingSummary} />

      {error && !deleteTarget && (
        <div
          role="alert"
          className={
            'flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200'
          }
        >
          <p className="min-w-0 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="閉じる"
            className="rounded p-0.5 hover:bg-red-500/20"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {comments.length === 0 ? (
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-16`}>
          <MessageSquare className="h-10 w-10 text-gray-600" aria-hidden />
          <p className="font-medium text-gray-200">まだコメントはありません</p>
          <p className="text-sm text-gray-400">記事のページの最下部から、訪問者がコメントを投稿できます。</p>
        </div>
      ) : (
        <>
          {/* 状態による絞り込み */}
          <div
            role="group"
            aria-label="状態で絞り込む"
            className={
              '-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 '
              + '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            }
          >
            {COMMENT_STATUS_FILTERS.map((filter) => {
              const isSelected = filters.status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setFilters({ ...filters, status: filter.value })}
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
                    {statusCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* キーワード・並び順 */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden
              />
              <input
                type="search"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="名前・メールアドレス・コメントで検索"
                aria-label="キーワードで検索"
                className={`${INPUT_CLASS_NAME} pl-9`}
              />
            </div>
            <select
              aria-label="並び順"
              value={filters.sort}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value as CommentSortOrder })}
              className={INPUT_CLASS_NAME}
            >
              {COMMENT_SORT_ORDERS.map((order) => (
                <option key={order.value} value={order.value}>{order.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered
                ? `${comments.length}スレッド中 ${visibleComments.length}スレッドを表示`
                : `${comments.length}スレッド`}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => setFilters({ ...DEFAULT_COMMENT_FILTERS, sort: filters.sort })}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                条件をクリア
              </button>
            )}
          </div>

          {visibleComments.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {visibleComments.map((comment) => (
                <li
                  key={comment.id}
                  className={
                    'flex flex-col gap-4 rounded-lg border border-gray-800 p-4 '
                    + (comment.isHidden ? 'bg-gray-900/20' : 'bg-gray-900/40')
                  }
                >
                  {renderEntry(comment, {
                    replyTo: null,
                    isThread: true,
                    badges: needsReply(comment) && (
                      <span className="rounded border border-sky-500/50 px-1.5 text-xs text-sky-300">要返信</span>
                    ),
                  })}
                  {comment.isHidden && comment.replies.length > 0 && (
                    <p className="text-xs text-amber-300/80">
                      このコメントを非表示にしているため、スレッド内の返信も公開ページに表示されません。
                    </p>
                  )}
                  {comment.replies.length > 0 && (
                    <ul className="flex flex-col gap-4 border-l-2 border-emerald-500/40 pl-4">
                      {comment.replies.map((reply) => (
                        <li key={reply.id}>
                          {renderEntry(reply, { replyTo: reply.replyTo, isThread: false })}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致するコメントはありません</p>
              <button
                type="button"
                onClick={() => setFilters({ ...DEFAULT_COMMENT_FILTERS, sort: filters.sort })}
                className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                条件をクリア
              </button>
            </div>
          )}
        </>
      )}

      {/* 削除の確認 */}
      <Modal
        isOpen={deleteTarget !== null}
        onRequestClose={() => {
          if (busyKey === null) {
            setDeleteTarget(null);
            setError(null);
          }
        }}
        contentLabel={deleteTarget?.isThread === false ? '返信を削除' : 'コメントを削除'}
      >
        {deleteTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-300">
              {describeDeletion(deleteTarget)}
              {deleteTarget.entry.author.type === 'visitor'
                && '公開ページに表示しないだけであれば、「非表示にする」を使用してください。'}
            </p>
            <blockquote
              className={
                'max-h-40 overflow-y-auto rounded border-l-2 border-gray-600 bg-gray-900/60 px-3 py-2 text-sm '
                + 'whitespace-pre-wrap break-words text-gray-400'
              }
            >
              {deleteTarget.entry.content}
            </blockquote>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setError(null);
                }}
                disabled={busyKey !== null}
                className="rounded px-4 py-2 text-gray-300 hover:bg-gray-700 disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busyKey !== null}
                className={
                  'inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 '
                  + 'disabled:opacity-60'
                }
              >
                {busyKey !== null && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                削除する
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
