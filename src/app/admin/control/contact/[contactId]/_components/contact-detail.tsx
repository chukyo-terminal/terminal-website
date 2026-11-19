'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, Inbox, LoaderCircle, Mail, Paperclip,
  RefreshCw, RotateCcw, Send, Trash2, UserRound, X,
} from 'lucide-react';

import ReplyComposer from './reply-composer';
import Modal from '@/components/elements/modal';
import { formatDateTime, formatRelativeTime } from '@/app/admin/control/posts/_lib/date-format';
import { splitQuotedText } from '@/lib/contact';
import ContactStatusBadge from '../../_components/contact-status-badge';

import type { JSX, ReactNode } from 'react';
import type {
  ContactDetail, ContactMessage, InquirerMessageFormValues, ReplyFormValues, StaffUser,
} from '../../_lib/contact';
import type { ActionResult } from '@/types';


/**
 * お問い合わせ一覧のパス。
 */
const CONTACT_LIST_PATH = '/admin/control/contact';


/**
 * 操作ボタンの共通クラス。
 */
const ACTION_BUTTON_CLASS_NAME = 'inline-flex items-center justify-center gap-1.5 rounded border border-gray-700 '
  + 'px-2.5 py-1 text-sm text-gray-300 hover:border-gray-500 hover:bg-gray-800 hover:text-white '
  + 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';


/**
 * サイドバーのカードの共通クラス。
 */
const CARD_CLASS_NAME = 'flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4';


/**
 * 操作中の処理を表すキー。
 */
type BusyKey = 'reload' | 'assign' | 'complete' | 'send' | 'record' | 'delete-contact' | `message:${number}` | null;


/**
 * 削除の確認の対象。
 */
type DeleteTarget = { type: 'contact' } | { type: 'message'; message: ContactMessage };


/**
 * エラーメッセージを表示する場所（操作した場所の近くに表示する）。
 */
type ErrorArea = 'global' | 'composer' | 'modal';


/**
 * 未完了のお問い合わせの対応状況の説明を返す。
 *
 * @param contact - お問い合わせ
 * @returns 説明
 */
function describeOpenStatus(contact: Pick<ContactDetail, 'status' | 'needsReply'>): string {
  if (contact.status === 'new') {
    return 'まだ返信していません。';
  }
  return contact.needsReply
    ? '問い合わせ者から返信が届いています。'
    : '返信済みです。対応が終わったら完了にしてください。';
}


/**
 * 日時（正確な日時と相対時刻）。
 *
 * @param properties - プロパティ
 * @returns 日時の要素
 */
function DateTime({ date, now }: { date: Date; now: Date }): JSX.Element {
  return (
    <time dateTime={date.toISOString()} className="text-xs text-gray-500">
      {formatDateTime(date)}（{formatRelativeTime(date, now)}）
    </time>
  );
}


/**
 * やり取りの1件分（問い合わせ自体、管理者の返信、問い合わせ者からの返信）。
 *
 * 問い合わせ者からの返信は、末尾の引用（返信元のメールの引用）を折りたたんで表示する。
 *
 * @param properties - プロパティ
 * @returns やり取りの要素
 */
function MessageCard({
  id,
  variant,
  title,
  note,
  subject,
  content,
  date,
  now,
  warning,
  attachmentNames = [],
  actions,
}: {
  id: string;
  variant: 'inquiry' | 'staff' | 'inquirer';
  title: ReactNode;
  /** タイトルの横に表示する補足 */
  note?: ReactNode;
  subject: string;
  content: string;
  date: Date;
  now: Date;
  /** 注意を促すメッセージ */
  warning?: string;
  /** 添付ファイルの名前 */
  attachmentNames?: string[];
  actions?: ReactNode;
}): JSX.Element {
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const quoteId = useId();
  const { body, quoted } = variant === 'inquirer' ? splitQuotedText(content) : { body: content, quoted: '' };
  const styles = {
    inquiry: { className: 'border-gray-700 bg-gray-900/40', icon: Mail, iconClassName: 'text-gray-400' },
    staff: { className: 'border-emerald-500/30 bg-emerald-500/5', icon: Send, iconClassName: 'text-emerald-400' },
    inquirer: { className: 'border-sky-500/30 bg-sky-500/5', icon: Inbox, iconClassName: 'text-sky-400' },
  }[variant];
  return (
    <article id={id} className={`flex scroll-mt-24 flex-col gap-3 rounded-lg border p-4 ${styles.className}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <styles.icon className={`h-4 w-4 shrink-0 ${styles.iconClassName}`} aria-hidden />
        <h3 className="font-medium break-all text-gray-100">{title}</h3>
        {note && <span className="text-xs text-gray-400">{note}</span>}
        <span className="ml-auto"><DateTime date={date} now={now} /></span>
      </header>
      <p className="text-sm break-words text-gray-400">
        <span className="text-gray-500">件名: </span>
        {subject}
      </p>
      {warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-all">{warning}</span>
        </p>
      )}
      <p className="break-words whitespace-pre-wrap text-gray-200">{body}</p>
      {quoted && (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            aria-expanded={isQuoteOpen}
            aria-controls={quoteId}
            onClick={() => setIsQuoteOpen(!isQuoteOpen)}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
          >
            {isQuoteOpen
              ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            {isQuoteOpen ? '引用を隠す' : '引用を表示'}
          </button>
          {isQuoteOpen && (
            <p
              id={quoteId}
              className={
                'w-full border-l-2 border-gray-700 pl-3 text-sm break-words whitespace-pre-wrap text-gray-500'
              }
            >
              {quoted}
            </p>
          )}
        </div>
      )}
      {attachmentNames.length > 0 && (
        <div className="flex flex-col gap-1 rounded border border-gray-700/70 bg-gray-950/30 px-3 py-2 text-sm">
          <p className="text-xs text-gray-400">
            添付ファイル（この画面では開けません。メールソフトで確認してください）
          </p>
          <ul className="flex flex-col gap-0.5">
            {attachmentNames.map((name, index) => (
              <li key={`${index}-${name}`} className="flex items-center gap-1.5 break-all text-gray-200">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
    </article>
  );
}


/**
 * 問い合わせ者からの返信の送信元について、注意を促すメッセージを返す。
 *
 * @param message - 問い合わせ者からの返信
 * @param contactEmail - 問い合わせ者のメールアドレス
 * @returns メッセージ（注意が必要ない場合は `undefined`）
 */
function getSenderWarning(message: ContactMessage, contactEmail: string): string | undefined {
  if (!message.receivedMail) {
    return undefined;
  }
  const { fromAddress } = message.receivedMail;
  if (fromAddress === null) {
    return '送信元のメールアドレスを読み取れませんでした。';
  }
  return fromAddress.toLowerCase() === contactEmail.toLowerCase()
    ? undefined
    : `送信元（${fromAddress}）が、問い合わせ者のメールアドレスと異なります。`;
}


type ContactDetailProperties = {
  initialContact: ContactDetail;
  /** 担当者に割り当てられる管理者 */
  staffUsers: StaffUser[];
  /** ログイン中の管理者（不明な場合は `null`） */
  currentUser: StaffUser | null;
  /** メールの送信設定がされているかどうか */
  isMailConfigured: boolean;
  /** 受信メールの設定（IMAP）がされているかどうか */
  isImapConfigured: boolean;
  /** 署名に載せるサイトの URL */
  siteUrl: string | null;
  /** 相対時刻（「3時間前」など）の基準日時 */
  now: Date;
  onReload: () => Promise<ActionResult<ContactDetail>>;
  onAssign: (assigneeId: number | null) => Promise<ActionResult<ContactDetail>>;
  onSetCompleted: (isCompleted: boolean) => Promise<ActionResult<ContactDetail>>;
  /** 返信を送信する（`expectedLatestMessageId` は、画面に表示している最新のやり取りのID） */
  onSendReply: (
    values: ReplyFormValues,
    expectedLatestMessageId: number | null,
  ) => Promise<ActionResult<ContactDetail>>;
  onRecordInquirerMessage: (values: InquirerMessageFormValues) => Promise<ActionResult<ContactDetail>>;
  onDeleteInquirerMessage: (messageId: number) => Promise<ActionResult<ContactDetail>>;
  onDeleteContact: () => Promise<ActionResult>;
};


/**
 * お問い合わせの詳細画面。
 *
 * やり取りの表示、返信の送信、問い合わせ者からの返信の記録、担当者・対応状況の変更、お問い合わせの削除ができる。
 *
 * @param properties - プロパティ
 * @returns お問い合わせの詳細画面
 */
export default function ContactDetailView({
  initialContact,
  staffUsers,
  currentUser,
  isMailConfigured,
  isImapConfigured,
  siteUrl,
  now: initialNow,
  onReload,
  onAssign,
  onSetCompleted,
  onSendReply,
  onRecordInquirerMessage,
  onDeleteInquirerMessage,
  onDeleteContact,
}: ContactDetailProperties): JSX.Element {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [now, setNow] = useState(initialNow);
  const [busyKey, setBusyKey] = useState<BusyKey>(null);
  const [error, setError] = useState<{ message: string; area: ErrorArea } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isEmailCopied, setIsEmailCopied] = useState(false);
  const assigneeSelectId = useId();

  const isBusy = busyKey !== null;
  const isCompleted = contact.status === 'completed';
  // 無効化した管理者が担当している場合も、担当者として表示する
  const isInactiveAssignee = contact.assignee !== null && !staffUsers.some((user) => user.id === contact.assignee?.id);

  /**
   * お問い合わせを操作し、成功した場合は表示を更新する。
   *
   * @param key - 操作中の処理を表すキー
   * @param area - 失敗した場合にエラーメッセージを表示する場所
   * @param action - 操作
   * @returns 成功した場合は `true`
   */
  async function run(
    key: Exclude<BusyKey, null>,
    area: ErrorArea,
    action: () => Promise<ActionResult<ContactDetail>>,
  ): Promise<boolean> {
    if (busyKey !== null) {
      return false;
    }
    setBusyKey(key);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError({ message: result.error, area });
        return false;
      }
      setContact(result.data);
      setNow(new Date());
      return true;
    } catch (e) {
      console.error('Contact action failed:', e);
      setError({ message: '操作に失敗しました。通信環境を確認して、再度お試しください。', area });
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * 削除の確認で「削除する」が押されたときに、削除する。
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || busyKey !== null) {
      return;
    }
    if (deleteTarget.type === 'message') {
      const { id } = deleteTarget.message;
      if (await run(`message:${id}`, 'modal', () => onDeleteInquirerMessage(id))) {
        setDeleteTarget(null);
      }
      return;
    }
    setBusyKey('delete-contact');
    setError(null);
    try {
      const result = await onDeleteContact();
      if (!result.ok) {
        setError({ message: result.error, area: 'modal' });
        setBusyKey(null);
        return;
      }
      // 一覧に戻るまで操作できないよう、操作中のままにする
      router.push(CONTACT_LIST_PATH);
    } catch (e) {
      console.error('Failed to delete contact:', e);
      setError({ message: '操作に失敗しました。通信環境を確認して、再度お試しください。', area: 'modal' });
      setBusyKey(null);
    }
  }

  /**
   * 問い合わせ者のメールアドレスをクリップボードにコピーする。
   */
  async function copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(contact.email);
      setIsEmailCopied(true);
      setTimeout(() => setIsEmailCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy email:', e);
    }
  }

  /**
   * 削除の確認を閉じる。
   */
  function closeDeleteConfirmation(): void {
    if (busyKey === null) {
      setDeleteTarget(null);
      setError(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href={CONTACT_LIST_PATH}
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            お問い合わせ一覧
          </Link>
          <button
            type="button"
            onClick={() => void run('reload', 'global', onReload)}
            disabled={isBusy}
            className={ACTION_BUTTON_CLASS_NAME}
          >
            <RefreshCw className={`h-4 w-4 ${busyKey === 'reload' ? 'animate-spin' : ''}`} aria-hidden />
            再読み込み
          </button>
        </div>
        <h1 className="text-2xl break-words">{contact.subject}</h1>
      </div>

      {error?.area === 'global' && (
        <div
          role="alert"
          className={
            'flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200'
          }
        >
          <p className="min-w-0 flex-1">{error.message}</p>
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* 対応状況・担当者・問い合わせ者（狭い画面では、やり取りより先に表示する） */}
        <aside
          aria-label="対応の管理"
          className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:grid-cols-1"
        >
          <section className={CARD_CLASS_NAME}>
            <h2 className="text-sm font-medium text-gray-300">対応状況</h2>
            <div className="flex flex-wrap items-center gap-2">
              <ContactStatusBadge status={contact.status} needsReply={contact.needsReply} />
            </div>
            <p className="text-xs text-gray-500">
              {contact.completedAt ? (
                <>
                  <time dateTime={contact.completedAt.toISOString()}>{formatDateTime(contact.completedAt)}</time> に完了
                </>
              ) : describeOpenStatus(contact)}
            </p>
            <button
              type="button"
              onClick={() => void run('complete', 'global', () => onSetCompleted(!isCompleted))}
              disabled={isBusy}
              className={`${ACTION_BUTTON_CLASS_NAME} py-1.5`}
            >
              {busyKey === 'complete' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {busyKey !== 'complete' && (isCompleted
                ? <RotateCcw className="h-4 w-4" aria-hidden />
                : <CheckCircle2 className="h-4 w-4" aria-hidden />)}
              {isCompleted ? '未完了に戻す' : '対応を完了にする'}
            </button>
          </section>

          <section className={CARD_CLASS_NAME}>
            <h2 className="text-sm font-medium text-gray-300">
              <label htmlFor={assigneeSelectId}>担当者</label>
            </h2>
            <div className="relative">
              <select
                id={assigneeSelectId}
                value={contact.assignee ? String(contact.assignee.id) : ''}
                onChange={(event) => {
                  const value = event.target.value;
                  void run('assign', 'global', () => onAssign(value === '' ? null : Number(value)));
                }}
                disabled={isBusy}
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
                  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60'
                }
              >
                <option value="">未割り当て</option>
                {isInactiveAssignee && contact.assignee && (
                  <option value={String(contact.assignee.id)}>{contact.assignee.name}（無効なユーザー）</option>
                )}
                {staffUsers.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.name}{user.id === currentUser?.id ? '（自分）' : ''}
                  </option>
                ))}
              </select>
              {busyKey === 'assign' && (
                <LoaderCircle
                  className="absolute top-1/2 right-8 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400"
                  aria-label="変更中"
                />
              )}
            </div>
            {currentUser && contact.assignee?.id !== currentUser.id && (
              <button
                type="button"
                onClick={() => void run('assign', 'global', () => onAssign(currentUser.id))}
                disabled={isBusy}
                className={`${ACTION_BUTTON_CLASS_NAME} py-1.5`}
              >
                <UserRound className="h-4 w-4" aria-hidden />
                自分が担当する
              </button>
            )}
          </section>

          <section className={`${CARD_CLASS_NAME} sm:col-span-2 lg:col-span-1`}>
            <h2 className="text-sm font-medium text-gray-300">問い合わせ者</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">お名前</dt>
                <dd className="break-all text-gray-100">{contact.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">メールアドレス</dt>
                <dd className="flex items-start gap-1">
                  <a
                    href={`mailto:${contact.email}`}
                    className="min-w-0 break-all text-emerald-300 hover:underline"
                  >
                    {contact.email}
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyEmail()}
                    title="メールアドレスをコピー"
                    aria-label={isEmailCopied ? 'コピーしました' : 'メールアドレスをコピー'}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                  >
                    {isEmailCopied
                      ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                      : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">受付日時</dt>
                <dd className="text-gray-100">
                  <time dateTime={contact.createdAt.toISOString()}>{formatDateTime(contact.createdAt)}</time>
                </dd>
              </div>
            </dl>
          </section>

          <button
            type="button"
            onClick={() => setDeleteTarget({ type: 'contact' })}
            disabled={isBusy}
            className={
              'inline-flex items-center justify-center gap-1.5 self-start rounded px-2 py-1 text-sm text-gray-500 '
              + 'hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 sm:col-span-2 lg:col-span-1'
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            このお問い合わせを削除
          </button>
        </aside>

        {/* やり取りと返信フォーム */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <section aria-label="やり取り">
            <ol className="flex flex-col gap-4">
              <li>
                <MessageCard
                  id="inquiry"
                  variant="inquiry"
                  title={`${contact.name} 様からのお問い合わせ`}
                  subject={contact.subject}
                  content={contact.content}
                  date={contact.createdAt}
                  now={now}
                />
              </li>
              {contact.messages.map((message) => (
                <li key={message.id}>
                  {message.isFromInquirer ? (
                    <MessageCard
                      id={`message-${message.id}`}
                      variant="inquirer"
                      title={`${contact.name} 様からの返信`}
                      note={message.receivedMail
                        ? 'メールで受信'
                        : `${message.author?.name ?? '削除されたユーザー'} が記録`}
                      subject={message.subject}
                      content={message.content}
                      date={message.createdAt}
                      now={now}
                      warning={getSenderWarning(message, contact.email)}
                      attachmentNames={message.receivedMail?.attachmentNames}
                      actions={(
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'message', message })}
                          disabled={isBusy}
                          className={`${ACTION_BUTTON_CLASS_NAME} hover:border-red-500/60 hover:text-red-300`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          記録を削除
                        </button>
                      )}
                    />
                  ) : (
                    <MessageCard
                      id={`message-${message.id}`}
                      variant="staff"
                      title={`${message.author?.name ?? '削除されたユーザー'} が返信`}
                      note="メールで送信済み"
                      subject={message.subject}
                      content={message.content}
                      date={message.createdAt}
                      now={now}
                    />
                  )}
                </li>
              ))}
            </ol>
          </section>

          <ReplyComposer
            contact={contact}
            currentUser={currentUser}
            isMailConfigured={isMailConfigured}
            isImapConfigured={isImapConfigured}
            siteUrl={siteUrl}
            isBusy={isBusy}
            isSending={busyKey === 'send'}
            isRecording={busyKey === 'record'}
            error={error?.area === 'composer' ? error.message : null}
            onClearError={() => setError(null)}
            onSend={(values, expectedLatestMessageId) => run(
              'send',
              'composer',
              () => onSendReply(values, expectedLatestMessageId),
            )}
            onRecord={(values) => run('record', 'composer', () => onRecordInquirerMessage(values))}
          />
        </div>
      </div>

      {/* 削除の確認 */}
      <Modal
        isOpen={deleteTarget !== null}
        onRequestClose={closeDeleteConfirmation}
        contentLabel={deleteTarget?.type === 'message' ? '記録を削除' : 'お問い合わせを削除'}
      >
        {deleteTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-300">
              {deleteTarget.type === 'message'
                ? '問い合わせ者からの返信の記録を削除します。この操作は取り消せません。'
                  + (deleteTarget.message.receivedMail
                    ? 'メールボックスのメールは削除されません。削除した記録は、自動で記録し直されません。'
                    : '')
                : 'このお問い合わせと、すべてのやり取りの記録を削除します。この操作は取り消せません。'
                  + '迷惑メールなど、記録を残す必要がない場合のみ削除してください。'}
            </p>
            <blockquote
              className={
                'max-h-40 overflow-y-auto rounded border-l-2 border-gray-600 bg-gray-900/60 px-3 py-2 text-sm '
                + 'whitespace-pre-wrap break-words text-gray-400'
              }
            >
              {deleteTarget.type === 'message' ? deleteTarget.message.content : contact.subject}
            </blockquote>
            {error?.area === 'modal' && <p role="alert" className="text-sm text-red-400">{error.message}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirmation}
                disabled={isBusy}
                className="rounded px-4 py-2 text-gray-300 hover:bg-gray-700 disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={isBusy}
                className={
                  'inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 '
                  + 'disabled:opacity-60'
                }
              >
                {isBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                削除する
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
