/**
 * テキストの差分を計算するユーティリティ。
 *
 * サーバーとブラウザの両方で使用できるよう、外部に依存しない純粋な関数のみで構成する。
 */


/**
 * 差分の種類。
 *
 * - `equal`: 変更なし
 * - `insert`: 追加
 * - `delete`: 削除
 */
export type DiffType = 'equal' | 'insert' | 'delete';


/**
 * 行内の差分の断片。
 */
export type DiffSegment = {
  text: string;
  /** 変更された部分かどうか */
  isChanged: boolean;
};


/**
 * 差分の1行。
 */
export type DiffLine = {
  type: DiffType;
  text: string;
  /** 変更前の行番号（1始まり。追加された行の場合は `null`） */
  oldLineNumber: number | null;
  /** 変更後の行番号（1始まり。削除された行の場合は `null`） */
  newLineNumber: number | null;
  /** 行内の変更箇所（対応する行との差分を計算できた場合のみ） */
  segments?: DiffSegment[];
};


/**
 * 表示用に、変更のない行を省略した差分の要素。
 */
export type DiffDisplayItem =
  | { kind: 'line'; line: DiffLine }
  | { kind: 'skip'; count: number };


/**
 * 行単位の差分を計算する際の、編集距離の上限。これを超える場合は全体を置き換えたものとして扱う。
 */
const MAX_LINE_EDIT_DISTANCE = 1000;


/**
 * 行内の差分を計算する際の、編集距離の上限。
 */
const MAX_INLINE_EDIT_DISTANCE = 200;


/**
 * 行内の差分を計算する行の最大文字数。
 */
const MAX_INLINE_LINE_LENGTH = 3000;


/**
 * 行内の差分を表示する、変更されていない部分の割合の下限（これより似ていない行は、行全体を変更として扱う）。
 */
const MIN_INLINE_SIMILARITY = 0.4;


/**
 * Myers のアルゴリズムで、2つの列の最短の編集手順を計算する。
 *
 * @param a - 変更前の列
 * @param b - 変更後の列
 * @param maxEditDistance - 編集距離の上限
 * @returns 編集手順（`a`・`b` の先頭から順に、要素ごとの操作）。編集距離が上限を超える場合は `null`
 */
function myers<T>(a: readonly T[], b: readonly T[], maxEditDistance: number): DiffType[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxEditDistance);
  const offset = max + 1;
  // v[offset + k] に、対角線 k 上で到達できる最も遠い x を保持する
  const v = new Int32Array(2 * max + 3);
  // 各ステップの開始時点の v（必要な範囲のみ）。経路の復元に使用する
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
        ? v[offset + k + 1]
        : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        return backtrack(trace, n, m);
      }
    }
  }
  return null;
}


/**
 * Myers のアルゴリズムの探索結果から、編集手順を復元する。
 *
 * @param trace - 各ステップの開始時点の v
 * @param n - 変更前の列の長さ
 * @param m - 変更後の列の長さ
 * @returns 編集手順
 */
function backtrack(trace: readonly Int32Array[], n: number, m: number): DiffType[] {
  const operations: DiffType[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const snapshot = trace[d];
    const get = (k: number): number => snapshot[k + d + 1];
    const k = x - y;
    const previousK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const previousX = get(previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      operations.push('equal');
      x--;
      y--;
    }
    if (d > 0) {
      operations.push(previousK === k + 1 ? 'insert' : 'delete');
    }
    x = previousX;
    y = previousY;
  }
  return operations.toReversed();
}


/**
 * 2つの列の差分を計算し、編集手順を返す。
 *
 * 編集距離が上限を超える場合は、異なる部分全体を削除して追加したものとして扱う。
 *
 * @param a - 変更前の列
 * @param b - 変更後の列
 * @param maxEditDistance - 編集距離の上限
 * @returns 編集手順（`a`・`b` の先頭から順に、要素ごとの操作）
 */
export function diffSequences<T>(a: readonly T[], b: readonly T[], maxEditDistance = Infinity): DiffType[] {
  // 共通する先頭と末尾は、探索の対象から除く
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middleA = a.slice(start, endA);
  const middleB = b.slice(start, endB);
  const middle = myers(middleA, middleB, maxEditDistance) ?? [
    ...middleA.map((): DiffType => 'delete'),
    ...middleB.map((): DiffType => 'insert'),
  ];
  return [
    ...Array.from({ length: start }, (): DiffType => 'equal'),
    ...middle,
    ...Array.from({ length: a.length - endA }, (): DiffType => 'equal'),
  ];
}


/**
 * テキストを行に分割する。
 *
 * @param text - テキスト
 * @returns 行（空文字列の場合は空の配列）
 */
function splitLines(text: string): string[] {
  return text === '' ? [] : text.replaceAll('\r\n', '\n').split('\n');
}


/**
 * 行内の差分を計算するために、テキストを単語（半角英数字の連続）・空白の連続・その他の1文字に分割する。
 *
 * @param text - テキスト
 * @returns 分割したテキスト
 */
function tokenize(text: string): string[] {
  return text.match(/[A-Za-z0-9_]+|\s+|[\s\S]/gu) ?? [];
}


/**
 * 同じ種類が続く断片をまとめる。
 *
 * @param segments - 断片
 * @returns まとめた断片
 */
function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (last && last.isChanged === segment.isChanged) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}


/**
 * 2つの行の、行内の差分を計算する。
 *
 * @param oldText - 変更前の行
 * @param newText - 変更後の行
 * @returns 変更前・変更後の行の断片。似ていない行の場合は `null`
 */
export function diffInline(oldText: string, newText: string): { old: DiffSegment[]; new: DiffSegment[] } | null {
  if (oldText.length > MAX_INLINE_LINE_LENGTH || newText.length > MAX_INLINE_LINE_LENGTH) {
    return null;
  }
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const operations = diffSequences(oldTokens, newTokens, MAX_INLINE_EDIT_DISTANCE);
  const oldSegments: DiffSegment[] = [];
  const newSegments: DiffSegment[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let unchangedLength = 0;
  for (const operation of operations) {
    switch (operation) {
      case 'equal': {
        const token = oldTokens[oldIndex++];
        newIndex++;
        unchangedLength += token.length;
        oldSegments.push({ text: token, isChanged: false });
        newSegments.push({ text: token, isChanged: false });
        break;
      }
      case 'delete': {
        oldSegments.push({ text: oldTokens[oldIndex++], isChanged: true });
        break;
      }
      case 'insert': {
        newSegments.push({ text: newTokens[newIndex++], isChanged: true });
        break;
      }
    }
  }
  const similarity = unchangedLength / Math.max(oldText.length, newText.length, 1);
  if (similarity < MIN_INLINE_SIMILARITY) {
    return null;
  }
  return { old: mergeSegments(oldSegments), new: mergeSegments(newSegments) };
}


/**
 * 2つのテキストの、行単位の差分を計算する。
 *
 * 連続する変更は、削除された行・追加された行の順に並べ、対応する行どうしの行内の差分も計算する。
 *
 * @param oldText - 変更前のテキスト
 * @param newText - 変更後のテキスト
 * @returns 差分の行
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const operations = diffSequences(oldLines, newLines, MAX_LINE_EDIT_DISTANCE);
  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let index = 0;
  while (index < operations.length) {
    if (operations[index] === 'equal') {
      result.push({
        type: 'equal',
        text: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      oldIndex++;
      newIndex++;
      index++;
      continue;
    }
    // 連続する変更をまとめて、削除・追加の順に並べる
    const deleted: DiffLine[] = [];
    const inserted: DiffLine[] = [];
    while (index < operations.length && operations[index] !== 'equal') {
      if (operations[index] === 'delete') {
        deleted.push({ type: 'delete', text: oldLines[oldIndex], oldLineNumber: oldIndex + 1, newLineNumber: null });
        oldIndex++;
      } else {
        inserted.push({ type: 'insert', text: newLines[newIndex], oldLineNumber: null, newLineNumber: newIndex + 1 });
        newIndex++;
      }
      index++;
    }
    for (let pair = 0; pair < Math.min(deleted.length, inserted.length); pair++) {
      const inline = diffInline(deleted[pair].text, inserted[pair].text);
      if (inline) {
        deleted[pair].segments = inline.old;
        inserted[pair].segments = inline.new;
      }
    }
    result.push(...deleted, ...inserted);
  }
  return result;
}


/**
 * 差分のうち、追加・削除された行の数を数える。
 *
 * @param lines - 差分の行
 * @returns 追加された行と削除された行の数
 */
export function countLineChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'insert') {
      added++;
    } else if (line.type === 'delete') {
      removed++;
    }
  }
  return { added, removed };
}


/**
 * 表示用に、変更箇所から離れた変更のない行を省略する。
 *
 * @param lines - 差分の行
 * @param context - 変更箇所の前後に表示する、変更のない行の数
 * @returns 表示する要素
 */
export function collapseUnchangedLines(lines: readonly DiffLine[], context = 3): DiffDisplayItem[] {
  const isVisible = lines.map(() => false);
  for (const [index, line] of lines.entries()) {
    if (line.type !== 'equal') {
      for (let offset = Math.max(0, index - context); offset <= Math.min(lines.length - 1, index + context); offset++) {
        isVisible[offset] = true;
      }
    }
  }
  const items: DiffDisplayItem[] = [];
  let skipped = 0;
  for (const [index, line] of lines.entries()) {
    if (isVisible[index]) {
      if (skipped > 0) {
        items.push({ kind: 'skip', count: skipped });
        skipped = 0;
      }
      items.push({ kind: 'line', line });
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    items.push({ kind: 'skip', count: skipped });
  }
  return items;
}
