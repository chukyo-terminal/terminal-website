'use server';

import bcrypt from 'bcrypt';


/**
 * パスワードをハッシュ化する。
 *
 * @param password ハッシュ化するパスワード
 * @returns ハッシュ化されたパスワード
 * @note サーバーサイドでのみ実行可能であるため、クライアントからパスワードを受け取るときはSHA-256などのハッシュ化を行うこと。
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}
