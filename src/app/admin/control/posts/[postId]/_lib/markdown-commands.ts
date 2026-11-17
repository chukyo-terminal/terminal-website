import { EditorSelection } from '@codemirror/state';

import { SHORTCUT_KEYS } from './shortcuts';

import type { ChangeSpec, EditorState, Line } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';


/**
 * エディタに対して実行する編集コマンド。
 */
export type MarkdownCommand = (view: EditorView) => boolean;


/* ---------------------------------------------------------------------------------------------------------------------
 * インライン装飾
 * ------------------------------------------------------------------------------------------------------------------ */

/**
 * ドキュメントの指定位置から前方または後方に連続する文字の数を数える。
 *
 * @param state - エディタの状態
 * @param position - 数え始める位置
 * @param direction - 数える方向（`-1`: 前方、`1`: 後方）
 * @param char - 数える文字
 * @param limit - 数える最大数
 * @returns 連続する文字の数
 */
function countRunInDocument(state: EditorState, position: number, direction: -1 | 1, char: string, limit = 3): number {
  let count = 0;
  while (count < limit) {
    const from = direction === -1 ? position - count - 1 : position + count;
    if (from < 0 || from >= state.doc.length || state.sliceDoc(from, from + 1) !== char) {
      break;
    }
    count++;
  }
  return count;
}


/**
 * 文字列の先頭または末尾に連続する文字の数を数える。
 *
 * @param text - 対象の文字列
 * @param direction - 数える位置（`1`: 先頭から、`-1`: 末尾から）
 * @param char - 数える文字
 * @param limit - 数える最大数
 * @returns 連続する文字の数
 */
function countRunInText(text: string, direction: -1 | 1, char: string, limit = 3): number {
  let count = 0;
  while (count < limit && count < text.length && text.at(direction === 1 ? count : -count - 1) === char) {
    count++;
  }
  return count;
}


/**
 * マーカーの前後に連続する文字の数から、マーカーで囲まれているかどうかを判定する。
 *
 * 1文字のマーカー（`*` など）の場合、2文字分（`**`）で囲まれているときは別の装飾とみなす。
 *
 * @param marker - マーカー
 * @param runBefore - 前に連続する文字の数
 * @param runAfter - 後に連続する文字の数
 * @returns 囲まれている場合は `true`
 */
function isWrappedBy(marker: string, runBefore: number, runAfter: number): boolean {
  const run = Math.min(runBefore, runAfter);
  return marker.length === 1 ? run === 1 || run === 3 : run >= marker.length;
}


/**
 * 選択範囲をマーカーで囲む（既に囲まれている場合は解除する）コマンドを生成する。
 *
 * @param marker - 前後に付けるマーカー（例: `**`）
 * @param placeholder - 何も選択していない場合に挿入する文字列
 * @returns 生成したコマンド
 */
function toggleInlineMarkup(marker: string, placeholder: string): MarkdownCommand {
  const char = marker[0];
  return (view) => {
    const { state } = view;
    view.dispatch(state.changeByRange((range) => {
      // 前後の空白はマーカーの外側に残す（`**太字 **` のように書くと強調として解釈されないため）
      const selected = state.sliceDoc(range.from, range.to);
      const from = range.from + (selected.length - selected.trimStart().length);
      const to = Math.max(from, range.to - (selected.length - selected.trimEnd().length));
      const text = state.sliceDoc(from, to);

      // 選択範囲の外側がマーカーで囲まれている場合は解除する
      if (isWrappedBy(marker, countRunInDocument(state, from, -1, char), countRunInDocument(state, to, 1, char))) {
        return {
          changes: [
            { from: from - marker.length, to: from },
            { from: to, to: to + marker.length },
          ],
          range: EditorSelection.range(from - marker.length, to - marker.length),
        };
      }

      // 選択範囲の内側がマーカーで囲まれている場合も解除する
      if (
        text.length >= marker.length * 2
        && isWrappedBy(marker, countRunInText(text, 1, char), countRunInText(text, -1, char))
      ) {
        const inner = text.slice(marker.length, -marker.length);
        return {
          changes: { from, to, insert: inner },
          range: EditorSelection.range(from, from + inner.length),
        };
      }

      const content = text || placeholder;
      return {
        changes: { from, to, insert: `${marker}${content}${marker}` },
        range: EditorSelection.range(from + marker.length, from + marker.length + content.length),
      };
    }), { scrollIntoView: true, userEvent: 'input' });
    view.focus();
    return true;
  };
}


/** 太字の切り替え */
export const toggleBold = toggleInlineMarkup('**', '太字');

/** 斜体の切り替え */
export const toggleItalic = toggleInlineMarkup('*', '斜体');

/** 取り消し線の切り替え */
export const toggleStrikethrough = toggleInlineMarkup('~~', '取り消し線');

/** インラインコードの切り替え */
export const toggleInlineCode = toggleInlineMarkup('`', 'コード');


/**
 * URL とみなす文字列のパターン。
 */
const URL_PATTERN = /^https?:\/\/\S+$/;


/**
 * リンクまたは画像を挿入するコマンドを生成する。
 *
 * @param isImage - 画像を挿入するかどうか
 * @returns 生成したコマンド
 */
function insertLinkMarkup(isImage: boolean): MarkdownCommand {
  const prefix = isImage ? '![' : '[';
  const defaultLabel = isImage ? '画像の説明' : 'リンクテキスト';
  const defaultUrl = 'https://';
  return (view) => {
    const { state } = view;
    view.dispatch(state.changeByRange((range) => {
      const selected = state.sliceDoc(range.from, range.to).trim();

      // URL を選択している場合はリンク先として使い、表示テキストを選択状態にする
      if (URL_PATTERN.test(selected)) {
        const start = range.from + prefix.length;
        return {
          changes: { from: range.from, to: range.to, insert: `${prefix}${defaultLabel}](${selected})` },
          range: EditorSelection.range(start, start + defaultLabel.length),
        };
      }

      // テキストを選択している場合は表示テキストとして使い、リンク先を選択状態にする
      const label = selected.replaceAll(/\s*\n\s*/g, ' ') || defaultLabel;
      const start = selected ? range.from + prefix.length + label.length + 2 : range.from + prefix.length;
      return {
        changes: { from: range.from, to: range.to, insert: `${prefix}${label}](${defaultUrl})` },
        range: EditorSelection.range(start, start + (selected ? defaultUrl.length : label.length)),
      };
    }), { scrollIntoView: true, userEvent: 'input' });
    view.focus();
    return true;
  };
}


/** リンクの挿入 */
export const insertLink = insertLinkMarkup(false);

/** 画像の挿入 */
export const insertImage = insertLinkMarkup(true);


/* ---------------------------------------------------------------------------------------------------------------------
 * 行単位の装飾
 * ------------------------------------------------------------------------------------------------------------------ */

/**
 * 選択範囲に含まれる行を、重複なく行番号順に列挙する。
 *
 * @param state - エディタの状態
 * @returns 選択範囲に含まれる行
 */
function getSelectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    let last = state.doc.lineAt(range.to).number;
    // 選択範囲が行頭で終わっている場合（行全体を選択した場合など）は、その行を含めない
    if (last > first && state.doc.line(last).from === range.to) {
      last--;
    }
    for (let number = first; number <= last; number++) {
      lines.set(number, state.doc.line(number));
    }
  }
  return [...lines.values()].toSorted((a, b) => a.number - b.number);
}


/**
 * 空行を除いた行を返す。すべて空行の場合は元の行をそのまま返す。
 *
 * @param lines - 対象の行
 * @returns 空行を除いた行
 */
function excludeBlankLines(lines: Line[]): Line[] {
  const nonBlankLines = lines.filter((line) => line.text.trim() !== '');
  return nonBlankLines.length > 0 ? nonBlankLines : lines;
}


/**
 * 行頭に対する変更を適用する。行頭にあるカーソルは、挿入した文字列の後ろに移動させる。
 *
 * @param view - エディタ
 * @param changes - 適用する変更
 * @returns 常に `true`
 */
function dispatchLineChanges(view: EditorView, changes: ChangeSpec[]): boolean {
  const { state } = view;
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    // EditorSelection#map（配列の map ではない）
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
    selection: state.selection.map(changeSet, 1),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}


/**
 * 見出し行のパターン。
 */
const HEADING_PATTERN = /^(#{1,6})(?:[ \t]+|$)/;


/**
 * 選択中の行を見出しにする（既に同じレベルの見出しの場合は解除する）コマンドを生成する。
 *
 * @param level - 見出しのレベル（1〜6）
 * @returns 生成したコマンド
 */
export function toggleHeading(level: number): MarkdownCommand {
  const prefix = `${'#'.repeat(level)} `;
  return (view) => {
    const lines = getSelectedLines(view.state);
    const isAllSameLevel = lines.every((line) => HEADING_PATTERN.exec(line.text)?.[1].length === level);
    return dispatchLineChanges(view, lines.map((line) => ({
      from: line.from,
      to: line.from + (HEADING_PATTERN.exec(line.text)?.[0].length ?? 0),
      insert: isAllSameLevel ? '' : prefix,
    })));
  };
}


/**
 * 引用行のパターン。
 */
const BLOCKQUOTE_PATTERN = /^(\s*)> ?/;


/**
 * 選択中の行を引用にする（既に引用の場合は解除する）。
 *
 * @param view - エディタ
 * @returns 常に `true`
 */
export const toggleBlockquote: MarkdownCommand = (view) => {
  const lines = getSelectedLines(view.state);
  const targets = excludeBlankLines(lines);
  if (targets.every((line) => BLOCKQUOTE_PATTERN.test(line.text))) {
    return dispatchLineChanges(view, targets.flatMap((line) => {
      const match = BLOCKQUOTE_PATTERN.exec(line.text);
      return match ? [{ from: line.from + match[1].length, to: line.from + match[0].length }] : [];
    }));
  }
  // 空行にも `>` を付けて、選択範囲全体を1つの引用にする
  return dispatchLineChanges(view, lines.map((line) => ({
    from: line.from,
    insert: line.text.trim() === '' ? '>' : '> ',
  })));
};


/**
 * リスト項目の行のパターン。
 */
const LIST_ITEM_PATTERN = /^(\s*)([-*+]|\d+[.)])(?:[ \t]+|$)/;


/**
 * 選択中の行をリストにする（既に同じ種類のリストの場合は解除する）コマンドを生成する。
 *
 * @param kind - リストの種類（`bullet`: 箇条書き、`ordered`: 番号付き）
 * @returns 生成したコマンド
 */
export function toggleList(kind: 'bullet' | 'ordered'): MarkdownCommand {
  const isSameKind = (marker: string): boolean => (kind === 'bullet' ? /^[-*+]$/.test(marker) : /^\d/.test(marker));
  return (view) => {
    const targets = excludeBlankLines(getSelectedLines(view.state));
    const isAllListed = targets.every((line) => {
      const match = LIST_ITEM_PATTERN.exec(line.text);
      return match !== null && isSameKind(match[2]);
    });
    let number = 0;
    return dispatchLineChanges(view, targets.map((line) => {
      const match = LIST_ITEM_PATTERN.exec(line.text);
      const indentLength = match ? match[1].length : line.text.length - line.text.trimStart().length;
      const from = line.from + indentLength;
      const to = line.from + (match ? match[0].length : indentLength);
      if (isAllListed) {
        return { from, to };
      }
      number++;
      return { from, to, insert: kind === 'bullet' ? '- ' : `${number}. ` };
    }));
  };
}


/* ---------------------------------------------------------------------------------------------------------------------
 * ブロック要素の挿入
 * ------------------------------------------------------------------------------------------------------------------ */

/**
 * メインの選択範囲をブロック要素で置き換える。ブロックの前後が空行になるように改行を補う。
 *
 * @param view - エディタ
 * @param build - 選択中の文字列を受け取り、挿入する文字列と、挿入後に選択する範囲（挿入する文字列内の位置）を返す関数
 * @returns 常に `true`
 */
function replaceWithBlock(
  view: EditorView,
  build: (selected: string) => { text: string; selection: readonly [number, number] },
): boolean {
  const { state } = view;
  const range = state.selection.main;
  const { text, selection } = build(state.sliceDoc(range.from, range.to));
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);

  let before = '';
  if (state.sliceDoc(startLine.from, range.from).trim() !== '') {
    before = '\n\n';
  } else if (startLine.number > 1 && state.doc.line(startLine.number - 1).text.trim() !== '') {
    before = '\n';
  }

  let after = '';
  if (state.sliceDoc(range.to, endLine.to).trim() !== '') {
    after = '\n\n';
  } else if (endLine.number < state.doc.lines && state.doc.line(endLine.number + 1).text.trim() !== '') {
    after = '\n';
  }

  const anchor = range.from + before.length;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${before}${text}${after}` },
    selection: EditorSelection.range(anchor + selection[0], anchor + selection[1]),
    scrollIntoView: true,
    userEvent: 'input',
  });
  view.focus();
  return true;
}


/**
 * コードブロックを挿入する。テキストを選択している場合は、そのテキストをコードブロックにする。
 *
 * @param view - エディタ
 * @returns 常に `true`
 */
export const insertCodeBlock: MarkdownCommand = (view) => replaceWithBlock(view, (selected) => {
  // 選択範囲にフェンスが含まれる場合は、より長いフェンスで囲む
  const fence = selected.includes('```') ? '````' : '```';
  const start = fence.length + 1;
  return {
    text: `${fence}\n${selected}\n${fence}`,
    selection: [start, start + selected.length],
  };
});


/**
 * 表を挿入するときのひな形。
 */
const TABLE_TEMPLATE = '| 見出し1 | 見出し2 |\n| --- | --- |\n| セル | セル |';


/**
 * タブ区切りの文字列（表計算ソフトからコピーした表など）を、Markdown の表に変換する。
 *
 * @param tsv - タブ区切りの文字列（1行目を見出しとして扱う）
 * @returns Markdown の表
 */
function convertTsvToTable(tsv: string): string {
  const rows = tsv
    .split(/\r?\n/)
    .filter((row) => row.trim() !== '')
    .map((row) => row.split('\t').map((cell) => cell.trim().replaceAll('|', String.raw`\|`)));
  const columnCount = Math.max(...rows.map((row) => row.length));
  const toLine = (cells: readonly string[]): string => (
    `| ${Array.from({ length: columnCount }, (_, index) => cells[index] ?? '').join(' | ')} |`
  );
  const [header, ...body] = rows;
  return [
    toLine(header),
    toLine(Array.from({ length: columnCount }, () => '---')),
    ...body.map((row) => toLine(row)),
  ].join('\n');
}


/**
 * 表を挿入する。タブ区切りのテキストを選択している場合は、表に変換する。
 *
 * @param view - エディタ
 * @returns 常に `true`
 */
export const insertTable: MarkdownCommand = (view) => replaceWithBlock(view, (selected) => {
  if (selected.includes('\t')) {
    const table = convertTsvToTable(selected);
    return { text: table, selection: [table.length, table.length] };
  }
  // 最初の見出しセルを選択状態にする
  return { text: TABLE_TEMPLATE, selection: [2, 2 + '見出し1'.length] };
});


/**
 * 区切り線を挿入する。テキストを選択している場合は、その後ろに挿入する。
 *
 * @param view - エディタ
 * @returns 常に `true`
 */
export const insertHorizontalRule: MarkdownCommand = (view) => {
  view.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.to) });
  return replaceWithBlock(view, () => ({ text: '---', selection: [3, 3] }));
};


/* ---------------------------------------------------------------------------------------------------------------------
 * キーバインド
 * ------------------------------------------------------------------------------------------------------------------ */

/**
 * Markdown の装飾用のキーバインド。
 */
export const markdownShortcutKeymap: readonly KeyBinding[] = [
  { key: SHORTCUT_KEYS.bold, run: toggleBold },
  { key: SHORTCUT_KEYS.italic, run: toggleItalic },
  { key: SHORTCUT_KEYS.strikethrough, run: toggleStrikethrough },
  { key: SHORTCUT_KEYS.inlineCode, run: toggleInlineCode },
  { key: SHORTCUT_KEYS.link, run: insertLink },
];
