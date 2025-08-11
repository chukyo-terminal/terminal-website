import { prisma } from '@/lib/prisma';


/**
 * ユーザー情報の型定義。
 */
export type usersApiGetResponse = {
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
    select: { userId: true, roles: true, createdAt: true, updatedAt: true },
  });
  return new Response(JSON.stringify(users));
}
