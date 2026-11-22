/**
 * 日本標準時と協定世界時の差（ms）。日本では夏時間を採用していないため固定値とする。
 */
const JST_OFFSET = 9 * 60 * 60 * 1000;


/**
 * 日付が属する年度を返す。
 *
 * 年度は4月1日から翌年3月31日までとし、日本標準時で判定する（協定世界時で判定すると、4月1日の 0:00〜9:00 が前年度になるため）。
 */
export function getFiscalYear(date: Date): number {
  const jst = new Date(date.getTime() + JST_OFFSET);
  const year = jst.getUTCFullYear();
  return jst.getUTCMonth() < 3 ? year - 1 : year;
}


export function getFiscalYearStart(year: number): Date {
  return new Date(Date.UTC(year, 3, 1));
}
