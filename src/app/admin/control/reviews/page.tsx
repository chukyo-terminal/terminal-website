import Link from 'next/link';

import { getCurrentAccount } from '@/lib/auth';
import { selectPendingReviewsFor } from '@/utils/post-review';

import { formatDateTime } from '../posts/_lib/date-format';

import type { JSX } from 'react';


export const dynamic = 'force-dynamic';


/**
 * レビューの一覧ページ。自分が承認できる審査中の記事を表示する。
 *
 * @returns レビューの一覧
 */
export default async function ReviewListPage(): Promise<JSX.Element> {
  const account = await getCurrentAccount();
  const result = account ? await selectPendingReviewsFor(account) : null;

  return (
    <div className="mx-auto px-4 py-12 space-y-6">
      <h1 className="text-2xl font-bold">レビュー</h1>
      <p className="text-gray-400">
        あなたが承認できる審査中の記事の一覧です。承認者は、LDAP の組織（役職）の現在の状態で判定します。
      </p>
      {!account && <p>ログインしてください。</p>}
      {result && !result.ok && <p className="text-red-300">{result.error}</p>}
      {result?.ok && result.value.length === 0 && <p className="text-gray-300">審査中の記事はありません。</p>}
      {result?.ok && result.value.length > 0 && (
        <ul className="divide-y divide-gray-700 rounded border border-gray-700">
          {result.value.map((item) => (
            <li key={item.requestId} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <Link
                href={`/admin/control/reviews/${item.requestId}`}
                className="text-lg font-bold text-emerald-300 hover:underline"
              >
                {item.postTitle}
              </Link>
              <span className="text-gray-300">執筆者: {item.authorName}</span>
              <span className="text-gray-300">{item.divisionName ?? '組織運営に関する記事'}</span>
              <span className="text-amber-300">{item.stageLabel}</span>
              <span className="text-gray-400">依頼: {formatDateTime(item.requestedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
