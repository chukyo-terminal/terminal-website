'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { JSX } from 'react';

import type { ActionResult } from '@/types';


/**
 * 承認・差し戻しの入力欄と操作ボタン。
 *
 * @param properties - プロパティ
 * @returns 審査の入力欄
 */
export default function ReviewForm({
  onReview,
}: {
  onReview: (input: { isApproved: boolean; comment: string }) => Promise<ActionResult>;
}): JSX.Element {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (isApproved: boolean): Promise<void> => {
    if (isBusy) {
      return;
    }
    if (!isApproved && comment.trim() === '') {
      setError('差し戻す場合は、修正してほしい内容をコメントに入力してください。');
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const result = await onReview({ isApproved, comment });
      if (!result.ok) {
        setError(result.error);
        setIsBusy(false);
        return;
      }
      router.push('/admin/control/reviews');
      router.refresh();
    } catch (e) {
      console.error('Failed to review:', e);
      setError('送信できませんでした。通信状況を確認してください。');
      setIsBusy(false);
    }
  };

  return (
    <section aria-label="審査" className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
      <h2 className="text-lg font-bold">審査</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-300">コメント（差し戻す場合は必須）</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          maxLength={2000}
          disabled={isBusy}
          className={
            'rounded border border-gray-600 bg-gray-900 px-3 py-2 text-gray-100 '
            + 'focus:outline-none focus:ring-2 focus:ring-emerald-500'
          }
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isBusy}
          className="rounded border border-red-500/60 px-4 py-2 text-red-200 hover:bg-red-950 disabled:opacity-50"
        >
          差し戻す
        </button>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={isBusy}
          className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          承認する
        </button>
      </div>
    </section>
  );
}
