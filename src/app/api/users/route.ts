import { prisma } from '@/lib/prisma';


/**
 * ユーザー情報の型定義。
 */
export type usersApiGetResponse = {
  id: number;
  cuId: string;
  name: string;
  displayName: string | null;
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
    select: { id: true, cuId: true, name: true, displayName: true, roles: true, createdAt: true, updatedAt: true },
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
  const { cuId, name, displayName, roles } = body;

  if (!cuId || !name || !roles || roles.length === 0) {
    return new Response(JSON.stringify({ status: 400, message: 'CU_ID, name, and at least one role are required' }), { status: 400 });
  }

  try {
    await prisma.user.create({
      data: { cuId, name, displayName: displayName || null, roles },
    });
    return new Response(JSON.stringify({ status: 201, message: 'Successfully added user' }), { status: 201 });
  } catch (e) {
    console.error('Error creating user:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to create user' }), { status: 500 });
  }
}
