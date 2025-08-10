import { prisma } from '@/lib/prisma';

import type { JSX } from 'react';

export const dynamic = 'force-dynamic';


export default async function RootControlPage(): Promise<JSX.Element> {
  const sudoers = await prisma.sudoer.findMany({ orderBy: { id: 'asc' }, select: { cuId: true, createdAt: true } });
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' }, select: { userId: true, roles: true, createdAt: true, updatedAt: true } });
  return (
    <div className="mx-auto px-4 py-8">
      <h1 className="md:mt-8 text-2xl font-bold mb-4">ユーザー管理</h1>
      <div className="mb-4">
        <h2 className="text-xl mb-2">Root管理者</h2>
        <table className="ml-4 table-auto border-collapse border border-gray-600">
          <thead>
            <tr>
              <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">CU_ID</th>
              <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日</th>
            </tr>
          </thead>
          <tbody>
            {sudoers.map((sudoer) => (
              <tr key={sudoer.cuId}>
                <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{sudoer.cuId}</td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{sudoer.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h2 className="text-xl mb-2">一般管理者</h2>
        <table className="ml-4 table-auto border-collapse border border-gray-600">
          <thead>
            <tr>
              <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">ID</th>
              <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">ロール</th>
              <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日</th>
              <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">最終更新日</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId}>
                <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.userId}</td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.roles.join(', ')}</td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.createdAt.toLocaleString()}</td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.updatedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
