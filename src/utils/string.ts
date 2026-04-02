/**
 * 印刷できない文字（ゼロ幅スペースなど）を削除し、前後の空白をトリムする関数。
 * 
 * @param value - 処理する文字列
 * @returns 印刷できない文字が削除され、前後の空白がトリムされた文字列
 */
export function trimUnprintableCharacters(value: string | null | undefined): string | null | undefined {
  return value?.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}


/**
 * 値がnullか、空でない文字列であるかを検証する関数。
 * 
 * @param value - 検証する値
 * @returns 値がnullか、空でない文字列であればtrue、それ以外はfalse
 */
export function isNullOrNotEmptyString(value: string | null | undefined): boolean {
  return value === null || !!trimUnprintableCharacters(value);
}


/**
 * 値が空でない文字列であるかを検証する関数。
 * 
 * @param value - 検証する値
 * @returns 値が空でない文字列であればtrue、それ以外はfalse
 */
export function isNotEmptyString(value: string | null | undefined): boolean {
  return !!trimUnprintableCharacters(value);
}
