'use client';

import { useState } from 'react';

import type { JSX } from 'react';

export default function Editor({
  title,
  description,
  authorId,
  slug,
  isPrivate,
  content,
  onSave,
  onPublish,
}: {
  title: string;
  description: string | null;
  authorId: number;
  slug: string;
  isPrivate: boolean;
  content: string;
  onSave: (data: { title: string; description: string | null; authorId: number; slug: string; isPrivate: boolean; content: string }) => Promise<void>;
  onPublish: () => Promise<void>;
}): JSX.Element {
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);
  const [localSlug, setLocalSlug] = useState(slug);
  const [localIsPrivate, setLocalIsPrivate] = useState(isPrivate);
  const [localContent, setLocalContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        placeholder="タイトル"
        className="border p-2"
      />
      <textarea
        value={localDescription || ''}
        onChange={(e) => setLocalDescription(e.target.value || null)}
        placeholder="説明"
        className="border p-2"
      />
      <input
        type="text"
        value={localSlug}
        onChange={(e) => setLocalSlug(e.target.value)}
        placeholder="スラッグ"
        className="border p-2"
      />
      <label>
        <input
          type="checkbox"
          checked={localIsPrivate}
          onChange={(e) => setLocalIsPrivate(e.target.checked)}
        />
        非公開
      </label>
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        placeholder="コンテンツ"
        className="border p-2 h-64"
      />
      <button
        onClick={async () => {
          setIsSaving(true);
          await onSave({
            title: localTitle,
            description: localDescription,
            authorId,
            slug: localSlug,
            isPrivate: localIsPrivate,
            content: localContent,
          });
          setIsSaving(false);
          alert('正常に保存されました。');
          globalThis.location.reload();
        }}
        disabled={isSaving}
        className="bg-green-500 text-white p-2 rounded"
      >
        保存
      </button>
      <button
        onClick={async () => {
          setIsSaving(true);
          await onPublish();
          setIsSaving(false);
          alert('正常に投稿されました。');
        }}
        disabled={isSaving}
        className="bg-blue-500 text-white p-2 rounded"
      >
        公開
      </button>
    </div>
  );
}
