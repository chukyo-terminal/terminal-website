/**
 * 日付が属する年度を返す。
 *
 * 年度は4月1日から翌年3月31日までとする。
 */
export function getFiscalYear(date: Date): number {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() < 3 ? year - 1 : year;
}


export function getFiscalYearStart(year: number): Date {
  return new Date(Date.UTC(year, 3, 1));
}
