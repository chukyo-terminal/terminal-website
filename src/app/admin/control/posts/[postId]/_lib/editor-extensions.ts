import { HighlightStyle } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';


/**
 * 選択範囲の背景に対応するセレクタ。
 */
const SELECTION_SELECTOR = [
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground',
  '.cm-selectionBackground',
  '.cm-content ::selection',
].join(', ');


/**
 * サイトの配色（ダークテーマ・エメラルド）に合わせたエディタのテーマ。
 */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: '#e5e7eb',
    fontSize: '15px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Noto Sans Mono CJK JP", monospace',
    lineHeight: '1.75',
  },
  '.cm-content': {
    caretColor: '#34d399',
    padding: '16px 0',
  },
  '.cm-line': {
    padding: '0 16px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#34d399',
    borderLeftWidth: '2px',
  },
  [SELECTION_SELECTOR]: {
    backgroundColor: 'rgba(52, 211, 153, 0.25)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(55, 65, 81, 0.3)',
  },
  '.cm-gutters': {
    backgroundColor: '#111827',
    color: '#4b5563',
    border: 'none',
    borderRight: '1px solid #1f2937',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(55, 65, 81, 0.3)',
    color: '#d1d5db',
  },
  '.cm-placeholder': {
    color: '#6b7280',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    outline: '1px solid rgba(250, 204, 21, 0.5)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(250, 204, 21, 0.45)',
  },
  '.cm-specialChar': {
    color: '#f87171',
  },
  // 検索パネル（Tailwind のリセット CSS によって標準の見た目が失われるため、ここで指定する）
  '.cm-panels': {
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #374151',
  },
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 36px 8px 12px',
    fontSize: '13px',
  },
  '.cm-panel.cm-search br': {
    flexBasis: '100%',
    height: 0,
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#d1d5db',
  },
  '.cm-panel.cm-search [name=close]': {
    top: '6px',
    right: '8px',
    color: '#9ca3af',
    fontSize: '18px',
    cursor: 'pointer',
  },
  '.cm-textfield': {
    margin: 0,
    padding: '3px 8px',
    border: '1px solid #4b5563',
    borderRadius: '4px',
    backgroundColor: '#111827',
    color: '#e5e7eb',
  },
  '.cm-textfield:focus': {
    outline: '2px solid rgba(52, 211, 153, 0.6)',
    outlineOffset: '-1px',
  },
  '.cm-button': {
    margin: 0,
    padding: '3px 10px',
    border: '1px solid #4b5563',
    borderRadius: '4px',
    backgroundImage: 'none',
    backgroundColor: '#374151',
    color: '#e5e7eb',
    cursor: 'pointer',
  },
  '.cm-button:hover': {
    backgroundColor: '#4b5563',
  },
}, { dark: true });


/**
 * Markdown のシンタックスハイライト。
 */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: '#34d399', fontWeight: 'bold', fontSize: '1.15em' },
  {
    tag: [tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: '#34d399',
    fontWeight: 'bold',
  },
  { tag: tags.strong, color: '#f9fafb', fontWeight: 'bold' },
  { tag: tags.emphasis, color: '#f3f4f6', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#9ca3af', textDecoration: 'line-through' },
  { tag: tags.link, color: '#6ee7b7' },
  { tag: tags.url, color: '#60a5fa', textDecoration: 'underline' },
  { tag: tags.monospace, color: '#fcd34d' },
  { tag: tags.quote, color: '#9ca3af' },
  { tag: tags.processingInstruction, color: '#6b7280' },
  { tag: tags.labelName, color: '#c4b5fd' },
  { tag: tags.contentSeparator, color: '#6b7280' },
  { tag: tags.escape, color: '#f472b6' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: [tags.angleBracket, tags.tagName], color: '#f472b6' },
  { tag: tags.attributeName, color: '#fca5a5' },
  { tag: tags.attributeValue, color: '#86efac' },
]);


/**
 * エディタ（主に検索パネル）の表示文言の日本語訳。
 */
export const japanesePhrases = EditorState.phrases.of({
  'Find': '検索',
  'Replace': '置換',
  'next': '次へ',
  'previous': '前へ',
  'all': 'すべて選択',
  'match case': '大文字と小文字を区別',
  'regexp': '正規表現',
  'by word': '単語単位',
  'replace': '置換',
  'replace all': 'すべて置換',
  'close': '閉じる',
  'current match': '現在の一致',
  'on line': '行目',
  'replaced $ matches': '$ 件を置換しました',
  'replaced match on line $': '$ 行目の一致を置換しました',
  'Go to line': '移動先の行',
  'go': '移動',
});
