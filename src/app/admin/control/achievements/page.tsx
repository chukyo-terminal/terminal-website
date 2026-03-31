'use client';

import { useEffect, useRef, useState } from 'react';

import { Pen, Plus } from 'lucide-react';
import { z } from 'zod';

import {
  AchievementsApiGetResponseSchema,
  AchievementsApiPatchResponseSchema,
  AchievementsApiPostResponseSchema,
} from '@/api-schemas/achievements';
import Modal from '@/components/elements/modal';
import { api } from '@/lib/hono';

import type { JSX } from 'react';

/**
 * 実績管理ページのモーダルタイプを定義する。
 */
enum ModalType {
  ADD_ACHIEVEMENT,
  EDIT_ACHIEVEMENT,
  REMOVE_ACHIEVEMENT,
}

type Achievement = z.infer<typeof AchievementsApiGetResponseSchema>['data']['achievements'][number];

/**
 * 日付をinput[type="date"]向けの文字列に整形する。
 */
function formatDateForInput(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * YYYY-MM-DDをAPIに渡すISO文字列へ変換する。
 */
function toIsoDateTime(value: string): string {
  return `${value}T12:00:00.000Z`;
}

/**
 * 日付降順で実績を並べる。
 */
function sortAchievementsByDateDesc(achievements: Achievement[]): Achievement[] {
  return [...achievements].sort((a, b) => {
    const dateDiff = b.date.getTime() - a.date.getTime();
    return dateDiff !== 0 ? dateDiff : b.id - a.id;
  });
}

/**
 * 実績管理ページを生成する。
 *
 * @returns 生成したページ
 */
export default function AchievementsControlPage(): JSX.Element {
  const [isReload, setReload] = useState(true);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetId = useRef(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    (async () => {
      if (!isReload) return;
      try {
        const response = await api.achievements.$get();
        if (!response.ok) {
          throw new Error('Failed to fetch achievements');
        }
        const parsedResponse =
          await AchievementsApiGetResponseSchema.parseAsync(await response.json());
        const achievementData = parsedResponse.data.achievements;
        setAchievements(sortAchievementsByDateDesc(achievementData));
      } catch (e) {
        console.error('Error fetching achievements:', e);
      } finally {
        setReload(false);
      }
    })();
  }, [isReload]);

  return (
    <div className="mx-auto px-4 py-8">
      {modalType === ModalType.ADD_ACHIEVEMENT &&
        <Modal
          isOpen={true}
          onRequestClose={() => setModalType(null)}
          contentLabel="実績追加"
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;

              const formData = new FormData(event.target as HTMLFormElement);
              const title = (formData.get('title') as string).trim();
              const description = (formData.get('description') as string).trim();
              const date = formData.get('date') as string;

              if (description === '') {
                alert('説明を入力してください。');
                return;
              }

              setIsSubmitting(true);
              try {
                const response = await api.achievements.$post({
                  json: {
                    title,
                    description,
                    postId: null,
                    date: toIsoDateTime(date),
                  },
                });

                if (response.ok) {
                  const parsedResponse =
                    await AchievementsApiPostResponseSchema.parseAsync(await response.json());
                  const data = parsedResponse.data;
                  console.info('Successfully added achievement');
                  setAchievements((previous) => sortAchievementsByDateDesc([
                    ...previous,
                    {
                      id: data.id,
                      title,
                      description,
                      post: null,
                      date: new Date(toIsoDateTime(date)),
                      createdAt: data.createdAt,
                      updatedAt: data.createdAt,
                    },
                  ]));
                  setModalType(null);
                } else {
                  console.error(
                    'Failed to add achievement:',
                    response.status,
                    response.statusText,
                  );
                  const responseText = await response.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('実績の追加に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-4"
          >
            <label className="block">
              <span className="text-sm font-medium">タイトル</span>
              <input
                type="text"
                name="title"
                className={
                  'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }
                placeholder="実績タイトルを入力"
                autoFocus
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">説明</span>
              <textarea
                name="description"
                className={
                  'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }
                placeholder="実績の説明を入力"
                rows={4}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">日付</span>
              <input
                type="date"
                name="date"
                className={
                  'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                  'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }
                required
              />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={isSubmitting}
              >
                追加
              </button>
            </div>
          </form>
        </Modal>
      }

      {modalType === ModalType.EDIT_ACHIEVEMENT &&
        (() => {
          const achievement = achievements.find((current) => current.id === targetId.current);
          if (!achievement) return null;

          return (
            <Modal
              isOpen={true}
              onRequestClose={() => setModalType(null)}
              contentLabel="実績編集"
            >
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (isSubmitting) return;

                  const formData = new FormData(event.target as HTMLFormElement);
                  const title = (formData.get('title') as string).trim();
                  const description = (formData.get('description') as string).trim();
                  const date = formData.get('date') as string;

                  if (description === '') {
                    alert('説明を入力してください。');
                    return;
                  }

                  setIsSubmitting(true);
                  try {
                    const response = await api.achievements[':id'].$patch({
                      param: { id: String(achievement.id) },
                      json: {
                        title,
                        description,
                        postId: achievement.post?.id ?? null,
                        date: toIsoDateTime(date),
                      },
                    });

                    if (response.ok) {
                      const parsedResponse =
                        await AchievementsApiPatchResponseSchema.parseAsync(await response.json());
                      const updatedAt = parsedResponse.data.updatedAt;
                      console.info('Successfully edited achievement');
                      // eslint-disable-next-line sonarjs/no-nested-functions
                      setAchievements((previous) => sortAchievementsByDateDesc(previous.map((current) => {
                        if (current.id !== achievement.id) {
                          return current;
                        }
                        return {
                          ...current,
                          title,
                          description,
                          date: new Date(toIsoDateTime(date)),
                          updatedAt,
                        };
                      })));
                      setModalType(null);
                    } else {
                      console.error(
                        'Failed to edit achievement:',
                        response.status,
                        response.statusText,
                      );
                      const responseText = await response.text();
                      try {
                        console.log(JSON.parse(responseText));
                      } catch {
                        console.log(responseText);
                      }
                      alert('実績の編集に失敗しました。');
                    }
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="flex flex-col gap-4"
              >
                <label className="block">
                  <span className="text-sm font-medium">タイトル</span>
                  <input
                    type="text"
                    name="title"
                    className={
                      'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                    }
                    defaultValue={achievement.title}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">説明</span>
                  <textarea
                    name="description"
                    className={
                      'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                    }
                    defaultValue={achievement.description ?? ''}
                    rows={4}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">関連投稿</span>
                  <input
                    type="text"
                    name="postSlug"
                    className={
                      'mt-1 block w-full rounded border border-gray-500 px-3 py-2 ' +
                      'text-gray-500 cursor-not-allowed'
                    }
                    value={achievement.post?.slug ?? ''}
                    readOnly
                    disabled
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">日付</span>
                  <input
                    type="date"
                    name="date"
                    className={
                      'mt-1 block w-full rounded border border-gray-300 px-3 py-2 ' +
                      'focus:outline-none focus:ring-2 focus:ring-emerald-500'
                    }
                    defaultValue={formatDateForInput(achievement.date)}
                    required
                  />
                </label>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 mr-auto"
                    disabled={isSubmitting}
                    onClick={() => setModalType(ModalType.REMOVE_ACHIEVEMENT)}
                  >
                    削除
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                    disabled={isSubmitting}
                    onClick={() => setModalType(null)}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    disabled={isSubmitting}
                  >
                    編集
                  </button>
                </div>
              </form>
            </Modal>
          );
        })()
      }

      {modalType === ModalType.REMOVE_ACHIEVEMENT &&
        <Modal
          isOpen={true}
          onRequestClose={() => setModalType(null)}
          contentLabel="実績削除"
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (isSubmitting) return;

              setIsSubmitting(true);
              try {
                const response = await api.achievements[':id'].$delete({
                  param: { id: String(targetId.current) },
                });

                if (response.ok) {
                  console.info('Successfully removed achievement');
                  setAchievements((previous) =>
                    previous.filter((achievement) => achievement.id !== targetId.current)
                  );
                  setModalType(null);
                } else {
                  console.error(
                    'Failed to remove achievement:',
                    response.status,
                    response.statusText,
                  );
                  const responseText = await response.text();
                  try {
                    console.log(JSON.parse(responseText));
                  } catch {
                    console.log(responseText);
                  }
                  alert('実績の削除に失敗しました。');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="mt-2 flex justify-center">
              <span className="relative inline-flex items-baseline">
                <span
                  className={
                    'absolute right-full mr-2 text-md whitespace-nowrap top-1/2 -translate-y-1/2'
                  }
                >
                  削除対象:
                </span>
                <span className="font-mono text-2xl text-red-700">
                  {achievements.find((achievement) => achievement.id === targetId.current)?.title ?? ''}
                </span>
              </span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded bg-gray-400 hover:bg-gray-500"
                disabled={isSubmitting}
                onClick={() => setModalType(null)}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                disabled={isSubmitting}
              >
                削除
              </button>
            </div>
          </form>
        </Modal>
      }

      <h1 className="md:mt-8 text-2xl font-bold mb-4">活動実績管理</h1>
      <div className="overflow-x-auto w-full">
        <table className="ml-4 table-auto border-collapse border border-gray-600 min-w-max">
          <thead>
            <tr>
              <th
                className={
                  'border-t border-b-4 border-l border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                タイトル
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                説明
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                関連投稿
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                日付
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                登録日時
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 ' +
                  'px-6 py-2 text-center border-solid'
                }
              >
                最終更新日時
              </th>
              <th
                className={
                  'border-t border-b-4 border-r border-gray-600 px-0 py-0 text-center ' +
                  'border-solid w-12 h-12 min-w-12 min-h-12'
                }
              >
                <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={(event) => {
                      event.stopPropagation();
                      setModalType(ModalType.ADD_ACHIEVEMENT);
                    }}
                    className={
                      'bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded w-8 h-8 ' +
                      'flex items-center justify-center transition-colors duration-200'
                    }
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {achievements.map((achievement) => (
              <tr key={achievement.id}>
                <td className="border-l border-b border-t border-r border-gray-600 px-6 py-2 text-center">
                  {achievement.title}
                </td>
                <td
                  className={
                    'border-b border-t border-r border-gray-600 px-6 py-2 text-center ' +
                    'max-w-sm whitespace-pre-wrap'
                  }
                >
                  {achievement.description ?? ''}
                </td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">
                  {achievement.post?.slug ?? ''}
                </td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">
                  {formatDateForInput(achievement.date)}
                </td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">
                  {achievement.createdAt.toLocaleString()}
                </td>
                <td className="border-b border-t border-r border-gray-600 px-6 py-2 text-center">
                  {achievement.updatedAt.toLocaleString()}
                </td>
                <td
                  className={
                    'border-b border-t border-r border-gray-600 px-0 py-0 text-center ' +
                    'w-12 h-12 min-w-12 min-h-12'
                  }
                >
                  <div className="flex justify-center items-center w-12 h-12 min-w-12 min-h-12">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={(event) => {
                        event.stopPropagation();
                        targetId.current = achievement.id;
                        setModalType(ModalType.EDIT_ACHIEVEMENT);
                      }}
                      className={
                        'bg-blue-600 hover:bg-blue-700 text-white font-medium rounded w-8 h-8 ' +
                        'flex items-center justify-center transition-colors duration-200'
                      }
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
  );
}
