import { collapseUnchangedLines, diffInline, diffLines } from '@/utils/diff';

import type { JSX } from 'react';
import type { DiffSegment, DiffType } from '@/utils/diff';


/**
 * 差分の種類ごとの、行の配色。
 */
const ROW_CLASS_NAMES: Readonly<Record<DiffType, string>> = {
  equal: 'text-gray-300',
  delete: 'bg-red-500/10 text-red-100',
  insert: 'bg-emerald-500/10 text-emerald-100',
};


/**
 * 差分の種類ごとの、行内の変更箇所の配色。
 */
const SEGMENT_CLASS_NAMES: Readonly<Record<DiffType, string>> = {
  equal: '',
  delete: 'rounded-sm bg-red-500/35 text-red-50 line-through decoration-red-300/60',
  insert: 'rounded-sm bg-emerald-500/35 text-emerald-50',
};


/**
 * 差分の種類ごとの、行頭の記号と読み上げ用の名称。
 */
const MARKERS: Readonly<Record<DiffType, { symbol: string; label: string }>> = {
  equal: { symbol: ' ', label: '' },
  delete: { symbol: '−', label: '削除: ' },
  insert: { symbol: '+', label: '追加: ' },
};


/**
 * 行内の差分を、変更箇所を強調して表示する。
 *
 * @param properties - プロパティ
 * @returns 行の内容
 */
function Segments({ segments, type }: { segments: readonly DiffSegment[]; type: DiffType }): JSX.Element {
  return (
    <>
      {segments.map((segment, index) => (
        segment.isChanged
          ? <mark key={index} className={SEGMENT_CLASS_NAMES[type]}>{segment.text}</mark>
          : <span key={index}>{segment.text}</span>
      ))}
    </>
  );
}


/**
 * 2つのテキストの差分を、行単位で表示する（変更箇所から離れた変更のない行は省略する）。
 *
 * @param properties - プロパティ
 * @returns 差分の表示
 */
export function TextDiff({
  oldText,
  newText,
  context = 3,
}: {
  oldText: string;
  newText: string;
  /** 変更箇所の前後に表示する、変更のない行の数 */
  context?: number;
}): JSX.Element {
  const lines = diffLines(oldText, newText);
  if (lines.every((line) => line.type === 'equal')) {
    return (
      <p className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-400">
        本文に変更はありません。
      </p>
    );
  }
  const items = collapseUnchangedLines(lines, context);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      <table className="w-full table-fixed border-collapse font-mono text-sm leading-relaxed">
        <colgroup>
          <col className="w-9 sm:w-12" />
          <col className="w-9 sm:w-12" />
          <col className="w-5" />
          <col />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th scope="col">変更前の行</th>
            <th scope="col">変更後の行</th>
            <th scope="col">種類</th>
            <th scope="col">内容</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            if (item.kind === 'skip') {
              return (
                <tr key={`skip-${index}`} className="border-y border-gray-800 bg-gray-800/60">
                  <td colSpan={4} className="px-3 py-1 font-sans text-xs text-gray-400">
                    ⋯ {item.count}行 変更なし
                  </td>
                </tr>
              );
            }
            const { line } = item;
            return (
              <tr
                key={`${line.type}-${line.oldLineNumber}-${line.newLineNumber}`}
                className={ROW_CLASS_NAMES[line.type]}
              >
                <td className="px-1 text-right align-top text-xs leading-[1.625rem] text-gray-500 select-none sm:px-2">
                  {line.oldLineNumber}
                </td>
                <td className="px-1 text-right align-top text-xs leading-[1.625rem] text-gray-500 select-none sm:px-2">
                  {line.newLineNumber}
                </td>
                <td className="text-center align-top select-none" aria-hidden>
                  {MARKERS[line.type].symbol}
                </td>
                <td className="pr-3 whitespace-pre-wrap wrap-anywhere">
                  {line.type !== 'equal' && <span className="sr-only">{MARKERS[line.type].label}</span>}
                  {line.segments
                    ? <Segments segments={line.segments} type={line.type} />
                    : (line.text || ' ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/**
 * 1つの項目（タイトルなど）の変更を、変更前・変更後を並べて表示する。変更がない場合は何も表示しない。
 *
 * @param properties - プロパティ
 * @returns 変更の表示
 */
export function FieldDiff({
  label,
  oldValue,
  newValue,
}: {
  label: string;
  oldValue: string | null;
  newValue: string | null;
}): JSX.Element | null {
  if ((oldValue ?? '') === (newValue ?? '')) {
    return null;
  }
  const inline = oldValue && newValue ? diffInline(oldValue, newValue) : null;
  const rows: { type: 'delete' | 'insert'; value: string | null; segments?: DiffSegment[] }[] = [
    { type: 'delete', value: oldValue, segments: inline?.old },
    { type: 'insert', value: newValue, segments: inline?.new },
  ];
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <div className="overflow-hidden rounded-lg border border-gray-700 text-sm">
        {rows.map((row) => (
          <p key={row.type} className={`flex gap-2 px-3 py-1.5 ${ROW_CLASS_NAMES[row.type]}`}>
            <span className="shrink-0 font-mono select-none" aria-hidden>{MARKERS[row.type].symbol}</span>
            <span className="min-w-0 whitespace-pre-wrap wrap-anywhere">
              <span className="sr-only">{row.type === 'delete' ? '変更前: ' : '変更後: '}</span>
              {row.value === null || row.value === ''
                ? <span className="text-gray-500 italic">（なし）</span>
                : (row.segments ? <Segments segments={row.segments} type={row.type} /> : row.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}


/**
 * 追加・削除された行の数を表示する。
 *
 * @param properties - プロパティ
 * @returns 行数の表示
 */
export function LineChangeStats({ added, removed }: { added: number; removed: number }): JSX.Element {
  return (
    <span className="inline-flex gap-2 font-mono text-xs tabular-nums">
      <span className="text-emerald-400" title={`${added}行追加`}>+{added}</span>
      <span className="text-red-400" title={`${removed}行削除`}>−{removed}</span>
    </span>
  );
}
