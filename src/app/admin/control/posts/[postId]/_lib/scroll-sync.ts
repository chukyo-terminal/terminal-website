import type { EditorView } from '@codemirror/view';


/**
 * エディタのスクロール位置（プレビューとのスクロール同期に使用する）。
 */
export type EditorScrollPosition = {
  /** 表示領域の上端にある行（0始まり。行内の位置を小数部で表す） */
  line: number;
  /** ドキュメントの総行数 */
  lineCount: number;
  /** 先頭までスクロールしているかどうか */
  isAtTop: boolean;
  /** 末尾までスクロールしているかどうか */
  isAtBottom: boolean;
};


/**
 * プレビュー内の、ソースの行と表示位置の対応。
 */
export type SourceLineAnchor = {
  /** ソースの行（0始まり） */
  line: number;
  /** スクロール領域の上端からの位置（px） */
  top: number;
};


/**
 * エディタの現在のスクロール位置を取得する。
 *
 * @param view - エディタ
 * @returns スクロール位置
 */
export function getEditorScrollPosition(view: EditorView): EditorScrollPosition {
  const scroller = view.scrollDOM;
  const height = Math.max(0, scroller.getBoundingClientRect().top - view.documentTop);
  const block = view.lineBlockAtHeight(height);
  const lineIndex = view.state.doc.lineAt(block.from).number - 1;
  const fraction = block.height > 0 ? Math.min(1, Math.max(0, (height - block.top) / block.height)) : 0;
  return {
    line: lineIndex + fraction,
    lineCount: view.state.doc.lines,
    isAtTop: scroller.scrollTop <= 1,
    isAtBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1,
  };
}


/**
 * エディタのスクロール位置に対応する、プレビューのスクロール位置を計算する。
 *
 * 前後の行の表示位置から線形補間して求める。
 *
 * @param anchors - ソースの行と表示位置の対応（行の昇順）
 * @param line - エディタの表示領域の上端にある行（小数部は行内の位置）
 * @returns プレビューのスクロール位置（px）
 */
export function interpolateScrollTop(anchors: readonly SourceLineAnchor[], line: number): number {
  if (anchors.length === 0) {
    return 0;
  }
  let index = 0;
  while (index + 1 < anchors.length && anchors[index + 1].line <= line) {
    index++;
  }
  const previous = anchors[index];
  const next = anchors.at(index + 1);
  if (!next || next.line === previous.line) {
    return previous.top;
  }
  const ratio = Math.min(1, Math.max(0, (line - previous.line) / (next.line - previous.line)));
  return previous.top + (next.top - previous.top) * ratio;
}
