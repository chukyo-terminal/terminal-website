/**
 * 学籍番号（CU_ID）の形式。`users` テーブルの `valid_cu_id` 制約と同じ条件。
 *
 * LDAP の `schacPersonalUniqueCode` に含まれる学生 ID（大文字化したもの）と一致する。
 */
export const CU_ID_PATTERN = /^[A-Z]\d{5}[md\d]$/;


/**
 * 入力された CU_ID を正規化する（前後の空白を除き、大文字にする）。
 *
 * @param value - 入力された値
 * @returns 正規化した CU_ID
 */
export const normalizeCuId = (value: string): string => value.trim().toUpperCase();
