'use client';

import { useEffect, useState } from 'react';

import { Plus, Trash2, Pen } from 'lucide-react';

import type { JSX } from 'react';

import type { sudoersApiGetResponse } from '@/app/api/sudoers/route';
import type { usersApiGetResponse } from '@/app/api/users/route';


/**
 * Root管理者ページを生成する。
 *
 * @returns 生成したページ
 */
export default function RootControlPage(): JSX.Element {
  const [reload, setReload] = useState(true);
  const [sudoers, setSudoers] = useState<Array<{ cuId: string; createdAt: Date }>>([]);
  const [users, setUsers] = useState<Array<{ userId: string; roles: string[]; createdAt: Date; updatedAt: Date }>>([]);

  useEffect(() => {
    (async () => {
      if (!reload) return;
      try {
        const sudoersResponse = await fetch('/api/sudoers');
        const usersResponse = await fetch('/api/users');
        if (!sudoersResponse.ok || !usersResponse.ok) {
          throw new Error('Failed to fetch data');
        }
        const sudoersData: sudoersApiGetResponse = await sudoersResponse.json();
        const usersData: usersApiGetResponse = await usersResponse.json();
        setSudoers(sudoersData.map((sudoer) => ({ ...sudoer, createdAt: new Date(sudoer.createdAt) })));
        setUsers(usersData.map((user) => ({ ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt) })));
      } catch (e) {
        console.error('Error fetching data:', e);
      } finally {
        setReload(false);
      }
    })();
  }, [reload]);

  return (
    <div className="mx-auto px-4 py-8">
      <h1 className="md:mt-8 text-2xl font-bold mb-4">ユーザー管理</h1>
      <div className="mb-4">
        <h2 className="text-xl mb-2">Root管理者</h2>
        <div className="overflow-x-auto w-full">
          <table className="ml-4 table-auto border-collapse border border-gray-600 min-w-max">
            <thead>
              <tr>
                <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">CU_ID</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-0 py-0 text-center border-solid w-12 h-12 min-w-12 min-h-12">
                  <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                    <button
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded w-8 h-8 flex items-center justify-center transition-colors duration-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sudoers.map((sudoer) => (
                <tr key={sudoer.cuId}>
                  <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{sudoer.cuId}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{sudoer.createdAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-0 py-0 text-center w-12 h-12 min-w-12 min-h-12">
                    <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                      <button
                        type="button"
                        className="bg-red-600 hover:bg-red-700 text-white font-medium rounded w-8 h-8 flex items-center justify-center transition-colors duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h2 className="text-xl mb-2">一般管理者</h2>
        <div className="overflow-x-auto w-full">
          <table className="ml-4 table-auto border-collapse border border-gray-600 min-w-max">
            <thead>
              <tr>
                <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">ID</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">ロール</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">最終更新日</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-0 py-0 text-center border-solid w-12 h-12 min-w-12 min-h-12">
                  <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                    <button
                      type="button"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded w-8 h-8 flex items-center justify-center transition-colors duration-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.userId}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.roles.join(', ')}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.createdAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.updatedAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-0 py-0 text-center w-12 h-12 min-w-12 min-h-12">
                    <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                      <button
                        type="button"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded w-8 h-8 flex items-center justify-center transition-colors duration-200"
                      >
                        <Pen className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
