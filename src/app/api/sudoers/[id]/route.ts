import { prisma } from '@/lib/prisma';


/**
 * sudoerを削除するAPIエンドポイント。
 *
 * @param request リクエストオブジェクト
 * @param params パラメータオブジェクト
 * @returns レスポンスオブジェクト
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await params).id); // eslint-disable-line unicorn/no-await-expression-member

  if (!id) {
    return new Response(JSON.stringify({ status: 400, message: 'ID is required' }), { status: 400 });
  }

  try {
    await prisma.sudoer.delete({ where: { id } });
    return new Response(JSON.stringify({ status: 200, message: 'Successfully deleted sudoer' }), { status: 200 });
  } catch (e) {
    console.error('Error deleting sudoer:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to delete sudoer' }), { status: 500 });
  }
}
