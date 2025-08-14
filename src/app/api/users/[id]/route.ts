import { prisma } from '@/lib/prisma';

import { hashPassword } from '@/utils/password';

import type { Prisma } from '@prisma/client';


/**
 * ユーザーを更新するAPIエンドポイント。
 *
 * @param request リクエストオブジェクト
 * @param params パラメータオブジェクト
 * @returns レスポンスオブジェクト
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = Number((await params).id); // eslint-disable-line unicorn/no-await-expression-member
  const body = await request.json();
  const { password_hash, roles } = body;

  if (!id) {
    return new Response(JSON.stringify({ status: 400, message: 'ID is required' }), { status: 400 });
  }

  if (!password_hash && !roles && roles.length === 0) {
    return new Response(JSON.stringify({ status: 400, message: 'Password or at least one role are required' }), { status: 400 });
  }
  try {
    const updateData: Prisma.UserUpdateInput = {};
    if (password_hash) {
      updateData.password_hash = await hashPassword(password_hash);
    }
    if (roles && roles.length > 0) {
      updateData.roles = roles;
    }

    await prisma.user.update({
      where: { id },
      data: updateData,
    });
    return new Response(JSON.stringify({ status: 200, message: 'Successfully updated user' }), { status: 200 });
  } catch (e) {
    console.error('Error updating user:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to update user' }), { status: 500 });
  }
}


/**
 * ユーザーを削除するAPIエンドポイント。
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
    await prisma.user.delete({ where: { id } });
    return new Response(JSON.stringify({ status: 200, message: 'Successfully deleted user' }), { status: 200 });
  } catch (e) {
    console.error('Error deleting user:', e);
    return new Response(JSON.stringify({ status: 500, message: 'Failed to delete user' }), { status: 500 });
  }
}
