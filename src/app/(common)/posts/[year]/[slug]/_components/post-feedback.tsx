'use client';

import { useEffect, useId, useState } from 'react';

import {
  CornerDownRight, LoaderCircle, MessageSquare, Reply, Send, ShieldCheck, ThumbsDown, ThumbsUp,
} from 'lucide-react';

import { formatDateTime } from '@/app/admin/control/posts/_lib/date-format';
import {
  ANONYMOUS_COMMENT_AUTHOR_NAME, COMMENT_AUTHOR_EMAIL_MAX_LENGTH, COMMENT_AUTHOR_NAME_MAX_LENGTH, COMMENT_MAX_LENGTH,
  CommentFormSchema, POST_FEEDBACK_TURNSTILE_ACTION, countPublicComments, getCommentAuthorName,
  toPostFeedbackTurnstileCData,
} from '@/lib/post-feedback';
import { useTurnstile } from '@/lib/use-turnstile';

import type { FormEvent, JSX, ReactNode, RefObject } from 'react';
import type {
  CommentFormValues, CommentPostResult, PublicComment, PublicCommentAuthor, PublicReply, RatingState, RatingSummary,
  RatingValue,
} from '@/lib/post-feedback';
import type { TurnstileStatus } from '@/lib/use-turnstile';
import type { ActionResult } from '@/types';


/**
 * コメント投稿者の名前を保存する localStorage のキー。
 */
const AUTHOR_NAME_STORAGE_KEY = 'post-comment-author-name';


/**
 * コメント投稿者のメールアドレスを保存する localStorage のキー。
 */
const AUTHOR_EMAIL_STORAGE_KEY = 'post-comment-author-email';


/**
 * 入力欄の共通クラス。
 */
const INPUT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 '
  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60';


/**
 * Turnstile のトークンを取り出せなかった場合のメッセージ。
 */
const TURNSTILE_ERROR_MESSAGE = 'ボット対策の確認ができませんでした。しばらくしてから再度お試しください。';


/**
 * 評価を変更した後の集計を、サーバーの応答を待たずに計算する。
 *
 * @param summary - 変更前の集計
 * @param before - 変更前の評価
 * @param after - 変更後の評価
 * @returns 変更後の集計
 */
function applyRatingChange(
  summary: RatingSummary,
  before: RatingValue | null,
  after: RatingValue | null,
): RatingSummary {
  const next = { ...summary };
  if (before) {
    next[before] = Math.max(0, next[before] - 1);
  }
  if (after) {
    next[after]++;
  }
  return next;
}


/**
 * 評価ボタン。
 *
 * @param properties - プロパティ
 * @returns 評価ボタン
 */
function RatingButton({
  value,
  count,
  isSelected,
  isPending,
  isDisabled,
  onClick,
}: {
  value: RatingValue;
  count: number;
  isSelected: boolean;
  isPending: boolean;
  isDisabled: boolean;
  onClick: () => void;
}): JSX.Element {
  const isPositive = value === 'positive';
  const label = isPositive ? '良かった' : 'いまいち';
  const Icon = isPositive ? ThumbsUp : ThumbsDown;
  const selectedClassName = isPositive
    ? 'border-emerald-500/70 bg-emerald-500/15 text-emerald-200'
    : 'border-rose-400/60 bg-rose-500/10 text-rose-200';
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`${label}（${count}件）${isSelected ? '、選択中。もう一度押すと取り消します' : ''}`}
      disabled={isDisabled}
      onClick={onClick}
      className={
        'inline-flex min-w-36 items-center justify-center gap-2 rounded-full border px-5 py-2.5 font-medium '
        + 'transition-colors disabled:cursor-not-allowed disabled:opacity-60 '
        + (isSelected
          ? selectedClassName
          : 'border-gray-600 text-gray-300 enabled:hover:border-gray-400 enabled:hover:bg-gray-800 '
            + 'enabled:hover:text-white')
      }
    >
      {isPending
        ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        : <Icon className={`h-5 w-5 ${isSelected ? 'fill-current/25' : ''}`} aria-hidden />}
      {label}
      <span className="tabular-nums text-sm opacity-80">{count}</span>
    </button>
  );
}


/**
 * 記事の評価。
 *
 * @param properties - プロパティ
 * @returns 評価の要素
 */
function RatingPanel({
  initialState,
  isAvailable,
  takeToken,
  onRate,
}: {
  initialState: RatingState;
  isAvailable: boolean;
  takeToken: () => Promise<string>;
  onRate: (value: RatingValue | null, turnstileToken: string) => Promise<ActionResult<RatingState>>;
}): JSX.Element {
  const [state, setState] = useState(initialState);
  const [pendingValue, setPendingValue] = useState<RatingValue | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const headingId = useId();

  /**
   * 評価を変更する。選択中の評価を押した場合は取り消す。
   *
   * @param value - 押された評価
   */
  async function rate(value: RatingValue): Promise<void> {
    if (pendingValue) {
      return;
    }
    const previous = state;
    const nextRating = state.myRating === value ? null : value;
    // 応答を待たずに表示を更新し、失敗した場合は元に戻す
    setState({ myRating: nextRating, summary: applyRatingChange(state.summary, state.myRating, nextRating) });
    setPendingValue(value);
    setMessage(null);
    try {
      let token: string;
      try {
        token = await takeToken();
      } catch {
        setState(previous);
        setMessage({ text: TURNSTILE_ERROR_MESSAGE, isError: true });
        return;
      }
      const result = await onRate(nextRating, token);
      if (result.ok) {
        setState(result.data);
        setMessage(result.data.myRating ? { text: '評価ありがとうございます！', isError: false } : null);
      } else {
        setState(previous);
        setMessage({ text: result.error, isError: true });
      }
    } catch (e) {
      console.error('Failed to rate post:', e);
      setState(previous);
      setMessage({ text: '評価を送信できませんでした。', isError: true });
    } finally {
      setPendingValue(null);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={
        'flex flex-col items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-6 text-center'
      }
    >
      <h2 id={headingId} className="my-0! text-lg font-bold text-gray-100">あなたの評価をお聞かせください</h2>
      <div className="flex flex-wrap justify-center gap-3">
        {(['positive', 'negative'] as const).map((value) => (
          <RatingButton
            key={value}
            value={value}
            count={state.summary[value]}
            isSelected={state.myRating === value}
            isPending={pendingValue === value}
            isDisabled={!isAvailable || pendingValue !== null}
            onClick={() => void rate(value)}
          />
        ))}
      </div>
      <p aria-live="polite" className={`my-0! min-h-5 text-sm ${message?.isError ? 'text-red-400' : 'text-gray-400'}`}>
        {message?.text}
      </p>
    </div>
  );
}


/**
 * 前回入力した名前とメールアドレスを読み込む。
 *
 * @returns 名前とメールアドレス（保存されていない場合は空文字列）
 */
function loadStoredAuthor(): Pick<CommentFormValues, 'authorName' | 'authorEmail'> {
  try {
    const authorName = globalThis.localStorage.getItem(AUTHOR_NAME_STORAGE_KEY) ?? '';
    const authorEmail = globalThis.localStorage.getItem(AUTHOR_EMAIL_STORAGE_KEY) ?? '';
    return {
      authorName: authorName.slice(0, COMMENT_AUTHOR_NAME_MAX_LENGTH),
      authorEmail: authorEmail.slice(0, COMMENT_AUTHOR_EMAIL_MAX_LENGTH),
    };
  } catch {
    // localStorage を使用できない場合は復元しない
    return { authorName: '', authorEmail: '' };
  }
}


/**
 * 入力した名前とメールアドレスを保存する（次回の入力を省くため）。
 *
 * @param authorName - 名前（未入力の場合は `null`）
 * @param authorEmail - メールアドレス
 */
function storeAuthor(authorName: string | null, authorEmail: string): void {
  try {
    if (authorName) {
      globalThis.localStorage.setItem(AUTHOR_NAME_STORAGE_KEY, authorName);
    } else {
      globalThis.localStorage.removeItem(AUTHOR_NAME_STORAGE_KEY);
    }
    globalThis.localStorage.setItem(AUTHOR_EMAIL_STORAGE_KEY, authorEmail);
  } catch {
    // localStorage を使用できない場合は保存しない
  }
}


/**
 * コメントの投稿者の名前とバッジ。
 *
 * @param properties - プロパティ
 * @returns 投稿者の要素
 */
function CommentAuthorLabel({ author }: { author: PublicCommentAuthor }): JSX.Element {
  if (author.type === 'visitor') {
    return <span className="font-medium break-all text-gray-100">{getCommentAuthorName(author)}</span>;
  }
  return (
    <>
      <span className="font-medium break-all text-emerald-200">{author.name}</span>
      <span className="rounded border border-emerald-500/50 px-1.5 text-xs text-emerald-300">
        {author.isPostAuthor ? '著者' : '運営'}
      </span>
    </>
  );
}


/**
 * コメント（スレッドの起点のコメントと返信）の1件分。
 *
 * @param properties - プロパティ
 * @returns コメントの要素
 */
function CommentEntry({
  comment,
  replyTo,
  isReplying,
  canReply,
  onReply,
  children,
}: {
  comment: PublicComment | PublicReply;
  /** 返信先（スレッドの起点のコメントへの返信や、起点のコメントは `null`） */
  replyTo: PublicReply['replyTo'];
  /** このコメントへの返信フォームを表示しているかどうか */
  isReplying: boolean;
  canReply: boolean;
  onReply: () => void;
  /** 返信フォーム */
  children?: ReactNode;
}): JSX.Element {
  return (
    <article id={`comment-${comment.id}`} className="flex scroll-mt-24 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CommentAuthorLabel author={comment.author} />
        <time dateTime={comment.createdAt.toISOString()} className="text-xs text-gray-500">
          {formatDateTime(comment.createdAt)}
        </time>
        {comment.isEdited && <span className="text-xs text-gray-500">（編集済み）</span>}
      </div>
      {replyTo !== null && (
        <p className="my-0! flex items-center gap-1 text-xs text-gray-400">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {replyTo === 'unavailable' ? (
            '表示されていないコメントへの返信'
          ) : (
            <a href={`#comment-${replyTo.id}`} className="break-all hover:text-emerald-300 hover:underline">
              {replyTo.authorName} への返信
            </a>
          )}
        </p>
      )}
      <p className="my-0! whitespace-pre-wrap break-words text-gray-200">{comment.content}</p>
      {canReply && !isReplying && (
        <div>
          <button
            type="button"
            onClick={onReply}
            className={
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-800 '
              + 'hover:text-emerald-300'
            }
          >
            <Reply className="h-4 w-4" aria-hidden />
            返信
          </button>
        </div>
      )}
      {children}
    </article>
  );
}


/**
 * スレッド（記事に直接投稿されたコメントと、その返信）。
 *
 * @param properties - プロパティ
 * @returns スレッドの要素
 */
function CommentThread({
  comment,
  replyingTo,
  canReply,
  onReply,
  renderReplyForm,
}: {
  comment: PublicComment;
  /** 返信フォームを表示しているコメントのID */
  replyingTo: number | null;
  canReply: boolean;
  onReply: (commentId: number) => void;
  renderReplyForm: (target: PublicComment | PublicReply) => ReactNode;
}): JSX.Element {
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <CommentEntry
        comment={comment}
        replyTo={null}
        isReplying={replyingTo === comment.id}
        canReply={canReply}
        onReply={() => onReply(comment.id)}
      >
        {replyingTo === comment.id && renderReplyForm(comment)}
      </CommentEntry>
      {comment.replies.length > 0 && (
        <ul className="flex flex-col gap-4 border-l-2 border-emerald-500/40 pl-4">
          {comment.replies.map((reply) => (
            <li key={reply.id}>
              <CommentEntry
                comment={reply}
                replyTo={reply.replyTo}
                isReplying={replyingTo === reply.id}
                canReply={canReply}
                onReply={() => onReply(reply.id)}
              >
                {replyingTo === reply.id && renderReplyForm(reply)}
              </CommentEntry>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}


/**
 * コメントの投稿フォーム（新しいコメントと返信で共用する）。
 *
 * @param properties - プロパティ
 * @returns フォームの要素
 */
function CommentForm({
  parent,
  isAvailable,
  takeToken,
  onSubmit,
  onPosted,
  onCancel,
}: {
  /** 返信先（新しいコメントの場合は `null`） */
  parent: { id: number; authorName: string } | null;
  isAvailable: boolean;
  takeToken: () => Promise<string>;
  onSubmit: PostFeedbackProperties['onComment'];
  onPosted: (result: CommentPostResult) => void;
  /** 返信をやめる（返信の場合のみ） */
  onCancel?: () => void;
}): JSX.Element {
  const [values, setValues] = useState<CommentFormValues>({ authorName: '', authorEmail: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const formId = useId();
  const isReply = parent !== null;

  // 前回入力した名前とメールアドレスを復元する
  useEffect(() => {
    const stored = loadStoredAuthor();
    if (stored.authorName || stored.authorEmail) {
      setValues((current) => ({ ...current, ...stored }));
    }
  }, []);

  /**
   * コメントを投稿する。
   *
   * @param event - 送信イベント
   */
  async function submit(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (isSubmitting || !isAvailable) {
      return;
    }
    const parsed = CommentFormSchema.safeParse(values);
    if (!parsed.success) {
      setMessage({ text: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。', isError: true });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      let token: string;
      try {
        token = await takeToken();
      } catch {
        setMessage({ text: TURNSTILE_ERROR_MESSAGE, isError: true });
        return;
      }
      const result = await onSubmit(values, parent?.id ?? null, token);
      if (!result.ok) {
        setMessage({ text: result.error, isError: true });
        return;
      }
      storeAuthor(parsed.data.authorName, parsed.data.authorEmail);
      setValues((current) => ({ ...current, content: '' }));
      setMessage({ text: isReply ? '返信を投稿しました。' : 'コメントを投稿しました。', isError: false });
      onPosted(result.data);
    } catch (e) {
      console.error('Failed to post comment:', e);
      setMessage({ text: 'コメントを投稿できませんでした。', isError: true });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isDisabled = !isAvailable || isSubmitting;
  const label = isReply ? `${parent.authorName} への返信` : 'コメントを書く';
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" aria-label={label}>
      {isReply && <p className="my-0! text-sm font-medium break-all text-gray-300">{label}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${formId}-name`} className="text-sm text-gray-300">
            名前 <span className="text-xs text-gray-500">（任意）</span>
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            value={values.authorName}
            onChange={(event) => setValues({ ...values, authorName: event.target.value })}
            maxLength={COMMENT_AUTHOR_NAME_MAX_LENGTH}
            placeholder={ANONYMOUS_COMMENT_AUTHOR_NAME}
            autoComplete="nickname"
            disabled={isDisabled}
            className={INPUT_CLASS_NAME}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${formId}-email`} className="text-sm text-gray-300">
            メールアドレス <span className="text-red-400" aria-hidden>*</span>
            <span className="text-xs text-gray-500">（公開されません）</span>
          </label>
          <input
            id={`${formId}-email`}
            type="email"
            value={values.authorEmail}
            onChange={(event) => setValues({ ...values, authorEmail: event.target.value })}
            maxLength={COMMENT_AUTHOR_EMAIL_MAX_LENGTH}
            placeholder="example@example.com"
            autoComplete="email"
            required
            disabled={isDisabled}
            className={INPUT_CLASS_NAME}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-content`} className="text-sm text-gray-300">
          {isReply ? '返信' : 'コメント'} <span className="text-red-400" aria-hidden>*</span>
        </label>
        <textarea
          id={`${formId}-content`}
          value={values.content}
          onChange={(event) => setValues({ ...values, content: event.target.value })}
          onKeyDown={(event) => {
            // Ctrl+Enter（macOS では ⌘+Enter）で送信する
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit();
            } else if (event.key === 'Escape' && onCancel) {
              event.preventDefault();
              onCancel();
            }
          }}
          rows={isReply ? 3 : 4}
          maxLength={COMMENT_MAX_LENGTH}
          required
          placeholder={isReply ? '返信を入力' : '記事の感想や質問をどうぞ'}
          aria-describedby={`${formId}-note`}
          disabled={isDisabled}
          // 返信フォームを開いたらすぐに入力できるようにする
          autoFocus={isReply}
          className={`${INPUT_CLASS_NAME} resize-y`}
        />
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
          <p id={`${formId}-note`} className="my-0!">
            コメントはすぐに公開されます。メールアドレスは公開されず、運営からの連絡にのみ使用します。
            不適切と判断したコメントは、予告なく非表示にすることがあります。
          </p>
          <span className="tabular-nums">{values.content.length} / {COMMENT_MAX_LENGTH}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p
          aria-live="polite"
          className={`my-0! mr-auto text-sm ${message?.isError ? 'text-red-400' : 'text-emerald-300'}`}
        >
          {message?.text}
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded border border-gray-600 px-4 py-2 text-gray-300 hover:bg-gray-800 disabled:opacity-60"
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={isDisabled || values.content.trim() === '' || values.authorEmail.trim() === ''}
          className={
            'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 font-medium text-white '
            + 'hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-600'
          }
        >
          {isSubmitting
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            : <Send className="h-4 w-4" aria-hidden />}
          {isSubmitting ? '送信中…' : (isReply ? '返信する' : 'コメントする')}
        </button>
      </div>
    </form>
  );
}


/**
 * Turnstile ウィジェットと、その状態の説明。
 *
 * @param properties - プロパティ
 * @returns ウィジェットの要素
 */
function TurnstileNotice({
  containerRef,
  status,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  status: TurnstileStatus;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="min-h-[65px] w-full max-w-sm" />
      <p
        className={`my-0! flex items-start gap-1.5 text-xs ${status === 'error' ? 'text-amber-300' : 'text-gray-500'}`}
      >
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {status === 'error'
          ? 'ボット対策の確認に失敗しました。自動で再試行しています。解決しない場合は、ページを再読み込みしてください。'
          : '評価とコメントは、Cloudflare Turnstile によってスパムから保護されています。'}
      </p>
    </div>
  );
}


type PostFeedbackProperties = {
  postId: number;
  /** Non-interactive モードの Turnstile のサイトキー（未設定の場合は評価・コメントを受け付けない） */
  turnstileSiteKey: string | null;
  initialRating: RatingState;
  initialComments: PublicComment[];
  onRate: (value: RatingValue | null, turnstileToken: string) => Promise<ActionResult<RatingState>>;
  onComment: (
    values: CommentFormValues,
    parentId: number | null,
    turnstileToken: string,
  ) => Promise<ActionResult<CommentPostResult>>;
};


/**
 * 記事の評価とコメント。
 *
 * @param properties - プロパティ
 * @returns 評価とコメントの要素
 */
export default function PostFeedback(properties: PostFeedbackProperties): JSX.Element {
  const { turnstileSiteKey } = properties;
  if (!turnstileSiteKey) {
    return <PostFeedbackContent {...properties} turnstile={null} />;
  }
  return <PostFeedbackWithTurnstile {...properties} turnstileSiteKey={turnstileSiteKey} />;
}


/**
 * Turnstile で保護した、記事の評価とコメント。
 *
 * @param properties - プロパティ
 * @returns 評価とコメントの要素
 */
function PostFeedbackWithTurnstile(properties: PostFeedbackProperties & { turnstileSiteKey: string }): JSX.Element {
  const turnstile = useTurnstile({
    siteKey: properties.turnstileSiteKey,
    action: POST_FEEDBACK_TURNSTILE_ACTION,
    cData: toPostFeedbackTurnstileCData(properties.postId),
  });
  return <PostFeedbackContent {...properties} turnstile={turnstile} />;
}


/**
 * 記事の評価とコメントの本体。
 *
 * @param properties - プロパティ
 * @returns 評価とコメントの要素
 */
function PostFeedbackContent({
  initialRating,
  initialComments,
  onRate,
  onComment,
  turnstile,
}: PostFeedbackProperties & { turnstile: ReturnType<typeof useTurnstile> | null }): JSX.Element {
  const [comments, setComments] = useState(initialComments);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [postedCommentId, setPostedCommentId] = useState<number | null>(null);
  const headingId = useId();
  const isAvailable = turnstile !== null;
  const takeToken = turnstile?.takeToken ?? (() => Promise.reject(new Error('Turnstile is not configured')));

  // 投稿したコメントまでスクロールする
  useEffect(() => {
    if (postedCommentId !== null) {
      document.querySelector(`#comment-${postedCommentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [postedCommentId]);

  /**
   * コメントを投稿した後に、一覧を更新する。
   *
   * @param result - 投稿した結果
   */
  function handlePosted(result: CommentPostResult): void {
    setComments(result.comments);
    setReplyingTo(null);
    setPostedCommentId(result.postedId);
  }

  return (
    <section aria-label="評価とコメント" className="mt-16 flex flex-col gap-10 border-t border-gray-800 pt-10">
      <RatingPanel initialState={initialRating} isAvailable={isAvailable} takeToken={takeToken} onRate={onRate} />

      <div role="region" aria-labelledby={headingId} className="flex flex-col gap-6">
        <h2 id={headingId} className="my-0! flex items-center gap-2 text-xl font-bold text-gray-100">
          <MessageSquare className="h-5 w-5 text-emerald-400" aria-hidden />
          コメント
          <span className="text-base font-normal text-gray-400 tabular-nums">（{countPublicComments(comments)}件）</span>
        </h2>

        {comments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                replyingTo={replyingTo}
                canReply={isAvailable}
                onReply={setReplyingTo}
                renderReplyForm={(target) => (
                  <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950/40 p-3">
                    <CommentForm
                      parent={{ id: target.id, authorName: getCommentAuthorName(target.author) }}
                      isAvailable={isAvailable}
                      takeToken={takeToken}
                      onSubmit={onComment}
                      onPosted={handlePosted}
                      onCancel={() => setReplyingTo(null)}
                    />
                  </div>
                )}
              />
            ))}
          </ul>
        ) : (
          <p className="my-0! text-sm text-gray-400">まだコメントはありません。最初のコメントを書いてみませんか？</p>
        )}

        {isAvailable ? (
          <div className="flex flex-col gap-4 rounded-lg border border-gray-800 p-4">
            <h3 className="my-0! text-base font-bold text-gray-200">コメントを書く</h3>
            <CommentForm
              parent={null}
              isAvailable={isAvailable}
              takeToken={takeToken}
              onSubmit={onComment}
              onPosted={handlePosted}
            />
          </div>
        ) : (
          <p className="my-0! text-sm text-gray-400">現在、評価とコメントは受け付けていません。</p>
        )}

        {turnstile && <TurnstileNotice containerRef={turnstile.containerRef} status={turnstile.status} />}
      </div>
    </section>
  );
}
