'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import {
  AlertTriangle, CheckCircle2, ExternalLink, Inbox, Mail, MailCheck, MessageSquare, RefreshCw, Search, SearchX,
  UserRound, X,
} from 'lucide-react';

import ContactStatusBadge from './contact-status-badge';
import { formatDateTime, formatRelativeTime } from '@/app/admin/control/posts/_lib/date-format';
import {
  ASSIGNEE_FILTER_ME, ASSIGNEE_FILTER_NONE, CONTACT_SORT_ORDERS, CONTACT_STATUS_FILTERS, DEFAULT_CONTACT_FILTERS,
  countByContactStatus, filterAndSortContacts, hasActiveFilters, toSearchParameters,
} from '../_lib/contact-list';

import type { JSX } from 'react';
import type { ContactListItem, StaffUser } from '../_lib/contact';
import type { ContactListFilters, ContactSortOrder } from '../_lib/contact-list';
import type { MailSyncResult, MailSyncStatus } from '@/utils/contact-mail-sync';
import type { ActionResult } from '@/types';


/**
 * 一覧が空のときの表示の共通クラス。
 */
const EMPTY_STATE_CLASS_NAME = 'flex flex-col items-center rounded-lg border border-dashed border-gray-700 px-6 '
  + 'text-center';


/**
 * セレクトボックスの共通クラス。
 */
const SELECT_CLASS_NAME = 'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500';


/**
 * お問い合わせの一覧の1件分。カード全体が詳細ページへのリンクになる。
 *
 * @param properties - プロパティ
 * @returns お問い合わせの1件分
 */
function ContactCard({ contact, now }: { contact: ContactListItem; now: Date }): JSX.Element {
  return (
    <li
      className={
        'group relative rounded-lg border p-4 transition-colors hover:border-emerald-500/50 hover:bg-gray-800/40 '
        + 'focus-within:border-emerald-500/60 '
        + (contact.status === 'completed' ? 'border-gray-800/70 bg-gray-900/20' : 'border-gray-800 bg-gray-900/40')
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <ContactStatusBadge status={contact.status} needsReply={contact.needsReply} />
        <span className="ml-auto text-xs text-gray-500">
          受付{' '}
          <time dateTime={contact.createdAt.toISOString()} title={formatDateTime(contact.createdAt)}>
            {formatRelativeTime(contact.createdAt, now)}
          </time>
        </span>
      </div>
      <h2
        className={
          'mt-2 text-lg leading-snug font-bold break-words group-hover:text-emerald-300 '
          + (contact.status === 'completed' ? 'text-gray-300' : 'text-gray-100')
        }
      >
        {/* カード全体をクリックできるよう、リンクの当たり判定をカード全体に広げる */}
        <Link
          href={`/admin/control/contact/${contact.id}`}
          className="after:absolute after:inset-0 after:rounded-lg focus:outline-none"
        >
          {contact.subject}
        </Link>
      </h2>
      <p className="mt-1 line-clamp-2 text-sm break-words text-gray-400">{contact.content}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex min-w-0 items-center gap-1 break-all">
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-gray-300">{contact.name}</span>
          <span>&lt;{contact.email}&gt;</span>
        </span>
        <span className="inline-flex items-center gap-1" title="担当者">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {contact.assignee ? contact.assignee.name : <span className="text-gray-600">未割り当て</span>}
        </span>
        <span className="inline-flex items-center gap-1" title="やり取りの数（返信と、記録した問い合わせ者からの返信）">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          <span className="tabular-nums">{contact.messageCount}</span>
        </span>
        {contact.messageCount > 0 && (
          <span>
            最終更新{' '}
            <time dateTime={contact.lastActivityAt.toISOString()} title={formatDateTime(contact.lastActivityAt)}>
              {formatRelativeTime(contact.lastActivityAt, now)}
            </time>
          </span>
        )}
      </div>
    </li>
  );
}


/**
 * 確認した日時を「3分前に」「たった今」のように表す。
 *
 * @param date - 日時
 * @param now - 基準日時
 * @returns 日時の表現（後に「確認」などを続ける）
 */
function formatCheckedAt(date: Date, now: Date): string {
  const relative = formatRelativeTime(date, now);
  return relative === 'たった今' ? relative : `${relative}に`;
}


/**
 * 自動で確認する間隔を「5秒ごと」「1分ごと」のように表す。
 *
 * @param interval - 間隔（ms）
 * @returns 間隔の表現
 */
function formatPollInterval(interval: number): string {
  return interval < 60_000 ? `${Math.round(interval / 1000)}秒ごと` : `${Math.round(interval / 60_000)}分ごと`;
}


/**
 * 受信メール（問い合わせ者からの返信）の確認状況と、今すぐ確認するボタン。
 *
 * @param properties - プロパティ
 * @returns 確認状況の要素
 */
function MailSyncStatusBar({ status, now, onSync }: {
  status: MailSyncStatus;
  now: Date;
  onSync: () => Promise<ActionResult<MailSyncResult>>;
}): JSX.Element {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ isError: boolean; text: string } | null>(null);
  // 最後の確認に失敗している場合
  const isFailing = status.lastError !== null
    && (status.lastSucceededAt === null || (status.lastFailedAt ?? 0) > status.lastSucceededAt);

  /**
   * 受信メールを確認し、一覧を読み込み直す。
   */
  async function sync(): Promise<void> {
    setIsSyncing(true);
    setMessage(null);
    try {
      const result = await onSync();
      if (result.ok) {
        setMessage({
          isError: false,
          text: result.data.imported > 0
            ? `問い合わせ者からの返信を${result.data.imported}件記録しました。`
            : '新しい返信はありませんでした。',
        });
      } else {
        setMessage({ isError: true, text: result.error });
      }
      router.refresh();
    } catch (e) {
      console.error('Failed to check mail:', e);
      setMessage({ isError: true, text: '確認に失敗しました。通信環境を確認して、再度お試しください。' });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-300">
          <MailCheck className="h-4 w-4 text-gray-400" aria-hidden />
          受信メールの確認
        </span>
        {isFailing ? (
          <span className="inline-flex min-w-0 items-start gap-1 text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {status.lastFailedAt && formatCheckedAt(status.lastFailedAt, now)}確認できませんでした: {status.lastError}
            </span>
          </span>
        ) : (
          <span className="text-gray-400">
            {status.lastSucceededAt ? (
              <time dateTime={status.lastSucceededAt.toISOString()} title={formatDateTime(status.lastSucceededAt)}>
                {formatCheckedAt(status.lastSucceededAt, now)}確認
              </time>
            ) : 'まだ確認していません'}
            {status.pollInterval > 0 ? `（${formatPollInterval(status.pollInterval)}に自動で確認）` : '（自動では確認しません）'}
          </span>
        )}
        <button
          type="button"
          onClick={() => void sync()}
          disabled={isSyncing}
          className={
            'inline-flex items-center gap-1.5 rounded border border-gray-700 px-2.5 py-1 text-gray-300 sm:ml-auto '
            + 'hover:border-gray-500 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60'
          }
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden />
          今すぐ確認
        </button>
      </div>
      {/* 確認に失敗した理由は上に表示しているため、同じ内容は繰り返さない */}
      {message && !(message.isError && message.text === status.lastError) && (
        <p
          role={message.isError ? 'alert' : 'status'}
          className={`flex items-start gap-1.5 ${message.isError ? 'text-red-300' : 'text-emerald-300'}`}
        >
          {message.isError
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <span className="min-w-0 break-words">{message.text}</span>
        </p>
      )}
    </div>
  );
}


type ContactListProperties = {
  contacts: ContactListItem[];
  /** 担当者に割り当てられる管理者 */
  staffUsers: StaffUser[];
  /** ログイン中のユーザーID（不明な場合は `null`） */
  currentUserId: number | null;
  /** 受信メールの確認状況（受信メールの設定がされていない場合は `null`） */
  mailSyncStatus: MailSyncStatus | null;
  /** URL から読み取った表示条件 */
  initialFilters: ContactListFilters;
  /** 相対時刻（「3時間前」など）の基準日時 */
  now: Date;
  /** 受信メールを今すぐ確認する */
  onSyncMail: () => Promise<ActionResult<MailSyncResult>>;
};


/**
 * お問い合わせ管理ページの一覧。キーワード・対応状況・担当者で絞り込み、並べ替えられる。
 *
 * @param properties - プロパティ
 * @returns お問い合わせの一覧
 */
export default function ContactList({
  contacts,
  staffUsers,
  currentUserId,
  mailSyncStatus,
  initialFilters,
  now,
  onSyncMail,
}: ContactListProperties): JSX.Element {
  const searchInputReference = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState(initialFilters);

  // 無効化した管理者が担当しているお問い合わせも絞り込めるよう、担当者の選択肢に含める
  const assignees = useMemo(() => {
    const map = new Map(staffUsers.map((user) => [user.id, user.name]));
    for (const contact of contacts) {
      if (contact.assignee) {
        map.set(contact.assignee.id, contact.assignee.name);
      }
    }
    return [...map].map(([id, name]) => ({ id, name }));
  }, [contacts, staffUsers]);

  const visibleContacts = useMemo(
    () => filterAndSortContacts(contacts, filters, currentUserId),
    [contacts, filters, currentUserId],
  );
  const statusCounts = useMemo(
    () => countByContactStatus(contacts, filters, currentUserId),
    [contacts, filters, currentUserId],
  );
  const needsReplyCount = useMemo(() => contacts.filter((contact) => contact.needsReply).length, [contacts]);
  const isFiltered = hasActiveFilters(filters);
  // URL で指定された担当者が存在しない場合も選択肢に表示する
  const isUnknownAssignee = /^\d+$/.test(filters.assignee)
    && !assignees.some((user) => String(user.id) === filters.assignee);

  /**
   * 表示条件を変更し、URL に反映する（再読み込みしても条件が保たれるようにする）。
   *
   * @param changes - 変更する条件
   */
  function updateFilters(changes: Partial<ContactListFilters>): void {
    const next = { ...filters, ...changes };
    setFilters(next);
    const query = toSearchParameters(next).toString();
    globalThis.history.replaceState(null, '', query ? `?${query}` : globalThis.location.pathname);
  }

  // 「/」キーで検索欄にフォーカスする
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTyping = target?.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      searchInputReference.current?.focus();
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
      <div>
        <h1 className="text-2xl">お問い合わせ管理</h1>
        <p className="mt-1 text-sm text-gray-400">
          全{contacts.length}件のお問い合わせ
          {needsReplyCount > 0 && <span className="text-sky-300">・要返信 {needsReplyCount}件</span>}
        </p>
      </div>

      {mailSyncStatus && <MailSyncStatusBar status={mailSyncStatus} now={now} onSync={onSyncMail} />}

      {contacts.length === 0 ? (
        // お問い合わせが1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-16`}>
          <Inbox className="h-10 w-10 text-gray-600" aria-hidden />
          <p className="font-medium text-gray-200">まだお問い合わせはありません</p>
          <p className="text-sm text-gray-400">お問い合わせフォームから送信されると、ここに表示されます。</p>
          <a
            href="/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"
          >
            お問い合わせフォームを開く
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </div>
      ) : (
        <>
          {/* 対応状況による絞り込み */}
          <div
            role="group"
            aria-label="対応状況で絞り込む"
            className={
              '-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 '
              + '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            }
          >
            {CONTACT_STATUS_FILTERS.map((filter) => {
              const isSelected = filters.status === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateFilters({ status: filter.value })}
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

          {/* キーワード・担当者・並び順 */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_12rem]">
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
                placeholder="名前・メールアドレス・件名・本文で検索"
                aria-label="キーワードで検索"
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 py-2 pr-16 pl-9 text-sm text-gray-200 '
                  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 '
                  + '[&::-webkit-search-cancel-button]:hidden'
                }
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {filters.query === '' ? (
                  <kbd
                    title="「/」キーで検索欄に移動"
                    className="hidden rounded border border-gray-600 px-1.5 font-mono text-xs text-gray-500 sm:inline"
                  >
                    /
                  </kbd>
                ) : (
                  <button
                    type="button"
                    aria-label="キーワードを消去"
                    onClick={() => {
                      updateFilters({ query: '' });
                      searchInputReference.current?.focus();
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:contents">
              <select
                aria-label="担当者で絞り込む"
                value={filters.assignee}
                onChange={(event) => updateFilters({ assignee: event.target.value })}
                className={SELECT_CLASS_NAME}
              >
                <option value="">すべての担当者</option>
                {currentUserId !== null && <option value={ASSIGNEE_FILTER_ME}>自分の担当</option>}
                <option value={ASSIGNEE_FILTER_NONE}>未割り当て</option>
                {isUnknownAssignee && <option value={filters.assignee}>不明なユーザー</option>}
                {assignees.map((user) => (
                  <option key={user.id} value={String(user.id)}>{user.name}</option>
                ))}
              </select>
              <select
                aria-label="並び順"
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value as ContactSortOrder })}
                className={SELECT_CLASS_NAME}
              >
                {CONTACT_SORT_ORDERS.map((order) => (
                  <option key={order.value} value={order.value}>{order.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 件数 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered
                ? `${contacts.length}件中 ${visibleContacts.length}件を表示`
                : `${visibleContacts.length}件`}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => updateFilters({ ...DEFAULT_CONTACT_FILTERS, sort: filters.sort })}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                条件をクリア
              </button>
            )}
          </div>

          {visibleContacts.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {visibleContacts.map((contact) => (
                <ContactCard key={contact.id} contact={contact} now={now} />
              ))}
            </ul>
          ) : (
            // 条件に一致するお問い合わせがない場合
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致するお問い合わせはありません</p>
              <button
                type="button"
                onClick={() => updateFilters({ ...DEFAULT_CONTACT_FILTERS, sort: filters.sort })}
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
