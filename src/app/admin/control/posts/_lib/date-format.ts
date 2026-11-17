/**
 * 日本標準時と協定世界時の差（ms）。日本では夏時間を採用していないため固定値とする。
 */
const JST_OFFSET = 9 * 60 * 60 * 1000;


/**
 * 数値を2桁の文字列にする。
 *
 * @param value - 数値
 * @returns 2桁の文字列
 */
const pad = (value: number): string => String(value).padStart(2, '0');


/**
 * 日時を日本標準時の各要素に分解する。
 *
 * サーバーとブラウザで結果が変わらないよう、`Intl` を使わずに計算する。
 *
 * @param date - 日時
 * @returns 日本標準時の年・月・日・時・分
 */
function toJstParts(date: Date): { year: number; month: string; day: string; hour: string; minute: string } {
  const jst = new Date(date.getTime() + JST_OFFSET);
  return {
    year: jst.getUTCFullYear(),
    month: pad(jst.getUTCMonth() + 1),
    day: pad(jst.getUTCDate()),
    hour: pad(jst.getUTCHours()),
    minute: pad(jst.getUTCMinutes()),
  };
}


/**
 * 日付を日本標準時でフォーマットする。
 *
 * @param date - 日時
 * @returns フォーマット済みの日付（例: `2026/11/17`）
 */
export function formatDate(date: Date): string {
  const { year, month, day } = toJstParts(date);
  return `${year}/${month}/${day}`;
}


/**
 * 日時を日本標準時でフォーマットする。
 *
 * @param date - 日時
 * @returns フォーマット済みの日時（例: `2026/11/17 14:05`）
 */
export function formatDateTime(date: Date): string {
  const { hour, minute } = toJstParts(date);
  return `${formatDate(date)} ${hour}:${minute}`;
}


/**
 * 基準日時からの経過時間を、おおまかな表現でフォーマットする。30日以上前の場合は日付を返す。
 *
 * @param date - 日時
 * @param now - 基準日時
 * @returns フォーマット済みの文字列（例: `3時間前`）
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) {
    return 'たった今';
  }
  if (seconds < 60 * 60) {
    return `${Math.floor(seconds / 60)}分前`;
  }
  if (seconds < 24 * 60 * 60) {
    return `${Math.floor(seconds / (60 * 60))}時間前`;
  }
  if (seconds < 30 * 24 * 60 * 60) {
    return `${Math.floor(seconds / (24 * 60 * 60))}日前`;
  }
  return formatDate(date);
}
