import { EditorSelection } from '@codemirror/state';

import { escapeMarkdownAlt } from '@/lib/images';

import type { EditorView } from '@codemirror/view';


/**
 * アップロード中の画像の目印を識別するための連番。
 */
let placeholderSequence = 0;


/**
 * アップロード中の画像の位置に挿入しておく目印を生成する。アップロードが終わったら、画像の Markdown に置き換える。
 *
 * 本文の中から探し出せるよう、目印ごとに異なる文字列にする（リンク先は読み込まれないスキーム）。
 *
 * @param fileName - アップロードするファイルの名前
 * @returns 目印の文字列
 */
export function createUploadPlaceholder(fileName: string): string {
  placeholderSequence++;
  const token = `${Date.now().toString(36)}-${placeholderSequence}`;
  return `![${escapeMarkdownAlt(fileName)} をアップロード中…](uploading:${token})`;
}


/**
 * 画像の Markdown（またはアップロード中の画像の目印）を、1行に1つずつ挿入する。
 *
 * 画像が独立した行になるよう、必要に応じて前後に改行を入れる。カーソルは挿入した最後の画像の後ろに移動させる。
 *
 * @param view - エディタ
 * @param lines - 挿入する画像の Markdown
 * @param position - 挿入する位置（指定しない場合は、選択範囲を置き換える）
 */
export function insertImageLines(view: EditorView, lines: readonly string[], position?: number): void {
  const { state } = view;
  const { from, to } = position === undefined ? state.selection.main : EditorSelection.cursor(position);
  const prefix = from > 0 && state.sliceDoc(from - 1, from) !== '\n' ? '\n' : '';
  const suffix = to < state.doc.length && state.sliceDoc(to, to + 1) !== '\n' ? '\n' : '';
  const insert = `${prefix}${lines.join('\n')}${suffix}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length - suffix.length),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
}


/**
 * アップロード中の画像の目印を置き換える。
 *
 * 削除する場合（`replacement` が空の場合）、目印だけの行は行ごと削除する。
 *
 * @param view - エディタ
 * @param placeholder - 目印
 * @param replacement - 置き換える文字列
 * @returns 置き換えた場合は `true`。目印が見つからない場合（編集で削除された場合など）は `false`
 */
export function replaceUploadPlaceholder(view: EditorView, placeholder: string, replacement: string): boolean {
  const { doc } = view.state;
  const from = doc.toString().indexOf(placeholder);
  if (from === -1) {
    return false;
  }
  let to = from + placeholder.length;
  let start = from;
  const line = doc.lineAt(from);
  if (replacement === '' && line.from === from && line.to === to) {
    // 次の行があれば次の行の改行まで、最後の行であれば前の行の改行から削除する
    if (line.number < doc.lines) {
      to++;
    } else if (line.number > 1) {
      start--;
    }
  }
  view.dispatch({ changes: { from: start, to, insert: replacement }, userEvent: 'input' });
  return true;
}
