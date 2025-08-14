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
