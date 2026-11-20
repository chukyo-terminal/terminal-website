'use client';

import { useEffect, useId, useState } from 'react';

import { AlertTriangle, Eye, Inbox, LoaderCircle, Pen, Send, X } from 'lucide-react';

import Modal from '@/components/elements/modal';
import {
  InquirerMessageFormSchema, REPLY_SUBJECT_MAX_LENGTH, ReplyFormSchema, toReplySubject,
} from '../../_lib/contact';
import { buildReplyMailText, buildReplyTemplate, getQuotedMessage } from '../../_lib/reply-mail';
import { CONTACT_CONTENT_MAX_LENGTH, normalizeContactContent, normalizeSingleLine } from '@/utils/contact';

import type { JSX } from 'react';
import type { ContactDetail, InquirerMessageFormValues, ReplyFormValues, StaffUser } from '../../_lib/contact';


/**
 * 入力欄の共通クラス。
 */
const INPUT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 '
  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60';


/**
 * 主要な操作ボタンの共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-sm '
  + 'font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 '
  + 'disabled:hover:bg-emerald-600';


/**
 * 入力欄の下に表示するエラーメッセージ。
 *
 * @param properties - プロパティ
 * @returns エラーメッセージの要素
 */
function ErrorMessage({ message, onClose }: { message: string; onClose?: () => void }): JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-0.5 hover:bg-red-500/20">
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}


/**
 * 返信の作成と、問い合わせ者からの返信の記録の切り替え。
 */
type ComposerMode = 'reply' | 'record';


type ReplyComposerProperties = {
  contact: ContactDetail;
  /** ログイン中の管理者（書き出しの名乗りに使用する。不明な場合は `null`） */
  currentUser: StaffUser | null;
  /** メールの送信設定がされているかどうか */
  isMailConfigured: boolean;
  /** 受信メールの設定（IMAP）がされているかどうか（問い合わせ者からの返信を自動で記録するかどうか） */
  isImapConfigured: boolean;
  /** 署名に載せるサイトの URL */
  siteUrl: string | null;
  /** 操作中かどうか（操作中はすべてのボタンを無効にする） */
  isBusy: boolean;
  /** 返信を送信中かどうか */
  isSending: boolean;
  /** 問い合わせ者からの返信を記録中かどうか */
  isRecording: boolean;
  /** 送信・記録に失敗した場合のメッセージ */
  error: string | null;
  onClearError: () => void;
  /** 返信を送信する。成功した場合は `true` を返す */
  onSend: (values: ReplyFormValues, expectedLatestMessageId: number | null) => Promise<boolean>;
  /** 問い合わせ者からの返信を記録する。成功した場合は `true` を返す */
  onRecord: (values: InquirerMessageFormValues) => Promise<boolean>;
};


/**
 * 返信フォーム。
 *
 * 返信は、署名と問い合わせ者の最新のメッセージの引用を付けて、問い合わせ者にメールで送信する（送信前にプレビューと確認を行う）。
 * 問い合わせ者からメールで返信が届いた場合は、その内容を記録してやり取りを残せる。
 *
 * @param properties - プロパティ
 * @returns 返信フォーム
 */
export default function ReplyComposer({
  contact,
  currentUser,
  isMailConfigured,
  isImapConfigured,
  siteUrl,
  isBusy,
  isSending,
  isRecording,
  error,
  onClearError,
  onSend,
  onRecord,
}: ReplyComposerProperties): JSX.Element {
  const [mode, setMode] = useState<ComposerMode>('reply');
  // 未入力（`null`）の間は既定値を表示する。やり取りが追加されると、既定値（書き出しなど）も変わる
  const [replySubject, setReplySubject] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string | null>(null);
  const [markCompleted, setMarkCompleted] = useState<boolean | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [recordSubject, setRecordSubject] = useState<string | null>(null);
  const [recordContent, setRecordContent] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const baseId = useId();

  const defaultSubject = toReplySubject(contact.subject);
  const template = buildReplyTemplate({
    inquirerName: contact.name,
    staffName: currentUser?.name ?? null,
    messages: contact.messages,
  });
  const reply: ReplyFormValues = {
    subject: replySubject ?? defaultSubject,
    content: replyContent ?? template,
    markCompleted: markCompleted ?? contact.status === 'completed',
  };
  const record: InquirerMessageFormValues = { subject: recordSubject ?? defaultSubject, content: recordContent };
  const mailText = buildReplyMailText({
    content: normalizeContactContent(reply.content),
    inquirerName: contact.name,
    quoted: getQuotedMessage(contact),
    siteUrl,
  });
  const isReplyEdited = replyContent !== null && replyContent.trim() !== template.trim();
  const isDirty = isReplyEdited || recordContent.trim() !== '';
  const displayedError = validationError ?? error;

  // 入力中の内容がある場合は、ページを離れる前に確認する
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const listener = (event: BeforeUnloadEvent): void => event.preventDefault();
    globalThis.addEventListener('beforeunload', listener);
    return () => globalThis.removeEventListener('beforeunload', listener);
  }, [isDirty]);

  /**
   * エラーメッセージを消去する。
   */
  function clearErrors(): void {
    setValidationError(null);
    onClearError();
  }

  /**
   * 入力内容を検証し、送信の確認を表示する。
   */
  function openConfirmation(): void {
    if (isBusy) {
      return;
    }
    clearErrors();
    const parsed = ReplyFormSchema.safeParse(reply);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    if (!isReplyEdited) {
      setValidationError('本文を入力してください。');
      return;
    }
    setIsConfirming(true);
  }

  /**
   * 返信を送信する。成功した場合は入力内容を初期化する。
   */
  async function send(): Promise<void> {
    const parsed = ReplyFormSchema.safeParse(reply);
    if (!parsed.success) {
      return;
    }
    const isSucceeded = await onSend(parsed.data, contact.messages.at(-1)?.id ?? null);
    if (isSucceeded) {
      setIsConfirming(false);
      setReplySubject(null);
      setReplyContent(null);
      setMarkCompleted(null);
      setIsPreview(false);
    }
  }

  /**
   * 問い合わせ者からの返信を記録する。成功した場合は入力内容を初期化する。
   */
  async function submitRecord(): Promise<void> {
    if (isBusy) {
      return;
    }
    clearErrors();
    const parsed = InquirerMessageFormSchema.safeParse(record);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      return;
    }
    const isSucceeded = await onRecord(parsed.data);
    if (isSucceeded) {
      setRecordSubject(null);
      setRecordContent('');
      setMode('reply');
    }
  }

  return (
    <section aria-labelledby={`${baseId}-heading`} className="rounded-lg border border-gray-700 bg-gray-900/60">
      <h2 id={`${baseId}-heading`} className="sr-only">返信</h2>

      {/* 返信の作成と記録の切り替え */}
      <div role="tablist" aria-label="操作の種類" className="flex border-b border-gray-700">
        {([
          { value: 'reply', label: '返信を作成', icon: Send },
          { value: 'record', label: '届いた返信を記録', icon: Inbox },
        ] as const).map((tab) => {
          const isSelected = mode === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.value}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel`}
              onClick={() => {
                setMode(tab.value);
                setValidationError(null);
              }}
              className={
                '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors '
                + (isSelected
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-gray-400 hover:text-gray-200')
              }
            >
              <tab.icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${mode}`}
        className="flex flex-col gap-4 p-4"
      >
        {mode === 'reply' ? (
          <>
            {!isMailConfigured && (
              <div
                className={
                  'flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm '
                  + 'text-amber-200'
                }
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  メールの送信設定（環境変数 <code>SMTP_HOST</code>・<code>MAIL_FROM</code>）がされていないため、
                  返信を送信できません。
                </p>
              </div>
            )}

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-400">宛先</dt>
              <dd className="break-all text-gray-200">{contact.name} &lt;{contact.email}&gt;</dd>
            </dl>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-subject`} className="text-sm text-gray-400">件名</label>
              <input
                id={`${baseId}-subject`}
                type="text"
                value={reply.subject}
                onChange={(event) => {
                  setReplySubject(event.target.value);
                  setValidationError(null);
                }}
                maxLength={REPLY_SUBJECT_MAX_LENGTH}
                disabled={isSending}
                className={INPUT_CLASS_NAME}
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label htmlFor={`${baseId}-content`} className="text-sm text-gray-400">
                  本文
                </label>
                <div role="group" aria-label="本文の表示" className="flex rounded border border-gray-700 p-0.5 text-xs">
                  {([
                    { value: false, label: '編集', icon: Pen },
                    { value: true, label: 'プレビュー', icon: Eye },
                  ] as const).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={isPreview === option.value}
                      onClick={() => setIsPreview(option.value)}
                      className={
                        'inline-flex items-center gap-1 rounded px-2 py-1 '
                        + (isPreview === option.value
                          ? 'bg-gray-700 text-gray-100'
                          : 'text-gray-400 hover:text-gray-200')
                      }
                    >
                      <option.icon className="h-3.5 w-3.5" aria-hidden />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {isPreview ? (
                <pre
                  aria-label="送信するメールの本文"
                  className={
                    'max-h-[32rem] min-h-64 overflow-y-auto rounded border border-gray-700 bg-gray-950/60 px-3 py-2 '
                    + 'font-sans text-sm whitespace-pre-wrap break-words text-gray-200'
                  }
                >
                  {mailText}
                </pre>
              ) : (
                <textarea
                  id={`${baseId}-content`}
                  value={reply.content}
                  onChange={(event) => {
                    setReplyContent(event.target.value);
                    setValidationError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      openConfirmation();
                    }
                  }}
                  rows={12}
                  maxLength={CONTACT_CONTENT_MAX_LENGTH}
                  disabled={isSending}
                  className={`${INPUT_CLASS_NAME} min-h-64 resize-y leading-relaxed`}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <p>署名と、問い合わせ者の最新のメッセージの引用は自動で追加されます（プレビューで確認できます）。</p>
                <span className="tabular-nums">{reply.content.length} / {CONTACT_CONTENT_MAX_LENGTH}</span>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 self-start text-sm text-gray-300">
              <input
                type="checkbox"
                checked={reply.markCompleted}
                onChange={(event) => setMarkCompleted(event.target.checked)}
                disabled={isSending}
                className="h-4 w-4 accent-emerald-500"
              />
              送信後に対応を完了にする
            </label>

            {displayedError && !isConfirming && <ErrorMessage message={displayedError} onClose={clearErrors} />}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {isReplyEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setReplySubject(null);
                    setReplyContent(null);
                    setMarkCompleted(null);
                    clearErrors();
                  }}
                  disabled={isBusy}
                  className="text-sm text-gray-400 hover:text-gray-200 hover:underline disabled:opacity-60"
                >
                  入力内容を破棄
                </button>
              )}
              <button
                type="button"
                onClick={openConfirmation}
                disabled={isBusy || !isMailConfigured}
                className={PRIMARY_BUTTON_CLASS_NAME}
              >
                <Send className="h-4 w-4" aria-hidden />
                送信内容を確認
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400">
              {isImapConfigured
                ? '問い合わせ者が返信メールに返信した場合は、自動で記録されます。'
                  + '自動で記録されなかったメール（返信ではなく新しく送られてきたメールなど）は、ここから記録してください。'
                : '問い合わせ者からメールで返信が届いた場合に、その内容を記録してやり取りを残します。'}
              記録してもメールは送信されません。
              {contact.status === 'completed' && (
                <span className="text-amber-300">記録すると、対応状況は未完了に戻ります。</span>
              )}
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-record-subject`} className="text-sm text-gray-400">件名</label>
              <input
                id={`${baseId}-record-subject`}
                type="text"
                value={record.subject}
                onChange={(event) => {
                  setRecordSubject(event.target.value);
                  setValidationError(null);
                }}
                maxLength={REPLY_SUBJECT_MAX_LENGTH}
                disabled={isRecording}
                className={INPUT_CLASS_NAME}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${baseId}-record-content`} className="text-sm text-gray-400">本文</label>
              <textarea
                id={`${baseId}-record-content`}
                value={record.content}
                onChange={(event) => {
                  setRecordContent(event.target.value);
                  setValidationError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void submitRecord();
                  }
                }}
                rows={8}
                maxLength={CONTACT_CONTENT_MAX_LENGTH}
                placeholder="届いたメールの本文を貼り付けてください"
                disabled={isRecording}
                className={`${INPUT_CLASS_NAME} resize-y leading-relaxed`}
              />
              <span className="self-end text-xs text-gray-500 tabular-nums">
                {record.content.length} / {CONTACT_CONTENT_MAX_LENGTH}
              </span>
            </div>

            {displayedError && <ErrorMessage message={displayedError} onClose={clearErrors} />}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void submitRecord()}
                disabled={isBusy || record.content.trim() === ''}
                className={PRIMARY_BUTTON_CLASS_NAME}
              >
                {isRecording
                  ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  : <Inbox className="h-4 w-4" aria-hidden />}
                記録する
              </button>
            </div>
          </>
        )}
      </div>

      {/* 送信の確認 */}
      <Modal
        isOpen={isConfirming}
        onRequestClose={() => {
          if (!isSending) {
            setIsConfirming(false);
            onClearError();
          }
        }}
        contentLabel="返信を送信"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-300">次の内容でメールを送信します。送信したメールは取り消せません。</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-400">宛先</dt>
            <dd className="break-all text-gray-100">{contact.name} &lt;{contact.email}&gt;</dd>
            <dt className="text-gray-400">件名</dt>
            <dd className="break-words text-gray-100">{normalizeSingleLine(reply.subject)}</dd>
            <dt className="text-gray-400">送信後</dt>
            <dd className="text-gray-100">
              {reply.markCompleted && '対応を完了にします'}
              {!reply.markCompleted && (contact.status === 'completed' ? '対応状況を未完了に戻します' : '対応中にします')}
            </dd>
          </dl>
          <pre
            aria-label="送信するメールの本文"
            className={
              'max-h-60 overflow-y-auto rounded border-l-2 border-gray-600 bg-gray-900/60 px-3 py-2 font-sans text-xs '
              + 'whitespace-pre-wrap break-words text-gray-300'
            }
          >
            {mailText}
          </pre>
          {error && <ErrorMessage message={error} />}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsConfirming(false);
                onClearError();
              }}
              disabled={isSending}
              className="rounded px-4 py-2 text-gray-300 hover:bg-gray-700 disabled:opacity-60"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={isBusy}
              className={PRIMARY_BUTTON_CLASS_NAME}
            >
              {isSending
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                : <Send className="h-4 w-4" aria-hidden />}
              送信する
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
