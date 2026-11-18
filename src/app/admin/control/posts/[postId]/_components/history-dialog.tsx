'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CircleAlert, Eye, EyeOff, FileText, GitCompareArrows, History, Info, LoaderCircle, RotateCw, X,
} from 'lucide-react';
import ReactModal from 'react-modal';

import { FieldDiff, LineChangeStats, TextDiff } from '@/components/elements/text-diff';
import { countLineChanges, diffLines } from '@/lib/diff';
import { findDisplayedVersion, getVersionLabel, isPublicVersion, isPublishedVersion } from '@/lib/post-versions';

import MarkdownPreview from './markdown-preview';
import { formatDateTime } from '../../_lib/date-format';

import type { JSX, ReactNode } from 'react';
import type { PostVersion } from '@/lib/post-versions';
import type { ActionResult } from '@/types';


/**
 * バッジの共通クラス。
 */
const BADGE_CLASS_NAME = 'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] '
  + 'leading-none whitespace-nowrap';


/**
 * 表示の切り替えタブの共通クラス。
 */
const TAB_CLASS_NAME = 'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors '
  + 'disabled:cursor-not-allowed disabled:text-gray-600';


/**
 * 表示の切り替えタブの、選択中・未選択の配色。
 */
const TAB_STATE_CLASS_NAMES = {
  active: 'border-emerald-400 text-emerald-300',
  inactive: 'border-transparent text-gray-400 enabled:hover:text-gray-200',
} as const;


/**
 * 版の状態を表すバッジを返す。
 *
 * @param version - 版
 * @param displayedIdentifier - 公開ページに表示されている版の識別子
 * @returns バッジ
 */
function VersionBadges({
  version,
  displayedIdentifier,
}: {
  version: PostVersion;
  displayedIdentifier: number | undefined;
}): JSX.Element {
  return (
    <span className="flex flex-wrap gap-1">
      {!isPublishedVersion(version) && (
        <span className={`${BADGE_CLASS_NAME} border-gray-500 text-gray-300`}>未公開</span>
      )}
      {version.identifier === displayedIdentifier && (
        <span className={`${BADGE_CLASS_NAME} border-emerald-500/60 text-emerald-300`} title="公開ページに表示されている版">
          表示中
        </span>
      )}
      {isPublishedVersion(version) && version.isPrivate && (
        <span className={`${BADGE_CLASS_NAME} border-red-500/60 text-red-300`}>
          <EyeOff className="h-3 w-3" aria-hidden />
          非公開
        </span>
      )}
    </span>
  );
}


/**
 * 版の日時の表示を返す。
 *
 * @param version - 版
 * @returns 日時の表示（例: `2026/11/18 14:05 公開`）
 */
function formatVersionDate(version: PostVersion): string {
  return version.publishedAt
    ? `${formatDateTime(version.publishedAt)} 公開`
    : `${formatDateTime(version.updatedAt)} 保存`;
}


/**
 * 補足の表示。
 *
 * @param properties - プロパティ
 * @returns 補足の要素
 */
function Note({ tone, children }: { tone: 'info' | 'warning'; children: ReactNode }): JSX.Element {
  return (
    <p
      className={
        'flex gap-2 rounded border px-3 py-2 text-xs '
        + (tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          : 'border-gray-600 bg-gray-900/60 text-gray-300')
      }
    >
      {tone === 'warning'
        ? <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
        : <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}


type HistoryDialogProperties = {
  onRequestClose: () => void;
  /** 著者の表示名（プレビューに使用する） */
  author: string;
  /** 記事全体が非公開に設定されているかどうか（保存済みの設定） */
  isPostPrivate: boolean;
  /** エディタに保存されていない変更があるかどうか */
  hasUnsavedChanges: boolean;
  /** すべての版を読み込む */
  onLoad: () => Promise<ActionResult<PostVersion[]>>;
  /** 版の非公開設定を変更し、変更後のすべての版を返す */
  onSetPrivate: (identifier: number, isPrivate: boolean) => Promise<ActionResult<PostVersion[]>>;
};


/**
 * 記事の編集履歴の画面。版ごとの本文と前の版からの変更点を確認でき、公開済みの版を個別に非公開にできる。
 *
 * 開いたときに最新の履歴を読み込むため、表示するときにのみ描画すること。
 *
 * @param properties - プロパティ
 * @returns 編集履歴の画面
 */
export default function HistoryDialog({
  onRequestClose,
  author,
  isPostPrivate,
  hasUnsavedChanges,
  onLoad,
  onSetPrivate,
}: HistoryDialogProperties): JSX.Element {
  const [versions, setVersions] = useState<PostVersion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [selectedIdentifier, setSelectedIdentifier] = useState<number | null>(null);
  const [view, setView] = useState<'content' | 'diff'>('content');
  const [isUpdating, setIsUpdating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 開いたとき（と再読み込み時）に、最新の履歴を読み込む
  useEffect(() => {
    let isCancelled = false;
    setLoadError(null);
    onLoad()
      .then((result) => {
        if (isCancelled) {
          return;
        }
        if (result.ok) {
          setVersions(result.data);
          setSelectedIdentifier((previous) => (
            result.data.some((version) => version.identifier === previous)
              ? previous
              : (result.data.at(-1)?.identifier ?? null)
          ));
        } else {
          setLoadError(result.error);
        }
      })
      .catch((e: unknown) => {
        console.error('Failed to load post history:', e);
        if (!isCancelled) {
          setLoadError('編集履歴を読み込めませんでした。通信状況を確認してください。');
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [onLoad, reloadCount]);

  // 公開ページに表示される版（記事全体が非公開の場合は、非公開を解除したときに表示される版）
  const latestPublic = versions ? findDisplayedVersion(versions) : undefined;
  const displayedIdentifier = isPostPrivate ? undefined : latestPublic?.identifier;
  const selectedIndex = versions?.findIndex((version) => version.identifier === selectedIdentifier) ?? -1;
  const selected = versions && selectedIndex !== -1 ? versions[selectedIndex] : undefined;
  const previous = versions && selectedIndex > 0 ? versions[selectedIndex - 1] : undefined;
  const firstPublishedAt = versions?.find((version) => version.publishedAt !== null)?.publishedAt ?? null;
  const publicVersions = versions?.filter((version) => isPublicVersion(version)) ?? [];
  const isDiffView = view === 'diff' && previous !== undefined;

  const stats = useMemo(
    () => (selected && previous ? countLineChanges(diffLines(previous.content, selected.content)) : null),
    [selected, previous],
  );

  /**
   * 選択中の版の非公開設定を切り替える。
   */
  async function togglePrivate(): Promise<void> {
    if (!selected || !isPublishedVersion(selected) || isUpdating) {
      return;
    }
    const nextIsPrivate = !selected.isPrivate;
    setIsUpdating(true);
    setFeedback(null);
    try {
      const result = await onSetPrivate(selected.identifier, nextIsPrivate);
      if (result.ok) {
        setVersions(result.data);
        setFeedback({
          type: 'success',
          message: `${getVersionLabel(selected)}を${nextIsPrivate ? '非公開にしました' : '公開に戻しました'}。`,
        });
      } else {
        setFeedback({ type: 'error', message: result.error });
        // 別の画面で変更されていた可能性があるため、最新の状態を読み込み直す
        setReloadCount((count) => count + 1);
      }
    } catch (e) {
      console.error('Failed to change version visibility:', e);
      setFeedback({ type: 'error', message: '公開設定を変更できませんでした。通信状況を確認してください。' });
    } finally {
      setIsUpdating(false);
    }
  }

  /**
   * 表示する版を選択する。
   *
   * @param identifier - 版の識別子
   */
  function selectVersion(identifier: number): void {
    setSelectedIdentifier(identifier);
    setFeedback(null);
  }

  /**
   * 選択中の版の公開設定についての説明と操作を返す。
   *
   * @returns 説明と操作の要素
   */
  function renderVisibilityControl(): JSX.Element | null {
    if (!selected) {
      return null;
    }
    if (!isPublishedVersion(selected)) {
      return (
        <Note tone="info">
          まだ公開されていない版（下書き）です。公開すると新しい版として履歴に追加されます。
          {hasUnsavedChanges && 'エディタの保存されていない変更は含まれていません。'}
        </Note>
      );
    }
    const isOnlyPublicVersion = !selected.isPrivate && publicVersions.length === 1;
    const fallback = !isPostPrivate && selected.identifier === latestPublic?.identifier
      ? publicVersions.at(-2)
      : undefined;
    const willBeDisplayed = !isPostPrivate && selected.isPrivate
      && (!latestPublic || selected.identifier > latestPublic.identifier);
    let note: JSX.Element | null = null;
    if (isOnlyPublicVersion) {
      note = (
        <Note tone="info">
          公開中の版がこの版だけのため、非公開にできません。記事全体を非公開にする場合は、編集画面の「非公開にする」を設定して保存してください。
        </Note>
      );
    } else if (fallback) {
      note = (
        <Note tone="warning">
          現在、公開ページにはこの版が表示されています。非公開にすると、{getVersionLabel(fallback)}の内容が表示されます。
        </Note>
      );
    } else if (willBeDisplayed) {
      note = <Note tone="warning">公開に戻すと、公開ページにはこの版の内容が表示されます。</Note>;
    } else if (selected.isPrivate) {
      note = <Note tone="info">この版は非公開のため、公開ページの編集履歴には表示されません。</Note>;
    }
    return (
      <div className="flex flex-col gap-2">
        {note}
        <div>
          <button
            type="button"
            onClick={togglePrivate}
            disabled={isUpdating || isOnlyPublicVersion}
            className={
              'inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition-colors '
              + 'disabled:cursor-not-allowed disabled:opacity-50 '
              + (selected.isPrivate
                ? 'border-emerald-500/60 text-emerald-300 enabled:hover:bg-emerald-500/10'
                : 'border-red-500/60 text-red-300 enabled:hover:bg-red-500/10')
            }
          >
            {isUpdating && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {!isUpdating && (selected.isPrivate
              ? <Eye className="h-4 w-4" aria-hidden />
              : <EyeOff className="h-4 w-4" aria-hidden />)}
            {selected.isPrivate ? 'この版を公開に戻す' : 'この版を非公開にする'}
          </button>
        </div>
      </div>
    );
  }

  let body: JSX.Element;
  if (loadError) {
    body = (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <CircleAlert className="h-8 w-8 text-red-400" aria-hidden />
        <p className="text-red-200">{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadCount((count) => count + 1)}
          className="inline-flex items-center gap-1.5 rounded border border-gray-600 px-3 py-1.5 hover:bg-gray-700"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          再読み込み
        </button>
      </div>
    );
  } else if (!versions) {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        読み込んでいます…
      </div>
    );
  } else {
    const newestFirst = versions.toReversed();
    body = (
      <div
        className={
          'grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[17rem_minmax(0,1fr)] md:grid-rows-1'
        }
      >
        {/* 版の一覧（狭い画面ではセレクトボックス） */}
        <div className="border-b border-gray-700 p-3 md:hidden">
          <select
            aria-label="表示する版"
            value={selectedIdentifier ?? ''}
            onChange={(event) => selectVersion(Number(event.target.value))}
            className={
              'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
              + 'focus:outline-none focus:ring-2 focus:ring-emerald-500'
            }
          >
            {newestFirst.map((version) => (
              <option key={version.identifier} value={version.identifier}>
                {getVersionLabel(version)}（{formatVersionDate(version)}）
                {version.identifier === displayedIdentifier ? '・表示中' : ''}
                {isPublishedVersion(version) && version.isPrivate ? '・非公開' : ''}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="版の一覧" className="hidden min-h-0 overflow-y-auto border-r border-gray-700 md:block">
          <ul className="flex flex-col gap-1 p-2">
            {newestFirst.map((version) => {
              const isSelected = version.identifier === selectedIdentifier;
              return (
                <li key={version.identifier}>
                  <button
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => selectVersion(version.identifier)}
                    className={
                      'flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors '
                      + (isSelected
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-transparent hover:bg-gray-700/50')
                      + (isPublishedVersion(version) && version.isPrivate ? ' opacity-70' : '')
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-100">{getVersionLabel(version)}</span>
                      <VersionBadges version={version} displayedIdentifier={displayedIdentifier} />
                    </span>
                    <span className="truncate text-xs text-gray-300">{version.title}</span>
                    <span className="text-xs text-gray-500">{formatVersionDate(version)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 選択中の版 */}
        {selected ? (
          <section aria-label={getVersionLabel(selected)} className="flex min-h-0 flex-col">
            <div className="flex flex-col gap-3 border-b border-gray-700 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold">{getVersionLabel(selected)}</h3>
                <VersionBadges version={selected} displayedIdentifier={displayedIdentifier} />
                <span className="text-sm text-gray-400">{formatVersionDate(selected)}</span>
              </div>
              {renderVisibilityControl()}
              {feedback && (
                <p
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  className={`text-sm ${feedback.type === 'error' ? 'text-red-300' : 'text-emerald-300'}`}
                >
                  {feedback.message}
                </p>
              )}
            </div>
            <div role="tablist" aria-label="表示の切り替え" className="flex border-b border-gray-700 px-2">
              <button
                type="button"
                role="tab"
                aria-selected={!isDiffView}
                onClick={() => setView('content')}
                className={`${TAB_CLASS_NAME} ${TAB_STATE_CLASS_NAMES[isDiffView ? 'inactive' : 'active']}`}
              >
                <FileText className="h-4 w-4" aria-hidden />
                本文
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isDiffView}
                disabled={!previous}
                title={previous ? undefined : '最初の版のため、変更点はありません'}
                onClick={() => setView('diff')}
                className={`${TAB_CLASS_NAME} ${TAB_STATE_CLASS_NAMES[isDiffView ? 'active' : 'inactive']}`}
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                変更点
                {stats && <LineChangeStats added={stats.added} removed={stats.removed} />}
              </button>
            </div>
            {isDiffView && previous ? (
              <div role="tabpanel" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <p className="text-sm text-gray-400">
                  {getVersionLabel(previous)}（{formatVersionDate(previous)}）からの変更点
                  {isPublishedVersion(previous) && previous.isPrivate && '（非公開の版）'}
                </p>
                <FieldDiff label="タイトル" oldValue={previous.title} newValue={selected.title} />
                <FieldDiff label="説明" oldValue={previous.description} newValue={selected.description} />
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-gray-400">本文</p>
                  <TextDiff oldText={previous.content} newText={selected.content} />
                </div>
              </div>
            ) : (
              <MarkdownPreview
                key={selected.identifier}
                title={selected.title}
                author={author}
                publishedAt={firstPublishedAt}
                tags={[]}
                content={selected.content}
                isActive
                className="min-h-0 flex-1 overflow-y-auto"
              />
            )}
          </section>
        ) : (
          <p className="p-6 text-sm text-gray-400">版を選択してください。</p>
        )}
      </div>
    );
  }

  return (
    <ReactModal
      isOpen={true}
      onRequestClose={onRequestClose}
      contentLabel="編集履歴"
      className={
        'fixed inset-2 flex flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg outline-none '
        + 'sm:inset-6 lg:inset-x-12 lg:inset-y-10'
      }
      overlayClassName="fixed inset-0 z-[100] bg-[rgba(55,65,81,0.8)]"
      ariaHideApp={false}
    >
      <div className="flex items-start gap-3 border-b border-gray-700 px-4 py-3">
        <History className="mt-1 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">編集履歴</h2>
          <p className="text-xs text-gray-400">
            公開した版ごとの内容を確認できます。非公開にした版は、公開ページの編集履歴に表示されなくなります。
            {isPostPrivate && '（記事全体が非公開に設定されているため、現在はどの版もサイトに表示されません）'}
          </p>
        </div>
        <button
          type="button"
          aria-label="編集履歴を閉じる"
          onClick={onRequestClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {body}
    </ReactModal>
  );
}
