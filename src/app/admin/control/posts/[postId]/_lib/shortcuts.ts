import { useSyncExternalStore } from 'react';


/**
 * キーボードショートカットのキー（CodeMirror のキー表記）。
 *
 * `Mod` は macOS では Command キー、それ以外では Ctrl キーを表す。
 */
export const SHORTCUT_KEYS = {
  save: 'Mod-s',
  bold: 'Mod-b',
  italic: 'Mod-i',
  strikethrough: 'Mod-Shift-x',
  inlineCode: 'Mod-e',
  link: 'Mod-k',
  undo: 'Mod-z',
  redo: 'Mod-Shift-z',
  search: 'Mod-f',
  gotoLine: 'Mod-Alt-g',
  selectNextOccurrence: 'Mod-d',
  indent: 'Tab',
  outdent: 'Shift-Tab',
  exitFullscreen: 'Escape',
} as const;


/**
 * ショートカット一覧に表示する項目。
 */
export const SHORTCUT_HELP_ITEMS: readonly { key: string; description: string }[] = [
  { key: SHORTCUT_KEYS.save, description: '保存' },
  { key: SHORTCUT_KEYS.bold, description: '太字' },
  { key: SHORTCUT_KEYS.italic, description: '斜体' },
  { key: SHORTCUT_KEYS.strikethrough, description: '取り消し線' },
  { key: SHORTCUT_KEYS.inlineCode, description: 'インラインコード' },
  { key: SHORTCUT_KEYS.link, description: 'リンク' },
  { key: SHORTCUT_KEYS.undo, description: '元に戻す' },
  { key: SHORTCUT_KEYS.redo, description: 'やり直す' },
  { key: SHORTCUT_KEYS.search, description: '検索・置換' },
  { key: SHORTCUT_KEYS.gotoLine, description: '指定した行へ移動' },
  { key: SHORTCUT_KEYS.selectNextOccurrence, description: '同じ文字列を追加で選択' },
  { key: SHORTCUT_KEYS.indent, description: 'インデント（リストの入れ子）' },
  { key: SHORTCUT_KEYS.outdent, description: 'インデント解除' },
  { key: SHORTCUT_KEYS.exitFullscreen, description: '全画面表示を終了' },
];


/**
 * Markdown の主な書き方。
 */
export const MARKDOWN_SYNTAX_ITEMS: readonly { syntax: string; description: string }[] = [
  { syntax: '## 見出し', description: '見出し（## 〜 ######）' },
  { syntax: '**太字**', description: '太字' },
  { syntax: '*斜体*', description: '斜体' },
  { syntax: '~~取り消し線~~', description: '取り消し線' },
  { syntax: '`コード`', description: 'インラインコード' },
  { syntax: '[テキスト](URL)', description: 'リンク' },
  { syntax: '![説明](URL)', description: '画像' },
  { syntax: '- 項目', description: '箇条書き' },
  { syntax: '1. 項目', description: '番号付きリスト' },
  { syntax: '> 引用', description: '引用' },
  { syntax: '```言語名', description: 'コードブロック（``` で閉じる）' },
  { syntax: '---', description: '区切り線（前に空行が必要）' },
];


/**
 * キー操作以外の編集機能の説明。
 */
export const EDITING_TIPS: readonly string[] = [
  'リスト・引用の行で Enter を押すと、次の行にも記号が自動で入力されます。',
  'テキストを選択した状態で URL を貼り付けると、リンクになります。',
  '「画像を挿入」ボタンで、アップロード済みの画像から選んで挿入できます（新しい画像のアップロードも可能）。'
    + '画像はエディタへの貼り付けやドラッグ＆ドロップでもアップロードできます。',
  '表計算ソフトからコピーした表（タブ区切り）を選択して「表」ボタンを押すと、Markdown の表に変換されます。',
  'プレビューをダブルクリックすると、エディタの該当箇所へ移動します。',
  '編集内容はブラウザに一時保存され、保存前にページを閉じても次回開いたときに復元できます。',
];


/**
 * ショートカットのキー表記を、表示用の文字列に変換する。
 *
 * @param key - CodeMirror のキー表記（例: `Mod-Shift-x`）
 * @param isApple - Apple 製品の OS かどうか
 * @returns 表示用の文字列（例: `Ctrl+Shift+X`、`⌘⇧X`）
 */
export function formatShortcut(key: string, isApple: boolean): string {
  return key
    .split('-')
    .map((part) => {
      switch (part) {
        case 'Mod': {
          return isApple ? '⌘' : 'Ctrl';
        }
        case 'Alt': {
          return isApple ? '⌥' : 'Alt';
        }
        case 'Shift': {
          return isApple ? '⇧' : 'Shift';
        }
        case 'Escape': {
          return 'Esc';
        }
        default: {
          return part.length === 1 ? part.toUpperCase() : part;
        }
      }
    })
    .join(isApple ? '' : '+');
}


/**
 * 何もしない関数。
 */
const noop = (): void => {};


/**
 * 外部ストアの購読関数（プラットフォームは変化しないため何もしない）。
 *
 * @returns 購読解除関数
 */
const subscribeNothing = (): (() => void) => noop;


/**
 * Apple 製品の OS（macOS・iOS）で表示しているかどうかを返す。
 *
 * サーバーでのレンダリング時は `false` を返す。
 *
 * @returns Apple 製品の OS の場合は `true`
 */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
}
