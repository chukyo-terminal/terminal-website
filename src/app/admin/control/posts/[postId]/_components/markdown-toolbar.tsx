'use client';

import { Fragment } from 'react';

import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import {
  ArrowDownUp, Bold, Code, Columns2, Eye, Heading2, Heading3, ImageIcon, ImagePlus, Italic, Keyboard, LinkIcon, List,
  ListOrdered, Maximize2, Minimize2, Minus, PenLine, Redo2, Search, SquareCode, Strikethrough, Table, TextQuote, Undo2,
} from 'lucide-react';

import {
  insertCodeBlock, insertHorizontalRule, insertImage, insertLink, insertTable, toggleBlockquote, toggleBold,
  toggleHeading, toggleInlineCode, toggleItalic, toggleList, toggleStrikethrough,
} from '../_lib/markdown-commands';
import { SHORTCUT_KEYS, formatShortcut, useIsApplePlatform } from '../_lib/shortcuts';

import type { LucideIcon } from 'lucide-react';
import type { JSX } from 'react';
import type { MarkdownCommand } from '../_lib/markdown-commands';


/**
 * 表示モード（`edit`: エディタのみ、`split`: エディタとプレビューを並べて表示、`preview`: プレビューのみ）。
 */
export type ViewMode = 'edit' | 'split' | 'preview';


/**
 * エディタの編集コマンド以外の、ツールバーの操作。
 */
type ToolbarAction = 'insertImage';


/**
 * ツールバーの編集ボタン（`command` を実行するか、`action` を親に通知する）。
 */
type CommandItem = {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
} & ({ command: MarkdownCommand } | { action: ToolbarAction });


/**
 * 編集ボタン（グループごとに区切り線で区切って表示する）。
 */
const COMMAND_GROUPS: readonly (readonly CommandItem[])[] = [
  [
    { label: '見出し2', icon: Heading2, command: toggleHeading(2) },
    { label: '見出し3', icon: Heading3, command: toggleHeading(3) },
  ],
  [
    { label: '太字', icon: Bold, command: toggleBold, shortcut: SHORTCUT_KEYS.bold },
    { label: '斜体', icon: Italic, command: toggleItalic, shortcut: SHORTCUT_KEYS.italic },
    { label: '取り消し線', icon: Strikethrough, command: toggleStrikethrough, shortcut: SHORTCUT_KEYS.strikethrough },
    { label: 'インラインコード', icon: Code, command: toggleInlineCode, shortcut: SHORTCUT_KEYS.inlineCode },
  ],
  [
    { label: 'リンク', icon: LinkIcon, command: insertLink, shortcut: SHORTCUT_KEYS.link },
    { label: '画像を挿入（アップロード済みの画像から選択・アップロード）', icon: ImagePlus, action: 'insertImage' },
    { label: '画像（URL を指定）', icon: ImageIcon, command: insertImage },
  ],
  [
    { label: '箇条書き', icon: List, command: toggleList('bullet') },
    { label: '番号付きリスト', icon: ListOrdered, command: toggleList('ordered') },
    { label: '引用', icon: TextQuote, command: toggleBlockquote },
  ],
  [
    { label: 'コードブロック', icon: SquareCode, command: insertCodeBlock },
    { label: '表', icon: Table, command: insertTable },
    { label: '区切り線', icon: Minus, command: insertHorizontalRule },
  ],
  [
    { label: '元に戻す', icon: Undo2, command: (view) => undo(view), shortcut: SHORTCUT_KEYS.undo },
    { label: 'やり直す', icon: Redo2, command: (view) => redo(view), shortcut: SHORTCUT_KEYS.redo },
    { label: '検索・置換', icon: Search, command: (view) => openSearchPanel(view), shortcut: SHORTCUT_KEYS.search },
  ],
];


/**
 * 表示モードの切り替えボタン。
 */
const VIEW_MODE_ITEMS: readonly { mode: ViewMode; label: string; icon: LucideIcon; displayClassName: string }[] = [
  { mode: 'edit', label: 'エディタのみ表示', icon: PenLine, displayClassName: 'inline-flex' },
  // 画面幅が狭い場合は並べて表示できないため、ボタンを表示しない
  { mode: 'split', label: 'エディタとプレビューを並べて表示', icon: Columns2, displayClassName: 'hidden md:inline-flex' },
  { mode: 'preview', label: 'プレビューのみ表示', icon: Eye, displayClassName: 'inline-flex' },
];


/**
 * ツールバーのボタン。
 *
 * @param properties - プロパティ
 * @returns ボタン
 */
function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  isPressed,
  displayClassName = 'inline-flex',
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** 切り替えボタンの場合の状態 */
  isPressed?: boolean;
  /** 表示方法（`display`）を指定するクラス */
  displayClassName?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isPressed}
      disabled={disabled}
      // エディタのフォーカスと選択範囲を維持するため、クリックでフォーカスを移さない
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={
        `${displayClassName} h-8 w-8 shrink-0 items-center justify-center rounded transition-colors `
        + 'disabled:cursor-not-allowed disabled:opacity-40 '
        + (isPressed
          ? 'bg-emerald-500/20 text-emerald-300'
          : 'text-gray-300 enabled:hover:bg-gray-700 enabled:hover:text-white')
      }
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}


type MarkdownToolbarProperties = {
  /** 編集コマンドを実行する */
  onCommand: (command: MarkdownCommand) => void;
  /** 画像を挿入するダイアログを開く */
  onInsertImage: () => void;
  /** 編集ボタンを無効にするかどうか */
  isCommandDisabled: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isScrollSyncEnabled: boolean;
  onScrollSyncChange: (isEnabled: boolean) => void;
  isFullscreen: boolean;
  onFullscreenChange: (isFullscreen: boolean) => void;
  onShowHelp: () => void;
};


/**
 * Markdown エディタのツールバー。
 *
 * @param properties - プロパティ
 * @returns ツールバー
 */
export default function MarkdownToolbar({
  onCommand,
  onInsertImage,
  isCommandDisabled,
  viewMode,
  onViewModeChange,
  isScrollSyncEnabled,
  onScrollSyncChange,
  isFullscreen,
  onFullscreenChange,
  onShowHelp,
}: MarkdownToolbarProperties): JSX.Element {
  const isApple = useIsApplePlatform();

  return (
    <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800/60 px-2 py-1">
      {/* 画面幅が狭い場合は横にスクロールできる（スクロールバーは表示しない） */}
      <div
        role="toolbar"
        aria-label="書式"
        className={
          'flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto '
          + '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        {COMMAND_GROUPS.map((group, index) => (
          <Fragment key={group[0].label}>
            {index > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-gray-700" aria-hidden />}
            {group.map((item) => (
              <ToolbarButton
                key={item.label}
                label={item.shortcut ? `${item.label}（${formatShortcut(item.shortcut, isApple)}）` : item.label}
                icon={item.icon}
                disabled={isCommandDisabled}
                onClick={() => {
                  if ('command' in item) {
                    onCommand(item.command);
                  } else if (item.action === 'insertImage') {
                    onInsertImage();
                  }
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div role="group" aria-label="表示モード" className="flex gap-0.5 rounded-md bg-gray-900/60 p-0.5">
          {VIEW_MODE_ITEMS.map((item) => (
            <ToolbarButton
              key={item.mode}
              label={item.label}
              icon={item.icon}
              isPressed={viewMode === item.mode}
              displayClassName={item.displayClassName}
              onClick={() => onViewModeChange(item.mode)}
            />
          ))}
        </div>
        <ToolbarButton
          label="エディタとプレビューのスクロールを同期"
          icon={ArrowDownUp}
          isPressed={isScrollSyncEnabled}
          disabled={viewMode !== 'split'}
          displayClassName="hidden md:inline-flex"
          onClick={() => onScrollSyncChange(!isScrollSyncEnabled)}
        />
        <ToolbarButton
          label={isFullscreen ? `全画面表示を終了（${formatShortcut(SHORTCUT_KEYS.exitFullscreen, isApple)}）` : '全画面表示'}
          icon={isFullscreen ? Minimize2 : Maximize2}
          onClick={() => onFullscreenChange(!isFullscreen)}
        />
        <ToolbarButton label="ショートカット・使い方" icon={Keyboard} onClick={onShowHelp} />
      </div>
    </div>
  );
}
