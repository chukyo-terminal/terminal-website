'use client';

import { useEffect, useRef, useState } from 'react';

import { Plus, Trash2, Pen } from 'lucide-react';

import Modal from '@/components/elements/modal';

import type { JSX } from 'react';

import type { sudoersApiGetResponse } from '@/app/api/sudoers/route';
import type { usersApiGetResponse } from '@/app/api/users/route';


/**
 * 管理者ページのモーダルタイプを定義する。
 */
enum ModalType {
  ADD_SUDOER,
  REMOVE_SUDOER,
  ADD_USER,
  EDIT_USER,
  REMOVE_USER,
}


/**
 * Root管理者ページを生成する。
 *
 * @returns 生成したページ
 */
export default function RootControlPage(): JSX.Element {
  const [isReload, setReload] = useState(true);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const targetId = useRef(0);
  const [sudoers, setSudoers] = useState<Array<{ id: number; cuId: string; createdAt: Date }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; userId: string; roles: string[]; createdAt: Date; updatedAt: Date }>>([]);
  // パスワード表示切替
  const [showPassword, setShowPassword] = useState(false);
  // 編集モーダル用
  const [editPassword, setEditPassword] = useState("");
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editRoles, setEditRoles] = useState<string[]>([]);

  // 編集対象ユーザー変更時にロール初期化
  useEffect(() => {
    if (modalType === ModalType.EDIT_USER) {
      const user = users.find(u => u.id === targetId.current);
      if (user) setEditRoles(user.roles);
    }
  }, [modalType, users]);

  useEffect(() => {
    (async () => {
      if (!isReload) return;
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
  }, [isReload]);

  return (
    <div className="mx-auto px-4 py-8">
      {modalType === ModalType.ADD_SUDOER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="Root管理者追加">
          <form className="flex flex-col gap-4">
            <label className="block">
              <span className="text-sm font-medium">CU_ID</span>
              <input
                type="text"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="CU_IDを入力"
                autoFocus
                required
              />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >追加</button>
            </div>
          </form>
        </Modal>
      }
      {modalType === ModalType.REMOVE_SUDOER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="Root管理者削除">
          <form className="flex flex-col gap-2">
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                <span className="font-mono text-2xl text-red-700">{sudoers.find(s => s.id === targetId.current)?.cuId ?? ''}</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                value={targetId.current}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >削除</button>
            </div>
          </form>
        </Modal>
      }
      {modalType === ModalType.ADD_USER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="一般管理者追加">
          <form className="flex flex-col gap-4">
            <label className="block">
              <span className="text-sm font-medium">ID</span>
              <input
                type="text"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="IDを入力"
                autoFocus
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">パスワード</span>
              <input
                type={showPassword ? "text" : "password"}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="パスワードを入力"
                required
              />
              <div className="mt-2 flex items-center gap-2 justify-end">
                <input
                  type="checkbox"
                  id="showPasswordAddUser"
                  checked={showPassword}
                  onChange={e => setShowPassword(e.target.checked)}
                />
                <label htmlFor="showPasswordAddUser" className="text-sm select-none cursor-pointer">パスワードを表示</label>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">ロール</span>
              <div className="mt-2 flex flex-col gap-2">
                {['ADMIN', 'REVIEWER', 'CONTRIBUTOR'].map(role => (
                  <label key={role} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={role}
                    />
                    <span className="text-sm">{role}</span>
                  </label>
                ))}
              </div>
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >追加</button>
            </div>
          </form>
        </Modal>
      }
      {modalType === ModalType.EDIT_USER &&
        (() => {
          const user = users.find(u => u.id === targetId.current);
          if (!user) return null;
          return (
            <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="一般管理者編集">
              <form className="flex flex-col gap-4">
                <label className="block">
                  <span className="text-sm font-medium">ID</span>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded border border-gray-500 px-3 py-2 text-gray-500 cursor-not-allowed"
                    value={user.userId}
                    readOnly
                    disabled
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">パスワード</span>
                  <input
                    type={editShowPassword ? "text" : "password"}
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="新しいパスワードを入力"
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                  />
                  <div className="mt-2 flex items-center gap-2 justify-end">
                    <input
                      type="checkbox"
                      id="showPasswordEditUser"
                      checked={editShowPassword}
                      onChange={e => setEditShowPassword(e.target.checked)}
                    />
                    <label htmlFor="showPasswordEditUser" className="text-sm select-none cursor-pointer">パスワードを表示</label>
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">ロール</span>
                  <div className="mt-2 flex flex-col gap-2">
                    {["ADMIN", "REVIEWER", "CONTRIBUTOR"].map(role => (
                      <label key={role} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          value={role}
                          checked={editRoles.includes(role)}
                          onChange={e => {
                            if (e.target.checked) {
                              setEditRoles([...editRoles, role]);
                            } else {
                              setEditRoles(editRoles.filter(r => r !== role));
                            }
                          }}
                        />
                        <span className="text-sm">{role}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 mr-auto"
                    onClick={() => {
                      setModalType(ModalType.REMOVE_USER);
                    }}
                  >削除</button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                    onClick={() => setModalType(null)}
                  >キャンセル</button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    disabled={editRoles.length === 0}
                  >編集</button>
                </div>
              </form>
            </Modal>
          );
        })()
      }
      {modalType === ModalType.REMOVE_USER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="一般管理者削除">
          <form className="flex flex-col gap-2">
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                <span className="font-mono text-2xl text-red-700">{users.find(u => u.id === targetId.current)?.userId ?? ''}</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                value={targetId.current}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >削除</button>
            </div>
          </form>
        </Modal>
      }
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
                      onClick={(event) => {
                        event.stopPropagation();
                        setModalType(ModalType.ADD_SUDOER);
                      }}
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
                        value={sudoer.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          targetId.current = sudoer.id;
                          setModalType(ModalType.REMOVE_SUDOER);
                        }}
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
                      onClick={(event) => {
                        event.stopPropagation();
                        setModalType(ModalType.ADD_USER);
                      }}
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
                        value={user.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          targetId.current = user.id;
                          setModalType(ModalType.EDIT_USER);
                        }}
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
