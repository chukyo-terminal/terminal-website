import { prisma } from '@/lib/prisma';

import { hashPassword } from '@/utils/password';


/**
 * ユーザー情報の型定義。
 */
export type usersApiGetResponse = {
  id: number;
  userId: string;
  roles: string[];
  createdAt: string; // Date
  updatedAt: string; // Date
}[];


/**
 * ユーザー情報を取得するAPIエンドポイント。
 *
 * @returns JSON形式のユーザー情報
 */
export async function GET(): Promise<Response> {
  const users = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, userId: true, roles: true, createdAt: true, updatedAt: true },
  });
  return new Response(JSON.stringify(users));
}


/**
 * ユーザーを追加するAPIエンドポイント。
 *
 * @param request リクエストオブジェクト
 * @returns レスポンスオブジェクト
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const { userId, password_hash, roles } = body;

  if (!userId || !password_hash || !roles || roles.length === 0) {
    return new Response(JSON.stringify({ status: 400, message: 'User ID, password, and at least one role are required' }), { status: 400 });
  }

  try {
    await prisma.user.create({
      data: { userId, password_hash: await hashPassword(password_hash), roles },
    });
    return new Response(JSON.stringify({ status: 201, message: 'Successfully added user' }), { status: 201 });
  } catch (e) {
    console.error('Error creating user:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to create user' }), { status: 500 });
  }
}
