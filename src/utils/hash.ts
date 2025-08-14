/**
 * 入力文字列をSHA-256でハッシュ化する。
 *
 * @param input 入力文字列
 * @returns SHA-256ハッシュ値
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
