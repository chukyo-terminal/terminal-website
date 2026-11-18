'use client';

import { useEffect, useRef, useState } from 'react';

import { Plus, Trash2, Pen } from 'lucide-react';

import { USER_ROLES } from '../_lib/user';
import Modal from '@/components/elements/modal';

import type { JSX } from 'react';
import type { Sudoer, User, UserCreateFormValues, UserRole, UserUpdateFormValues } from '../_lib/user';
import type { ActionResult } from '@/types';


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
 * 上級管理者用のユーザー管理画面を生成する。
 *
 * @param props - 初期表示するユーザー・上級管理者と、それらを操作するServer Action
 * @returns 生成した画面
 */
export default function UserManager({
  initialUsers,
  initialSudoers,
  onCreateSudoer,
  onDeleteSudoer,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}: {
  initialUsers: User[];
  initialSudoers: Sudoer[];
  onCreateSudoer: (userId: number) => Promise<ActionResult<Sudoer>>;
  onDeleteSudoer: (userId: number) => Promise<ActionResult>;
  onCreateUser: (values: UserCreateFormValues) => Promise<ActionResult<User>>;
  onUpdateUser: (userId: number, values: UserUpdateFormValues) => Promise<ActionResult<User>>;
  onDeleteUser: (userId: number) => Promise<ActionResult>;
}): JSX.Element {
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetId = useRef(0);
  const [sudoers, setSudoers] = useState<Sudoer[]>(initialSudoers);
  const [users, setUsers] = useState<User[]>(initialUsers);
  // 編集モーダル用
  const [editRoles, setEditRoles] = useState<UserRole[]>([]);

  // 編集対象ユーザー変更時にロール初期化
  useEffect(() => {
    if (modalType === ModalType.EDIT_USER) {
      const user = users.find(u => u.id === targetId.current);
      if (user) setEditRoles(user.roles);
    }
  }, [modalType, users]);

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
                const result = await onCreateSudoer(selectedUserId);
                if (result.ok) {
                  console.info('Successfully added sudoer');
                  setSudoers((previous) => [...previous, result.data].toSorted((a, b) => a.id - b.id));
                  setModalType(null);
                } else {
                  console.error('Failed to add sudoer:', result.error);
                  alert(result.error);
                }
              } catch (e) {
                console.error('Failed to add sudoer:', e);
                alert('上級管理者の追加に失敗しました。');
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
                const id = targetId.current;
                const result = await onDeleteSudoer(id);
                if (result.ok) {
                  console.info('Successfully removed sudoer');
                  setSudoers((previous) => previous.filter((sudoer) => sudoer.id !== id));
                  setModalType(null);
                } else {
                  console.error('Failed to remove sudoer:', result.error);
                  alert(result.error);
                }
              } catch (e) {
                console.error('Failed to remove sudoer:', e);
                alert('上級管理者の削除に失敗しました。');
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                {/* eslint-disable-next-line react-hooks/refs*/}
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
                // eslint-disable-next-line react-hooks/refs
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
                const result = await onCreateUser({ cuId, name, roles });
                if (result.ok) {
                  console.info('Successfully added user');
                  setUsers((previous) => [...previous, result.data].toSorted((a, b) => a.id - b.id));
                  setModalType(null);
                } else {
                  console.error('Failed to add user:', result.error);
                  alert(result.error);
                }
              } catch (e) {
                console.error('Failed to add user:', e);
                alert('一般管理者の追加に失敗しました。');
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
        // eslint-disable-next-line react-hooks/refs
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
                  setIsSubmitting(true);
                  try {
                    const result = await onUpdateUser(user.id, { name, displayName, email, roles, isActive });
                    if (result.ok) {
                      console.info('Successfully edited user');
                      setUsers((previous) => previous.map((current) => (current.id === user.id ? result.data : current)));
                      setModalType(null);
                    } else {
                      console.error('Failed to edit user:', result.error);
                      alert(result.error);
                    }
                  } catch (e) {
                    console.error('Failed to edit user:', e);
                    alert('一般管理者の編集に失敗しました。');
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
                              setEditRoles(editRoles.filter(r => r !== role));
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
                const id = targetId.current;
                const result = await onDeleteUser(id);
                if (result.ok) {
                  console.info('Successfully removed user');
                  setUsers((previous) => previous.filter((current) => current.id !== id));
                  // users削除時はDB側でsudoersもcascade deleteされるため、UI側も同期する。
                  setSudoers((previous) => previous.filter((sudoer) => sudoer.id !== id));
                  setModalType(null);
                } else {
                  console.error('Failed to remove user:', result.error);
                  alert(result.error);
                }
              } catch (e) {
                console.error('Failed to remove user:', e);
                alert('一般管理者の削除に失敗しました。');
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span className="absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2">削除対象: </span>
                {/* eslint-disable-next-line react-hooks/refs */}
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
                // eslint-disable-next-line react-hooks/refs
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
