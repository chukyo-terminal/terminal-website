'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { EditorView } from '@codemirror/view';
import {
  ArrowLeft, CalendarClock, CircleAlert, CircleCheck, ExternalLink, History, LoaderCircle, MessageSquare, Save, Send,
  TriangleAlert, X,
} from 'lucide-react';
import { z } from 'zod';

import Modal from '@/components/elements/modal';
import { MAX_IMAGE_FILES_PER_UPLOAD, toImageMarkdown, uploadImageFiles, validateImageFile } from '@/utils/images';

import { formatDateTime as formatJstDateTime } from '../../_lib/date-format';
import { PostStatusBadge, PrivateBadge } from '../../_components/post-status-badge';

import HistoryDialog from './history-dialog';
import ImagePickerDialog from './image-picker-dialog';
import MarkdownEditor from './markdown-editor';
import MarkdownPreview from './markdown-preview';
import MarkdownToolbar from './markdown-toolbar';
import ShortcutHelpModal from './shortcut-help-modal';
import TagInput from './tag-input';
import { createUploadPlaceholder, insertImageLines, replaceUploadPlaceholder } from '../_lib/image-insertion';
import {
  MAX_TAGS_PER_POST, PostFormSchema, PostFormValuesSchema, RECOMMENDED_DESCRIPTION_LENGTH, isSamePostFormValues,
  normalizeDescription,
} from '../_lib/post-form';
import { getEditorScrollPosition } from '../_lib/scroll-sync';
import { SHORTCUT_KEYS, formatShortcut, useIsApplePlatform } from '../_lib/shortcuts';
import { useMediaQuery } from '../_lib/use-media-query';

import type { JSX, ReactNode } from 'react';
import type { CursorInfo } from './markdown-editor';
import type { MarkdownPreviewHandle } from './markdown-preview';
import type { ViewMode } from './markdown-toolbar';
import type { MarkdownCommand } from '../_lib/markdown-commands';
import type { PostFormValues, PostStatus, PublishResult, SaveResult, TagOption } from '../_lib/post-form';
import type { ReviewRoute, ReviewSubmission } from '@/lib/review-routing';
import type { ReviewPanel } from '@/utils/post-review';
import type { ManagedImage, UploadImageAction } from '@/utils/images';
import type { PostVersion } from '@/utils/post-versions';
import type { ActionResult } from '@/types';


/**
 * 表示設定を保存する localStorage のキー。
 */
const PREFERENCES_STORAGE_KEY = 'terminal:post-editor:preferences';


/**
 * 編集内容を一時保存するまでの時間（ms）。
 */
const DRAFT_STORE_DELAY = 1000;


/**
 * 読了時間の目安を計算する際の、1分あたりに読める文字数。
 */
const CHARACTERS_PER_MINUTE = 500;


/**
 * 成功時の通知を表示しておく時間（ms）。
 */
const TOAST_DURATION = 4000;


/**
 * 表示設定のスキーマ。
 */
const PreferencesSchema = z.object({
  viewMode: z.enum(['edit', 'split', 'preview']),
  isScrollSyncEnabled: z.boolean(),
});

type Preferences = z.infer<typeof PreferencesSchema>;


/**
 * 一時保存した編集内容のスキーマ。
 */
const StoredDraftSchema = z.object({
  values: PostFormValuesSchema,
  storedAt: z.string(),
});

type StoredDraft = z.infer<typeof StoredDraftSchema>;


/**
 * 画面右下に表示する通知。
 */
type Toast = {
  type: 'success' | 'error';
  message: string;
};


/**
 * テキスト入力欄の共通クラス。
 */
const INPUT_CLASS_NAME = 'block w-full rounded border bg-gray-900 px-3 py-2 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500';


/**
 * 一時保存した編集内容を保存する localStorage のキーを返す。
 *
 * @param postId - 投稿ID
 * @returns localStorage のキー
 */
const getDraftStorageKey = (postId: number): string => `terminal:post-editor:draft:${postId}`;


/**
 * localStorage から値を読み込む。読み込めない場合や形式が正しくない場合は `null` を返す。
 *
 * @param key - キー
 * @param schema - 値のスキーマ
 * @returns 読み込んだ値
 */
function readStorage<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}


/**
 * localStorage に値を保存する。保存できない環境では何もしない。
 *
 * @param key - キー
 * @param value - 保存する値
 */
function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // プライベートブラウジングなどで保存できない場合は無視する
  }
}


/**
 * localStorage から値を削除する。削除できない環境では何もしない。
 *
 * @param key - キー
 */
function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // プライベートブラウジングなどで削除できない場合は無視する
  }
}


/**
 * 日時を短い形式でフォーマットする。
 *
 * @param date - フォーマットする日時
 * @returns フォーマット済みの日時文字列（例: `11/17 14:05`）
 */
const formatDateTime = (date: Date): string => new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
}).format(date);


/**
 * 公開ボタンが無効な理由（有効な場合は `undefined`）。
 *
 * @param state - 状態
 * @returns 利用者に表示する理由
 */
const getPublishBlockReason = (state: {
  isPublished: boolean;
  isAuthor: boolean;
  isApproved: boolean;
  isDirty: boolean;
}): string | undefined => {
  if (state.isPublished) {
    return '公開されていない変更はありません';
  }
  if (!state.isAuthor) {
    return '執筆者だけが公開できます';
  }
  if (!state.isApproved) {
    return 'レビューで承認されると公開できます';
  }
  return state.isDirty ? '未保存の変更があります。保存すると承認は取り消されます' : undefined;
};


/**
 * レビューの状態のバッジの配色。
 *
 * @param status - 依頼の状態（依頼していない場合は `undefined`）
 * @returns クラス名
 */
const getReviewBadgeClassName = (status: string | undefined): string => {
  switch (status) {
    case 'pending': {
      return 'border-amber-500/60 text-amber-300';
    }
    case 'approved': {
      return 'border-emerald-500/60 text-emerald-300';
    }
    case 'rejected': {
      return 'border-red-500/60 text-red-300';
    }
    default: {
      return 'border-gray-500 text-gray-300';
    }
  }
};


/**
 * 日時を `datetime-local` の入力値の形式（ブラウザのローカル時刻。例: `2026-11-25T10:00`）にする。
 *
 * @param date - 日時
 * @returns 入力値
 */
const toDateTimeLocalValue = (date: Date): string => {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
};


/**
 * 公開予約の日時の既定値（1時間後を5分単位に切り上げた日時）を返す。
 *
 * @returns 入力値
 */
const getDefaultScheduleInput = (): string => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5);
  return toDateTimeLocalValue(date);
};

/**
 * 公開予約として指定できる最も早い日時（現在時刻の1分後）。サーバー側の検証と一致させる。
 */
const MIN_SCHEDULE_DELAY_MS = 60 * 1000;


/**
 * 記事の公開を告知する X（旧Twitter）の投稿画面を開く。
 *
 * @param result - 公開処理の結果
 */
function openShareWindow(result: Extract<PublishResult, { ok: true }>): void {
  // &url=だと余計なスペースが入るため、本文に URL を含める
  const url = new URL(
    `/posts/${result.year}/${result.slug}`,
    process.env.NEXT_PUBLIC_APP_URL ?? globalThis.location.origin,
  ).href;
  const text = [
    '【記事公開】',
    `「${result.title}」`,
    result.description,
    'by @chukyo_terminal ※投稿者のユーザー名に置き換えもしくは削除',
    url,
  ].filter(Boolean).join('\n');
  globalThis.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}


/**
 * ラベル付きの入力欄。
 *
 * @param properties - プロパティ
 * @returns 入力欄
 */
function Field({
  label,
  htmlFor,
  aside,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** ラベルの右側に表示する補足 */
  aside?: ReactNode;
  error?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-300">{label}</label>
        {aside}
      </div>
      {children}
      {error && <p id={`${htmlFor}-error`} className="text-xs text-red-400">{error}</p>}
    </div>
  );
}


/**
 * 編集画面に表示するレビューの情報（最新の版）。
 */
export type EditorReview = {
  /** 最新の依頼と、その操作の履歴 */
  panel: ReviewPanel;
  /** 表示している利用者が執筆者かどうか（依頼・公開は執筆者だけができる） */
  isAuthor: boolean;
  /** 担当課の一覧（依頼時に選ぶ） */
  divisions: { dn: string; name: string }[];
  /** 組織運営に関する記事を依頼できるか（執行委員会のメンバーのみ） */
  canSubmitOrganizational: boolean;
  /** 組織の情報を読み込めなかった場合のメッセージ */
  organizationError: string | null;
};


/**
 * 開いているモーダルの種類。
 */
type OpenedModal = 'publish' | 'schedule' | 'review' | 'help' | 'history' | 'image' | null;


type EditorProperties = {
  postId: number;
  /** フォームの初期値 */
  initialValues: PostFormValues;
  /** 著者の表示名 */
  author: string;
  status: PostStatus;
  /** 公開年度（未公開の場合は `null`） */
  publishedYear: number | null;
  /** 今公開した場合の公開年度 */
  expectedYear: number;
  /** 初めて公開された日時（未公開の場合は `null`） */
  firstPublishedAt: Date | null;
  /** 公開予約の日時（予約していない場合や、公開済みの場合は `null`） */
  scheduledPublishAt: Date | null;
  /** 最後に保存された日時 */
  lastSavedAt: Date;
  /** 既存のタグ（タグの入力候補） */
  availableTags: TagOption[];
  /** 訪問者のコメント数 */
  commentCount: number;
  /** 返信していない（非表示にしていない）コメント数 */
  unrepliedCommentCount: number;
  onSave: (values: PostFormValues) => Promise<SaveResult>;
  onPublish: () => Promise<PublishResult>;
  /** 未公開の内容を、指定した日時（ISO 8601 形式）に公開するよう予約する */
  onSchedule: (scheduledAt: string) => Promise<ActionResult<Date>>;
  /** 公開予約を取り消す */
  onCancelSchedule: () => Promise<ActionResult>;
  /** レビューの情報（最新の版） */
  review: EditorReview;
  /** 担当課などを選んでレビューを依頼する */
  onSubmitReview: (submission: ReviewSubmission) => Promise<ActionResult<ReviewRoute>>;
  /** 審査中の依頼を取り下げる */
  onWithdrawReview: () => Promise<ActionResult>;
  /** 編集履歴（すべての版）を読み込む */
  onLoadHistory: () => Promise<ActionResult<PostVersion[]>>;
  /** 版の非公開設定を変更し、変更後のすべての版を返す */
  onSetVersionPrivate: (identifier: number, isPrivate: boolean) => Promise<ActionResult<PostVersion[]>>;
  /** 画像をアップロードする */
  onUploadImage: UploadImageAction;
  /** アップロード済みの画像を読み込む */
  onLoadImages: () => Promise<ActionResult<ManagedImage[]>>;
};


/**
 * 記事編集画面。
 *
 * @param properties - プロパティ
 * @returns 記事編集画面
 */
export default function Editor({
  postId,
  initialValues,
  author,
  status,
  publishedYear,
  expectedYear,
  firstPublishedAt,
  scheduledPublishAt,
  lastSavedAt,
  availableTags,
  commentCount,
  unrepliedCommentCount,
  onSave,
  onPublish,
  onSchedule,
  onCancelSchedule,
  review,
  onSubmitReview,
  onWithdrawReview,
  onLoadHistory,
  onSetVersionPrivate,
  onUploadImage,
  onLoadImages,
}: EditorProperties): JSX.Element {
  const router = useRouter();
  const isApple = useIsApplePlatform();
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  const editorViewReference = useRef<EditorView | null>(null);
  const previewReference = useRef<MarkdownPreviewHandle>(null);

  const [values, setValues] = useState(initialValues);
  const [savedValues, setSavedValues] = useState(initialValues);
  const [lastSaved, setLastSaved] = useState(lastSavedAt);
  const [busyAction, setBusyAction] = useState<'save' | 'publish' | 'schedule' | 'review' | null>(null);
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1, selectedLength: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openedModal, setOpenedModal] = useState<OpenedModal>(null);
  const [scheduleInput, setScheduleInput] = useState('');
  const [scheduleMinInput, setScheduleMinInput] = useState('');
  const [reviewDivisionInput, setReviewDivisionInput] = useState('');
  const [isReviewOrganizational, setIsReviewOrganizational] = useState(false);
  const [shouldShare, setShouldShare] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [storedDraft, setStoredDraft] = useState<StoredDraft | null>(null);
  const [isDraftChecked, setIsDraftChecked] = useState(false);
  const [uploadingImageCount, setUploadingImageCount] = useState(0);

  const draftStorageKey = getDraftStorageKey(postId);
  const isDirty = !isSamePostFormValues(values, savedValues);
  // 公開・予約は、執筆者が、承認された内容（未保存の変更がない）について行う
  const canPublishNow = review.isAuthor && review.panel.isApproved && !isDirty && status !== 'published';
  const publishBlockReason = getPublishBlockReason({
    isPublished: status === 'published',
    isAuthor: review.isAuthor,
    isApproved: review.panel.isApproved,
    isDirty,
  });
  const reviewRequest = review.panel.request;
  const latestRejection = review.panel.actions.findLast((action) => !action.isApproved);
  const canRequestReview = review.isAuthor
    && reviewRequest?.status !== 'pending'
    && reviewRequest?.status !== 'approved';
  const canWithdrawReview = review.isAuthor && reviewRequest?.status === 'pending';
  const reviewBadgeClassName = getReviewBadgeClassName(reviewRequest?.status);
  const isUploadingImage = uploadingImageCount > 0;
  // 画面幅が狭い場合は並べて表示できないため、エディタのみを表示する
  const effectiveViewMode: ViewMode = viewMode === 'split' && !isDesktop ? 'edit' : viewMode;
  const urlYear = publishedYear ?? expectedYear;
  const publicUrl = status !== 'draft' && publishedYear !== null && !savedValues.isPrivate
    ? `/posts/${publishedYear}/${savedValues.slug}`
    : null;

  const fieldErrors = useMemo(() => {
    const result = PostFormSchema.safeParse(values);
    const errors: Partial<Record<keyof PostFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof PostFormValues;
        errors[key] ??= issue.message;
      }
    }
    return errors;
  }, [values]);

  const stats = useMemo(() => {
    const characterCount = [...values.content.replaceAll(/\s/g, '')].length;
    return {
      characterCount,
      lineCount: values.content.split('\n').length,
      readingMinutes: characterCount === 0 ? 0 : Math.max(1, Math.ceil(characterCount / CHARACTERS_PER_MINUTE)),
    };
  }, [values.content]);

  const descriptionLength = values.description?.length ?? 0;
  const isDescriptionTooLong = descriptionLength > RECOMMENDED_DESCRIPTION_LENGTH;
  const isTagLimitReached = values.tags.length >= MAX_TAGS_PER_POST;

  /**
   * フォームの値を更新する。
   *
   * @param key - 更新する項目
   * @param value - 新しい値
   */
  function updateField<K extends keyof PostFormValues>(key: K, value: PostFormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  /**
   * 表示設定を更新し、ブラウザに保存する。
   *
   * @param changes - 変更する設定
   */
  function updatePreferences(changes: Partial<Preferences>): void {
    const preferences: Preferences = { viewMode, isScrollSyncEnabled, ...changes };
    setViewMode(preferences.viewMode);
    setIsScrollSyncEnabled(preferences.isScrollSyncEnabled);
    writeStorage(PREFERENCES_STORAGE_KEY, preferences);
  }

  /**
   * プレビューのスクロール位置をエディタに合わせる。
   */
  function syncPreviewScroll(): void {
    const view = editorViewReference.current;
    if (view && effectiveViewMode === 'split' && isScrollSyncEnabled) {
      previewReference.current?.scrollToSourceLine(getEditorScrollPosition(view));
    }
  }

  /**
   * エディタで編集コマンドを実行する。
   *
   * @param command - 実行するコマンド
   */
  function runCommand(command: MarkdownCommand): void {
    const view = editorViewReference.current;
    if (view) {
      command(view);
    }
  }

  /**
   * エディタの指定した行へ移動する。
   *
   * @param line - 移動先の行（0始まり）
   */
  function jumpToSourceLine(line: number): void {
    if (effectiveViewMode === 'preview') {
      setViewMode(isDesktop ? 'split' : 'edit');
    }
    // エディタが表示されてから移動する
    requestAnimationFrame(() => {
      const view = editorViewReference.current;
      if (!view) {
        return;
      }
      const target = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
      view.dispatch({
        selection: { anchor: target.from },
        effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 32 }),
      });
      view.focus();
    });
  }

  /**
   * 画像をアップロードして、本文に挿入する。
   *
   * アップロード中は目印を挿入しておき、アップロードが終わったら画像の Markdown に置き換える。
   *
   * @param files - アップロードするファイル
   * @param position - 挿入する位置（指定しない場合は、選択範囲に挿入する）
   */
  async function uploadImages(files: readonly File[], position?: number): Promise<void> {
    const view = editorViewReference.current;
    if (!view || files.length === 0) {
      return;
    }
    const errors: string[] = [];
    const validFiles = files.filter((file) => {
      const error = validateImageFile(file);
      if (error) {
        errors.push(error);
      }
      return !error;
    });
    if (validFiles.length > MAX_IMAGE_FILES_PER_UPLOAD) {
      errors.push(`一度にアップロードできる画像は${MAX_IMAGE_FILES_PER_UPLOAD}件までです。`);
    }
    const targets = validFiles.slice(0, MAX_IMAGE_FILES_PER_UPLOAD);
    if (targets.length === 0) {
      setToast({ type: 'error', message: errors.join('\n') });
      return;
    }

    const placeholders = new Map(targets.map((file) => [file, createUploadPlaceholder(file.name)]));
    insertImageLines(view, [...placeholders.values()], position);
    setUploadingImageCount((count) => count + targets.length);
    let uploadedCount = 0;
    let missingCount = 0;
    await uploadImageFiles(targets, onUploadImage, (file, result) => {
      setUploadingImageCount((count) => count - 1);
      const placeholder = placeholders.get(file) ?? '';
      const currentView = editorViewReference.current;
      if (result.ok) {
        uploadedCount++;
        if (!currentView || !replaceUploadPlaceholder(currentView, placeholder, toImageMarkdown(result.data))) {
          missingCount++;
        }
      } else {
        errors.push(result.error);
        if (currentView) {
          replaceUploadPlaceholder(currentView, placeholder, '');
        }
      }
    });

    if (missingCount > 0) {
      errors.push(
        `挿入する位置が本文から削除されていたため、${missingCount}件の画像は挿入していません。`
        + '「画像を挿入」から選んで挿入できます。',
      );
    }
    if (errors.length > 0) {
      setToast({
        type: 'error',
        message: (uploadedCount > 0 ? `${uploadedCount}件の画像をアップロードしました。\n` : '') + errors.join('\n'),
      });
    } else {
      setToast({ type: 'success', message: `${uploadedCount}件の画像をアップロードしました。` });
    }
  }

  /**
   * 編集内容を保存する。
   *
   * @returns 保存に成功した場合は `true`
   */
  async function save(): Promise<boolean> {
    if (busyAction) {
      return false;
    }
    const validation = PostFormSchema.safeParse(values);
    if (!validation.success) {
      setToast({ type: 'error', message: validation.error.issues[0]?.message ?? '入力内容を確認してください。' });
      return false;
    }
    const snapshot: PostFormValues = { ...values, description: normalizeDescription(values.description) };
    setBusyAction('save');
    try {
      const result = await onSave(snapshot);
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return false;
      }
      setSavedValues(snapshot);
      setLastSaved(result.savedAt);
      setStoredDraft(null);
      removeStorage(draftStorageKey);
      const canceled: string[] = [];
      if (result.isScheduleCanceled) {
        canceled.push('公開予約');
      }
      if (result.isReviewInvalidated) {
        canceled.push('レビュー');
      }
      setToast({
        type: 'success',
        message: canceled.length > 0 ? `保存しました。内容が変わったため、${canceled.join('・')}を取り消しました。` : '保存しました。',
      });
      router.refresh();
      return true;
    } catch (e) {
      console.error('Failed to save post:', e);
      setToast({ type: 'error', message: '保存できませんでした。通信状況を確認してください。' });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * 記事を公開する。未保存の変更がある場合は、保存してから公開する。
   */
  async function publish(): Promise<void> {
    setOpenedModal(null);
    if (isUploadingImage) {
      setToast({ type: 'error', message: '画像のアップロードが終わってから公開してください。' });
      return;
    }
    if (isDirty && !(await save())) {
      return;
    }
    setBusyAction('publish');
    try {
      const result = await onPublish();
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return;
      }
      setToast({ type: 'success', message: result.isFirstPublication ? '記事を公開しました。' : '更新内容を公開しました。' });
      if (shouldShare) {
        openShareWindow(result);
      }
      router.refresh();
    } catch (e) {
      console.error('Failed to publish post:', e);
      setToast({ type: 'error', message: '公開できませんでした。通信状況を確認してください。' });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * 公開予約の日時を入力する画面を開く。
   */
  function openScheduleDialog(): void {
    if (isUploadingImage) {
      setToast({ type: 'error', message: '画像のアップロードが終わってから予約してください。' });
      return;
    }
    const firstError = Object.values(fieldErrors).at(0);
    if (firstError) {
      setToast({ type: 'error', message: firstError });
      return;
    }
    setScheduleInput(scheduledPublishAt ? toDateTimeLocalValue(scheduledPublishAt) : getDefaultScheduleInput());
    setScheduleMinInput(toDateTimeLocalValue(new Date(Date.now() + MIN_SCHEDULE_DELAY_MS)));
    setOpenedModal('schedule');
  }

  /**
   * 公開を予約する。未保存の変更がある場合は、保存してから予約する。
   */
  async function schedule(): Promise<void> {
    const scheduledAt = new Date(scheduleInput);
    if (!scheduleInput || Number.isNaN(scheduledAt.getTime())) {
      setToast({ type: 'error', message: '公開する日時を入力してください。' });
      return;
    }
    if (scheduledAt.getTime() < Date.now() + MIN_SCHEDULE_DELAY_MS) {
      setToast({ type: 'error', message: '公開予約は1分以上先の日時を指定してください。' });
      return;
    }
    setOpenedModal(null);
    if (isDirty && !(await save())) {
      return;
    }
    setBusyAction('schedule');
    try {
      const result = await onSchedule(scheduledAt.toISOString());
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return;
      }
      setToast({ type: 'success', message: `${formatJstDateTime(result.data)} に公開されるよう予約しました。` });
      router.refresh();
    } catch (e) {
      console.error('Failed to schedule post:', e);
      setToast({ type: 'error', message: '予約できませんでした。通信状況を確認してください。' });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * 公開予約を取り消す。
   */
  async function cancelSchedule(): Promise<void> {
    setOpenedModal(null);
    setBusyAction('schedule');
    try {
      const result = await onCancelSchedule();
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return;
      }
      setToast({ type: 'success', message: '公開予約を取り消しました。' });
      router.refresh();
    } catch (e) {
      console.error('Failed to cancel scheduled post:', e);
      setToast({ type: 'error', message: '予約を取り消せませんでした。通信状況を確認してください。' });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * レビューの依頼の画面を開く。未保存の変更がある場合は、保存してから依頼してもらう。
   */
  function openReviewDialog(): void {
    if (isDirty) {
      setToast({ type: 'error', message: '未保存の変更があります。保存してから、レビューを依頼してください。' });
      return;
    }
    setReviewDivisionInput('');
    setIsReviewOrganizational(false);
    setOpenedModal('review');
  }

  /**
   * レビューを依頼する。
   */
  async function submitReview(): Promise<void> {
    if (!isReviewOrganizational && !reviewDivisionInput) {
      setToast({ type: 'error', message: '担当課を選択してください。' });
      return;
    }
    setOpenedModal(null);
    setBusyAction('review');
    try {
      const result = await onSubmitReview({
        divisionDn: reviewDivisionInput || null,
        isOrganizational: isReviewOrganizational,
      });
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return;
      }
      setToast({ type: 'success', message: 'レビューを依頼しました。承認者の確認をお待ちください。' });
      router.refresh();
    } catch (e) {
      console.error('Failed to request review:', e);
      setToast({ type: 'error', message: 'レビューを依頼できませんでした。通信状況を確認してください。' });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * 審査中の依頼を取り下げる。
   */
  async function withdrawReview(): Promise<void> {
    if (!globalThis.confirm('レビューの依頼を取り下げますか？')) {
      return;
    }
    setBusyAction('review');
    try {
      const result = await onWithdrawReview();
      if (!result.ok) {
        setToast({ type: 'error', message: result.error });
        return;
      }
      setToast({ type: 'success', message: 'レビューの依頼を取り下げました。' });
      router.refresh();
    } catch (e) {
      console.error('Failed to withdraw review:', e);
      setToast({ type: 'error', message: '取り下げできませんでした。通信状況を確認してください。' });
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * 公開の確認画面を開く。
   */
  function openPublishDialog(): void {
    if (isUploadingImage) {
      setToast({ type: 'error', message: '画像のアップロードが終わってから公開してください。' });
      return;
    }
    const firstError = Object.values(fieldErrors).at(0);
    if (firstError) {
      setToast({ type: 'error', message: firstError });
      return;
    }
    // 初回の公開時のみ、既定で告知用の投稿画面を開く
    setShouldShare(status === 'draft');
    setOpenedModal('publish');
  }

  /**
   * 一時保存した編集内容を復元する。
   */
  function restoreDraft(): void {
    if (!storedDraft) {
      return;
    }
    const draftValues = storedDraft.values;
    setValues(draftValues);
    const view = editorViewReference.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: draftValues.content } });
    }
    setStoredDraft(null);
  }

  // 表示設定を読み込む
  useEffect(() => {
    const preferences = readStorage(PREFERENCES_STORAGE_KEY, PreferencesSchema);
    if (preferences) {
      setViewMode(preferences.viewMode);
      setIsScrollSyncEnabled(preferences.isScrollSyncEnabled);
    }
  }, []);

  // 前回保存せずに閉じた編集内容があれば、復元できるようにする
  const checkStoredDraft = useEffectEvent(() => {
    const draft = readStorage(draftStorageKey, StoredDraftSchema);
    if (draft && !isSamePostFormValues(draft.values, initialValues)) {
      setStoredDraft(draft);
    }
    setIsDraftChecked(true);
  });
  useEffect(() => {
    checkStoredDraft();
  }, []);

  // 未保存の編集内容をブラウザに一時保存する
  useEffect(() => {
    if (!isDraftChecked) {
      return;
    }
    if (!isDirty) {
      // 復元するかどうかの選択前は、一時保存した内容を残しておく
      if (!storedDraft) {
        removeStorage(draftStorageKey);
      }
      return;
    }
    const timer = setTimeout(() => {
      writeStorage(draftStorageKey, { values, storedAt: new Date().toISOString() } satisfies StoredDraft);
    }, DRAFT_STORE_DELAY);
    return () => clearTimeout(timer);
  }, [draftStorageKey, isDirty, isDraftChecked, storedDraft, values]);

  // 未保存の変更がある場合は、ページを離れる前に確認する
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const listener = (event: BeforeUnloadEvent): void => event.preventDefault();
    globalThis.addEventListener('beforeunload', listener);
    return () => globalThis.removeEventListener('beforeunload', listener);
  }, [isDirty]);

  // 全画面表示中は背後のページをスクロールさせない
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isFullscreen]);

  // 成功時の通知は一定時間で消す
  useEffect(() => {
    if (!toast || toast.type === 'error') {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast]);

  // 表示モードなどが変わったら、プレビューのスクロール位置を合わせ直す
  const handleLayoutChange = useEffectEvent(() => syncPreviewScroll());
  useEffect(() => {
    handleLayoutChange();
  }, [effectiveViewMode, isScrollSyncEnabled, isFullscreen]);

  // ページ全体のキーボードショートカット
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!event.repeat) {
        save();
      }
      return;
    }
    if (event.key === 'Escape' && isFullscreen && openedModal === null && !event.defaultPrevented) {
      setIsFullscreen(false);
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => handleKeyDown(event);
    globalThis.addEventListener('keydown', listener);
    return () => globalThis.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/control/posts"
          onClick={(event) => {
            if (isDirty && !globalThis.confirm('保存されていない変更があります。このページを離れますか？')) {
              event.preventDefault();
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          投稿一覧
        </Link>
        <h1 className="text-2xl">投稿編集</h1>
        <PostStatusBadge status={status} />
        {savedValues.isPrivate && <PrivateBadge />}
        {scheduledPublishAt && (
          <span
            className={
              'inline-flex shrink-0 items-center rounded-full border border-blue-500/60 px-2.5 py-0.5 text-xs '
              + 'whitespace-nowrap text-blue-200'
            }
          >
            予約中: {formatJstDateTime(scheduledPublishAt)} に公開
          </span>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => setOpenedModal('history')}
            className={
              'inline-flex items-center gap-1.5 rounded border border-gray-600 px-2.5 py-1 text-sm text-gray-300 '
              + 'hover:border-gray-500 hover:bg-gray-800 hover:text-white'
            }
          >
            <History className="h-4 w-4" aria-hidden />
            編集履歴
          </button>
          <Link
            href={`/admin/control/posts/${postId}/comments`}
            onClick={(event) => {
              if (isDirty && !globalThis.confirm('保存されていない変更があります。このページを離れますか？')) {
                event.preventDefault();
              }
            }}
            className={
              'inline-flex items-center gap-1.5 rounded border border-gray-600 px-2.5 py-1 text-sm text-gray-300 '
              + 'hover:border-gray-500 hover:bg-gray-800 hover:text-white'
            }
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            コメント
            <span className="tabular-nums text-gray-400">{commentCount}</span>
            {unrepliedCommentCount > 0 && (
              <span className="rounded-full bg-sky-500/20 px-1.5 text-xs text-sky-300 tabular-nums">
                未返信 {unrepliedCommentCount}
              </span>
            )}
          </Link>
          {publicUrl && (
            <a
              href={publicUrl}
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

      {/* 一時保存した編集内容の復元 */}
      {storedDraft && (
        <div
          role="status"
          className={
            'flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 '
            + 'text-sm text-amber-100'
          }
        >
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
          <p className="min-w-0 flex-1">
            保存されていない編集内容が見つかりました（{formatDateTime(new Date(storedDraft.storedAt))} 時点）。復元しますか？
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreDraft}
              className="rounded bg-amber-500 px-3 py-1.5 font-medium text-gray-900 hover:bg-amber-400"
            >
              復元する
            </button>
            <button
              type="button"
              onClick={() => setStoredDraft(null)}
              className="rounded border border-amber-500/60 px-3 py-1.5 hover:bg-amber-500/10"
            >
              破棄する
            </button>
          </div>
        </div>
      )}

      {/* レビュー（公開前の承認。最新の版について表示する） */}
      {status !== 'published' && (
        <section aria-label="レビュー" className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-gray-100">レビュー</h2>
            <span
              className={
                'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap '
                + reviewBadgeClassName
              }
            >
              {reviewRequest
                ? (reviewRequest.status === 'pending' ? reviewRequest.stageLabel : reviewRequest.statusLabel)
                : '未依頼'}
            </span>
            {reviewRequest?.divisionName && (
              <span className="text-gray-400">担当課: {reviewRequest.divisionName}</span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canRequestReview && (
                <button
                  type="button"
                  onClick={openReviewDialog}
                  disabled={busyAction !== null || review.organizationError !== null}
                  title={review.organizationError ?? undefined}
                  className={
                    'inline-flex items-center gap-1.5 rounded border border-emerald-500/60 px-3 py-1.5 '
                    + 'text-emerald-200 enabled:hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50'
                  }
                >
                  {busyAction === 'review' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {reviewRequest ? '内容を修正して再依頼' : 'レビューを依頼'}
                </button>
              )}
              {canWithdrawReview && (
                <button
                  type="button"
                  onClick={withdrawReview}
                  disabled={busyAction !== null}
                  className={
                    'rounded border border-gray-500 px-3 py-1.5 text-gray-200 '
                    + 'enabled:hover:bg-gray-800 disabled:opacity-50'
                  }
                >
                  依頼を取り下げる
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-gray-300">
            {!review.isAuthor && '執筆者がレビューを依頼・公開します。'}
            {review.isAuthor && !reviewRequest && (
              isDirty
                ? '未保存の変更を保存してから、レビューを依頼してください。'
                : '公開するには、担当の承認者のレビューで承認される必要があります。'
            )}
            {reviewRequest?.status === 'pending' && (
              '審査中です。審査中の内容を保存すると、審査は取り消されます。'
            )}
            {reviewRequest?.status === 'approved' && '承認されました。公開・公開予約できます。'}
            {(reviewRequest?.status === 'withdrawn' || reviewRequest?.status === 'invalidated') && (
              '依頼は取り消されています。内容を確認して、改めて依頼してください。'
            )}
          </p>
          {latestRejection && reviewRequest?.status === 'rejected' && (
            <div className="mt-2 rounded border border-red-500/40 bg-red-950/40 p-3 text-red-100">
              <p className="font-medium">
                差し戻し（{latestRejection.reviewerName}・{formatJstDateTime(latestRejection.createdAt)}）
              </p>
              <p className="mt-1 whitespace-pre-line">{latestRejection.comment}</p>
            </div>
          )}
          {review.organizationError && <p className="mt-2 text-red-300">{review.organizationError}</p>}
          {review.panel.actions.length > 0 && (
            <details className="mt-2 text-gray-400">
              <summary className="cursor-pointer hover:text-gray-200">
                レビューの履歴（{review.panel.actions.length}件）
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {review.panel.actions.map((action) => (
                  <li key={`${action.stage}-${action.createdAt.getTime()}`}>
                    {action.isApproved ? '承認' : '差し戻し'}・{action.reviewerName}・{formatJstDateTime(action.createdAt)}
                    {action.comment && <p className="whitespace-pre-line text-gray-300">{action.comment}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* 記事の情報 */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-4">
          <Field label="タイトル" htmlFor="post-title" error={fieldErrors.title}>
            <input
              id="post-title"
              type="text"
              value={values.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="記事のタイトル"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? 'post-title-error' : undefined}
              className={`${INPUT_CLASS_NAME} text-lg ${fieldErrors.title ? 'border-red-500' : 'border-gray-600'}`}
            />
          </Field>
          <Field
            label="説明"
            htmlFor="post-description"
            aside={(
              <span className={`text-xs ${isDescriptionTooLong ? 'text-amber-300' : 'text-gray-500'}`}>
                {descriptionLength} / {RECOMMENDED_DESCRIPTION_LENGTH}文字
              </span>
            )}
          >
            <textarea
              id="post-description"
              rows={2}
              value={values.description ?? ''}
              onChange={(event) => updateField('description', event.target.value === '' ? null : event.target.value)}
              placeholder="記事の概要（記事一覧や検索結果、SNS での共有時に表示されます）"
              className={`${INPUT_CLASS_NAME} resize-y border-gray-600`}
            />
          </Field>
          <Field
            label="タグ"
            htmlFor="post-tags"
            error={fieldErrors.tags}
            aside={(
              <span className={`text-xs ${isTagLimitReached ? 'text-amber-300' : 'text-gray-500'}`}>
                {values.tags.length} / {MAX_TAGS_PER_POST}
              </span>
            )}
          >
            <TagInput
              id="post-tags"
              value={values.tags}
              options={availableTags}
              onChange={(tags) => updateField('tags', tags)}
              describedBy={fieldErrors.tags ? 'post-tags-error' : 'post-tags-hint'}
              isInvalid={!!fieldErrors.tags}
            />
            <p id="post-tags-hint" className="text-xs text-gray-500">
              既存のタグから選ぶか、新しいタグを作成できます。タグの変更は、保存するとすぐに公開ページに反映されます。
            </p>
          </Field>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="スラッグ" htmlFor="post-slug" error={fieldErrors.slug}>
            <input
              id="post-slug"
              type="text"
              value={values.slug}
              onChange={(event) => updateField('slug', event.target.value.toLowerCase().replaceAll(/[\s_]+/g, '-'))}
              placeholder="example-post"
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={!!fieldErrors.slug}
              aria-describedby={fieldErrors.slug ? 'post-slug-error' : 'post-slug-url'}
              className={`${INPUT_CLASS_NAME} font-mono ${fieldErrors.slug ? 'border-red-500' : 'border-gray-600'}`}
            />
            <p id="post-slug-url" className="text-xs break-all text-gray-500">
              URL: /posts/{urlYear}/{values.slug || '…'}
              {status === 'draft' && '（年度は公開時に確定します）'}
            </p>
            {status !== 'draft' && values.slug !== savedValues.slug && (
              <p className="text-xs text-amber-300">
                公開済みの記事のスラッグを変更すると、これまでの URL ではアクセスできなくなります。
              </p>
            )}
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-700 p-3">
            <input
              type="checkbox"
              checked={values.isPrivate}
              onChange={(event) => updateField('isPrivate', event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-500"
            />
            <span>
              <span className="text-sm font-medium">非公開にする</span>
              <span className="block text-xs text-gray-400">
                保存すると、公開済みの記事もサイトに表示されなくなります。
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* 本文 */}
      <section
        aria-label="本文"
        className={
          isFullscreen
            ? 'fixed inset-0 z-[60] flex flex-col bg-gray-900'
            : 'flex h-[75vh] min-h-[480px] flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900'
        }
      >
        <MarkdownToolbar
          onCommand={runCommand}
          onInsertImage={() => setOpenedModal('image')}
          isCommandDisabled={effectiveViewMode === 'preview'}
          viewMode={effectiveViewMode}
          onViewModeChange={(mode) => updatePreferences({ viewMode: mode })}
          isScrollSyncEnabled={isScrollSyncEnabled}
          onScrollSyncChange={(isEnabled) => updatePreferences({ isScrollSyncEnabled: isEnabled })}
          isFullscreen={isFullscreen}
          onFullscreenChange={setIsFullscreen}
          onShowHelp={() => setOpenedModal('help')}
        />
        <div className="flex min-h-0 flex-1">
          <MarkdownEditor
            initialValue={initialValues.content}
            onViewChange={(view) => {
              editorViewReference.current = view;
            }}
            onChange={(content) => updateField('content', content)}
            onCursorChange={setCursor}
            onScroll={syncPreviewScroll}
            onImageFiles={(files, position) => uploadImages(files, position)}
            className={`h-full min-w-0 flex-1 ${effectiveViewMode === 'preview' ? 'hidden' : ''}`}
          />
          <MarkdownPreview
            ref={previewReference}
            title={values.title}
            author={author}
            publishedAt={firstPublishedAt}
            tags={values.tags}
            content={values.content}
            isActive={effectiveViewMode !== 'edit'}
            onRender={syncPreviewScroll}
            onRequestEditLine={jumpToSourceLine}
            className={
              'min-w-0 flex-1 overflow-y-auto '
              + (effectiveViewMode === 'edit' ? 'hidden ' : '')
              + (effectiveViewMode === 'split' ? 'border-l border-gray-700' : '')
            }
          />
        </div>

        {/* ステータスバー */}
        <div
          className={
            'flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-700 bg-gray-800/60 px-3 py-2 '
            + 'text-xs text-gray-400'
          }
        >
          <span title="空白・改行を除いた文字数">{stats.characterCount.toLocaleString('ja-JP')}文字</span>
          <span>{stats.lineCount.toLocaleString('ja-JP')}行</span>
          {stats.readingMinutes > 0 && <span>約{stats.readingMinutes}分で読めます</span>}
          {effectiveViewMode !== 'preview' && (
            <span>
              {cursor.line}行 {cursor.column}列
              {cursor.selectedLength > 0 && `（${cursor.selectedLength}文字選択）`}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {isUploadingImage && (
              <span role="status" className="inline-flex items-center gap-1.5 text-sky-300">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                画像をアップロード中（{uploadingImageCount}件）
              </span>
            )}
            <span aria-live="polite" className={isDirty ? 'text-amber-300' : ''}>
              {isDirty ? '● 未保存の変更があります' : `最終保存: ${formatDateTime(lastSaved)}`}
            </span>
            <button
              type="button"
              onClick={() => save()}
              disabled={!isDirty || busyAction !== null}
              title={`保存（${formatShortcut(SHORTCUT_KEYS.save, isApple)}）`}
              className={
                'inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white '
                + 'enabled:hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {busyAction === 'save'
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                : <Save className="h-4 w-4" aria-hidden />}
              {busyAction === 'save' ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              onClick={openScheduleDialog}
              disabled={!canPublishNow || busyAction !== null || isUploadingImage}
              title={isUploadingImage ? '画像のアップロードが終わるまで予約できません' : publishBlockReason}
              className={
                'inline-flex items-center gap-1.5 rounded border border-blue-500/60 px-3 py-1.5 text-sm font-medium '
                + 'text-blue-200 enabled:hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {busyAction === 'schedule'
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                : <CalendarClock className="h-4 w-4" aria-hidden />}
              {scheduledPublishAt ? '予約を変更' : '予約公開'}
            </button>
            <button
              type="button"
              onClick={openPublishDialog}
              disabled={!canPublishNow || busyAction !== null || isUploadingImage}
              title={isUploadingImage ? '画像のアップロードが終わるまで公開できません' : publishBlockReason}
              className={
                'inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white '
                + 'enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {busyAction === 'publish'
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                : <Send className="h-4 w-4" aria-hidden />}
              {status === 'draft' ? '公開' : '更新を公開'}
            </button>
          </div>
        </div>
      </section>

      {/* 通知（画面下部にある保存・公開ボタンと重ならないよう、ヘッダーの下に表示する） */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={
            'fixed top-20 right-4 left-4 z-[70] flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg '
            + 'sm:left-auto sm:max-w-sm md:top-24 '
            + (toast.type === 'error'
              ? 'border-red-500/50 bg-red-950 text-red-100'
              : 'border-emerald-500/50 bg-emerald-950 text-emerald-100')
          }
        >
          {toast.type === 'error'
            ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
            : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />}
          <p className="min-w-0 flex-1 whitespace-pre-line">{toast.message}</p>
          <button
            type="button"
            aria-label="通知を閉じる"
            onClick={() => setToast(null)}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* 公開の確認 */}
      <Modal
        isOpen={openedModal === 'publish'}
        onRequestClose={() => setOpenedModal(null)}
        contentLabel={status === 'draft' ? '記事の公開' : '更新内容の公開'}
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            「{values.title}」を{status === 'draft' ? '公開' : '更新'}します。よろしいですか？
          </p>
          {isDirty && <p className="text-amber-300">未保存の変更は、保存してから公開されます。</p>}
          {scheduledPublishAt && (
            <p className="text-amber-300">
              公開予約（{formatJstDateTime(scheduledPublishAt)}）は取り消され、すぐに公開されます。
            </p>
          )}
          {values.isPrivate && (
            <p className="text-red-300">「非公開にする」が有効なため、公開してもサイトには表示されません。</p>
          )}
          <p className="break-all text-gray-400">URL: /posts/{urlYear}/{values.slug}</p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={shouldShare}
              onChange={(event) => setShouldShare(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            公開後に X（旧Twitter）の投稿画面を開く
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenedModal(null)}
              className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={publish}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              公開する
            </button>
          </div>
        </div>
      </Modal>

      {/* 公開の予約 */}
      <Modal
        isOpen={openedModal === 'schedule'}
        onRequestClose={() => setOpenedModal(null)}
        contentLabel="公開の予約"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>「{values.title}」を、指定した日時に公開します。</p>
          {scheduledPublishAt && (
            <p className="text-blue-200">現在の予約: {formatJstDateTime(scheduledPublishAt)}</p>
          )}
          {isDirty && <p className="text-amber-300">未保存の変更は、保存してから予約されます。</p>}
          <label className="flex flex-col gap-1">
            <span className="text-gray-300">公開日時（この端末のタイムゾーンで入力してください。日本では日本標準時）</span>
            <input
              type="datetime-local"
              value={scheduleInput}
              min={scheduleMinInput}
              onChange={(event) => setScheduleInput(event.target.value)}
              className={
                'rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 '
                + 'focus:outline-none focus:ring-2 focus:ring-blue-500'
              }
            />
          </label>
          <p className="text-gray-400">
            公開予約は、公開するまで記事を公開しません。内容を変更すると、予約は取り消されます。
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {scheduledPublishAt && (
              <button
                type="button"
                onClick={cancelSchedule}
                className="rounded border border-red-500/60 px-4 py-2 text-red-200 hover:bg-red-950"
              >
                予約を取り消す
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpenedModal(null)}
              className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={schedule}
              disabled={!scheduleInput}
              className={
                'rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 '
                + 'disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {scheduledPublishAt ? '予約を変更する' : '予約する'}
            </button>
          </div>
        </div>
      </Modal>

      {/* レビューの依頼 */}
      <Modal
        isOpen={openedModal === 'review'}
        onRequestClose={() => setOpenedModal(null)}
        contentLabel="レビューの依頼"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>「{values.title}」の公開を依頼します。</p>
          <p className="text-gray-400">
            通常の記事は、担当課の課長が承認したあと、局長または執行委員のいずれかが承認します。
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-gray-300">担当課</span>
            <select
              value={reviewDivisionInput}
              onChange={(event) => setReviewDivisionInput(event.target.value)}
              disabled={review.divisions.length === 0}
              className={
                'rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 '
                + 'focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50'
              }
            >
              <option value="">選択してください</option>
              {review.divisions.map((division) => (
                <option key={division.dn} value={division.dn}>{division.name}</option>
              ))}
            </select>
          </label>
          {review.canSubmitOrganizational && (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={isReviewOrganizational}
                onChange={(event) => setIsReviewOrganizational(event.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-500"
              />
              <span>
                組織運営に関する記事（会長または運営監査が承認します。担当課の承認は不要です）
              </span>
            </label>
          )}
          {review.organizationError && <p className="text-red-300">{review.organizationError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenedModal(null)}
              className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitReview}
              disabled={review.organizationError !== null}
              className={
                'rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 '
                + 'disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              依頼する
            </button>
          </div>
        </div>
      </Modal>

      <ShortcutHelpModal isOpen={openedModal === 'help'} onRequestClose={() => setOpenedModal(null)} />

      {openedModal === 'image' && (
        <ImagePickerDialog
          postId={postId}
          onLoad={onLoadImages}
          onInsert={(images) => {
            setOpenedModal(null);
            const view = editorViewReference.current;
            if (view) {
              insertImageLines(view, images.map((image) => toImageMarkdown(image)));
            }
          }}
          onUpload={(files) => {
            setOpenedModal(null);
            uploadImages(files);
          }}
          onRequestClose={() => setOpenedModal(null)}
        />
      )}

      {openedModal === 'history' && (
        <HistoryDialog
          onRequestClose={() => setOpenedModal(null)}
          author={author}
          isPostPrivate={savedValues.isPrivate}
          hasUnsavedChanges={isDirty}
          onLoad={onLoadHistory}
          onSetPrivate={onSetVersionPrivate}
        />
      )}
    </div>
  );
}
