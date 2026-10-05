'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { JSX } from 'react';

export default function NewPostForm({
  users,
  onCreate,
}: {
  users: { id: number; name: string; displayName: string | null }[];
  onCreate: (authorId: number, slug: string, title: string) => Promise<number>;
}): JSX.Element {
  const router = useRouter();
  const [authorId, setAuthorId] = useState<number>(0);
  const [slug, setSlug] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setIsCreating(true);
        const postId = await onCreate(authorId, slug, title);
        setIsCreating(false);
        router.push(`./${postId}`);
      }}
      className="flex flex-col gap-4 py-4"
    >
      <select
        value={authorId}
        onChange={(e) => setAuthorId(Number(e.target.value))}
        className="border p-2"
      >
        <option value={0}>著者を選択</option>
        {users.map((user) => (
          <option key={user.id} value={user.id} className="bg-gray-700">
            {`${user.name}${user.displayName ? ` (${user.displayName})` : ''}`}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="スラッグ"
        className="border p-2"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル"
        className="border p-2"
      />
      <button
        type="submit"
        disabled={isCreating}
        className="bg-blue-500 text-white p-2 rounded"
      >
        {isCreating ? '作成中...' : '作成'}
      </button>
    </form>
  );
}
