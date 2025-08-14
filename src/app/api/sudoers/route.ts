import { prisma } from '@/lib/prisma';


/**
 * sudoers情報の型定義。
 */
export type sudoersApiGetResponse = {
  id: number;
  cuId: string;
  createdAt: string; // Date
}[];


/**
 * sudoers情報を取得するAPIエンドポイント。
 *
 * @returns JSON形式のsudoers情報
 */
export async function GET(): Promise<Response> {
  const sudoers = await prisma.sudoer.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, cuId: true, createdAt: true },
  });
  return new Response(JSON.stringify(sudoers));
}


/**
 * sudoerを追加するAPIエンドポイント。
 *
 * @param request リクエストオブジェクト
 * @returns レスポンスオブジェクト
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const { cuId } = body;

  if (!cuId) {
    return new Response(JSON.stringify({ status: 400, message: 'CU_ID is required' }), { status: 400 });
  }

  try {
    await prisma.sudoer.create({ data: { cuId } });
    return new Response(JSON.stringify({ status: 201, message: 'Successfully added sudoer' }), { status: 201 });
  } catch (e) {
    console.error('Error creating sudoer:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to create sudoer' }), { status: 500 });
  }
}
