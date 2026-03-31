'use client';

import { useEffect, useRef, useState } from 'react';

import { Plus, Trash2, Pen } from 'lucide-react';
import { z } from 'zod';

import Modal from '@/components/elements/modal';
import { SudoersApiGetResponseSchema, SudoersApiPostResponseSchema } from '@/api-schemas/sudoers';
import { UsersApiGetResponseSchema, UsersApiPatchResponseSchema, UsersApiPostResponseSchema } from '@/api-schemas/users';
import { api } from '@/lib/hono';

import type { JSX } from 'react';


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

const USER_ROLES = ['ADMIN', 'REVIEWER', 'CONTRIBUTOR'] as const;

type UserRole = (typeof USER_ROLES)[number];


/**
 * 上級管理者ページを生成する。
 *
 * @returns 生成したページ
 */
export default function RootControlPage(): JSX.Element {
  const [isReload, setReload] = useState(true);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetId = useRef(0);
  const [sudoers, setSudoers] = useState<z.infer<typeof SudoersApiGetResponseSchema>['data']['sudoers']>([]);
  const [users, setUsers] = useState<z.infer<typeof UsersApiGetResponseSchema>['data']['users']>([]);
  // 編集モーダル用
  const [editRoles, setEditRoles] = useState<UserRole[]>([]);

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
        const usersResponse = await api.users.$get();
        const sudoersResponse = await api.sudoers.$get();
        if (!sudoersResponse.ok || !usersResponse.ok) {
          throw new Error('Failed to fetch data');
        }
        // eslint-disable-next-line unicorn/no-await-expression-member
        const usersData = (await UsersApiGetResponseSchema.parseAsync(await usersResponse.json())).data.users;
        // eslint-disable-next-line unicorn/no-await-expression-member
        const sudoersData = (await SudoersApiGetResponseSchema.parseAsync(await sudoersResponse.json())).data.sudoers;
        setSudoers(sudoersData);
        setUsers(usersData);
      } catch (e) {
        console.error('Error fetching data:', e);
      } finally {
        setReload(false);
      }
    })();
  }, [isReload]);

  const sudoerCandidateUsers = users.filter((user) => !sudoers.some((sudoer) => sudoer.id === user.id));

  return (
    <div className="mx-auto px-4 py-8">
      {modalType === ModalType.ADD_SUDOER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="上級管理者追加">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;
              const formData = new FormData(event.target as HTMLFormElement);
              const selectedUserId = Number(formData.get('userId'));
              if (Number.isNaN(selectedUserId)) {
                alert('ユーザーを選択してください。');
                return;
              }
              setIsSubmitting(true);
              try {
                const response = await api.sudoers.$post({
                  json: {
                    user: {
                      id: selectedUserId,
                    },
                  },
                });
                if (response.ok) {
                  // eslint-disable-next-line unicorn/no-await-expression-member
                  const createdAt = (await SudoersApiPostResponseSchema.parseAsync(await response.json())).data.createdAt;
                  console.info('Successfully added sudoer');
                  setSudoers((previous) => [...previous, { id: selectedUserId, createdAt }].sort((a, b) => a.id - b.id));
                  setModalType(null);
                } else {
                  console.error('Failed to add sudoer:', response.status, response.statusText);
                  const responseText = await response.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('上級管理者の追加に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-4"
          >
            <label className="block">
              <span className="text-sm font-medium">ユーザー</span>
              <select
                name="userId"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                defaultValue=""
                required
              >
                <option value="" disabled>ユーザーを選択</option>
                {sudoerCandidateUsers.map((user) => (
                  <option key={user.id} value={user.id}>{`${user.cuId} (${user.name})`}</option>
                ))}
              </select>
            </label>
            {sudoerCandidateUsers.length === 0 &&
              <p className="text-sm text-red-700">追加可能な一般管理者がいません。</p>
            }
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isSubmitting || sudoerCandidateUsers.length === 0}
              >追加</button>
            </div>
          </form>
        </Modal>
      }
      {modalType === ModalType.REMOVE_SUDOER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="上級管理者削除">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;
              setIsSubmitting(true);
              try {
                const response = await api.sudoers[':id'].$delete({
                  param: { id: String(targetId.current) },
                });
                if (response.ok) {
                  console.info('Successfully removed sudoer');
                  console.log(await response.json());
                  setSudoers((previous) => previous.filter((sudoer) => sudoer.id !== targetId.current));
                  setModalType(null);
                } else {
                  console.error('Failed to remove sudoer:', response.status, response.statusText);
                  const responseText = await response.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('上級管理者の削除に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                <span className="font-mono text-2xl text-red-700">{users.find(u => u.id === targetId.current)?.cuId ?? ''}</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                value={targetId.current}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                disabled={isSubmitting}
              >削除</button>
            </div>
          </form>
        </Modal>
      }
      {modalType === ModalType.ADD_USER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="一般管理者追加">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;
              const formData = new FormData(event.target as HTMLFormElement);
              const cuId = formData.get('cuId') as string;
              const name = formData.get('name') as string;
              const roles = [...formData.getAll('role')]
                .filter((role): role is UserRole => USER_ROLES.includes(role as UserRole));
              setIsSubmitting(true);
              try {
                const createResponse = await api.users.$post({
                  json: { cuId, name, roles },
                });
                if (createResponse.ok) {
                  // eslint-disable-next-line unicorn/no-await-expression-member
                  const userData = (await UsersApiPostResponseSchema.parseAsync(await createResponse.json())).data.user;
                  console.info('Successfully added user');
                  setUsers((previous) => [
                    ...previous,
                    {
                      id: userData.id,
                      cuId,
                      name,
                      displayName: null,
                      email: null,
                      roles,
                      // POST時はログイン可否を設定しないため、DBデフォルト値を採用する。
                      isActive: true,
                      createdAt: userData.createdAt,
                      updatedAt: userData.updatedAt,
                    },
                  ].sort((a, b) => a.id - b.id));
                  setModalType(null);
                } else {
                  console.error('Failed to add user:', createResponse.status, createResponse.statusText);
                  const responseText = await createResponse.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('一般管理者の追加に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-4"
          >
            <label className="block">
              <span className="text-sm font-medium">ID</span>
              <input
                type="text"
                name="cuId"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="CU_IDを入力"
                autoFocus
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">名前</span>
              <input
                type="text"
                name="name"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="名前を入力"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">ロール</span>
              <div className="mt-2 flex flex-col gap-2">
                {USER_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="role"
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
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isSubmitting}
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
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (isSubmitting) return;
                  const formData = new FormData(event.target as HTMLFormElement);
                  const name = formData.get('name') as string;
                  const displayName = formData.get('displayName') as string | null;
                  const email = formData.get('email') as string | null;
                  const isActive = formData.get('isActive') !== null;
                  const roles = editRoles;
                  const normalizedDisplayName = displayName && displayName.trim() !== '' ? displayName : null;
                  const normalizedEmail = email && email.trim() !== '' ? email : null;
                  setIsSubmitting(true);
                  try {
                    const response = await api.users[':userId'].$patch({
                      param: { userId: String(user.id) },
                      json: {
                        name,
                        displayName: normalizedDisplayName,
                        email: normalizedEmail,
                        roles,
                        isActive,
                      },
                    });
                    if (response.ok) {
                      // eslint-disable-next-line unicorn/no-await-expression-member
                      const updatedAt = (await UsersApiPatchResponseSchema.parseAsync(await response.json())).data.updatedAt;
                      console.info('Successfully edited user');
                      // eslint-disable-next-line sonarjs/no-nested-functions
                      setUsers((previous) => previous.map((current) => {
                        if (current.id !== user.id) {
                          return current;
                        }
                        return {
                          ...current,
                          name,
                          displayName: normalizedDisplayName,
                          email: normalizedEmail,
                          roles,
                          isActive,
                          updatedAt,
                        };
                      }));
                      setModalType(null);
                    } else {
                      console.error('Failed to edit user:', response.status, response.statusText);
                      const responseText = await response.text();
                      try {
                        console.log(JSON.parse(responseText));
                      } catch {
                        console.log(responseText);
                      }
                      alert('一般管理者の編集に失敗しました。');
                    }
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="flex flex-col gap-4"
              >
                <label className="block">
                  <span className="text-sm font-medium">CU_ID</span>
                  <input
                    type="text"
                    name="cuId"
                    className="mt-1 block w-full rounded border border-gray-500 px-3 py-2 text-gray-500 cursor-not-allowed"
                    value={user.cuId}
                    readOnly
                    disabled
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">名前</span>
                  <input
                    type="text"
                    name="name"
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="名前を入力"
                    defaultValue={user.name ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">表示名</span>
                  <input
                    type="text"
                    name="displayName"
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="表示名を入力"
                    defaultValue={user.displayName ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">メールアドレス</span>
                  <input
                    type="email"
                    name="email"
                    className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="メールアドレスを入力"
                    defaultValue={user.email ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">ロール</span>
                  <div className="mt-2 flex flex-col gap-2">
                    {USER_ROLES.map(role => (
                      <label key={role} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="role"
                          value={role}
                          checked={editRoles.includes(role)}
                          onChange={e => {
                            if (e.target.checked) {
                              setEditRoles([...editRoles, role]);
                            } else {
                              setEditRoles(editRoles.filter(r => r !== role)); // eslint-disable-line sonarjs/no-nested-functions
                            }
                          }}
                        />
                        <span className="text-sm">{role}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={user.isActive}
                  />
                  <span className="text-sm font-medium">ログイン許可</span>
                </label>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 mr-auto"
                    disabled={isSubmitting}
                    onClick={() => {
                      setModalType(ModalType.REMOVE_USER);
                    }}
                  >削除</button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                    disabled={isSubmitting}
                    onClick={() => setModalType(null)}
                  >キャンセル</button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    disabled={isSubmitting}
                  >編集</button>
                </div>
              </form>
            </Modal>
          );
        })()
      }
      {modalType === ModalType.REMOVE_USER &&
        <Modal isOpen={true} onRequestClose={() => setModalType(null)} contentLabel="一般管理者削除">
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;
              setIsSubmitting(true);
              try {
                const response = await api.users[':userId'].$delete({
                  param: { userId: String(targetId.current) },
                });
                if (response.ok) {
                  console.info('Successfully removed user');
                  console.log(await response.json());
                  setUsers((previous) => previous.filter((current) => current.id !== targetId.current));
                  // users削除時はDB側でsudoersもcascade deleteされるため、UI側も同期する。
                  setSudoers((previous) => previous.filter((sudoer) => sudoer.id !== targetId.current));
                  setModalType(null);
                } else {
                  console.error('Failed to remove user:', response.status, response.statusText);
                  const responseText = await response.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('一般管理者の削除に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                <span className="font-mono text-2xl text-red-700">{users.find(u => u.id === targetId.current)?.cuId ?? ''}</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >キャンセル</button>
              <button
                type="submit"
                value={targetId.current}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                disabled={isSubmitting}
              >削除</button>
            </div>
          </form>
        </Modal>
      }
      <h1 className="md:mt-8 text-2xl font-bold mb-4">ユーザー管理</h1>
      <div className="mb-4">
        <h2 className="text-xl mb-2">上級管理者</h2>
        <div className="overflow-x-auto w-full">
          <table className="ml-4 table-auto border-collapse border border-gray-600 min-w-max">
            <thead>
              <tr>
                <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">CU_ID</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">名前</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日時</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-0 py-0 text-center border-solid w-12 h-12 min-w-12 min-h-12">
                  <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                    <button
                      type="button"
                      disabled={isSubmitting}
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
                <tr key={sudoer.id}>
                  <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{users.find(u => u.id === sudoer.id)?.cuId ?? ''}</td>
                  <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{users.find(u => u.id === sudoer.id)?.name ?? ''}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{sudoer.createdAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-0 py-0 text-center w-12 h-12 min-w-12 min-h-12">
                    <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                      <button
                        type="button"
                        disabled={isSubmitting}
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
                <th className="border-t border-b-4 border-l border-gray-600 border-r px-6 py-2 text-center border-solid">CU_ID</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">名前</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">表示名</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">メールアドレス</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">ロール</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">ログイン許可</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">登録日時</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-6 py-2 text-center border-solid">最終更新日時</th>
                <th className="border-t border-b-4 border-r border-gray-600 px-0 py-0 text-center border-solid w-12 h-12 min-w-12 min-h-12">
                  <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                    <button
                      type="button"
                      disabled={isSubmitting}
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
                <tr key={user.id}>
                  <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.cuId}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.name}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.displayName || ''}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.email || ''}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.roles.join(', ')}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.isActive ? '許可' : '拒否'}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.createdAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">{user.updatedAt.toLocaleString()}</td>
                  <td className="border-b border-t border-r border-gray-600 px-0 py-0 text-center w-12 h-12 min-w-12 min-h-12">
                    <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                      <button
                        type="button"
                        disabled={isSubmitting}
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
