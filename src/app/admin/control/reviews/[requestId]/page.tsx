import Link from 'next/link';

import { checkPermission, getCurrentAccount } from '@/lib/auth';
import { reviewRequest, selectReviewDetail } from '@/utils/post-review';

import MarkdownPreview from '../../posts/[postId]/_components/markdown-preview';
import { formatDateTime } from '../../posts/_lib/date-format';

import ReviewForm from './_components/review-form';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';


export const dynamic = 'force-dynamic';


/**
 * レビューの詳細ページ。記事の内容と操作の履歴を表示し、承認できる人には承認・差し戻しの操作を表示する。
 *
 * @param params - 依頼ID
 * @returns レビューの詳細
 */
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}): Promise<JSX.Element> {
  const { requestId: requestIdParameter } = await params;
  const requestId = Number(requestIdParameter);
  const account = await getCurrentAccount();
  const isValidRequestId = /^\d+$/.test(requestIdParameter) && Number.isSafeInteger(requestId);
  const result = account && isValidRequestId ? await selectReviewDetail(requestId, account) : null;

  async function handleReview(input: { isApproved: boolean; comment: string }): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const reviewer = await getCurrentAccount();
    if (!reviewer) {
      return { ok: false, error: 'ログインしてください。' };
    }
    const outcome = await reviewRequest(requestId, reviewer, {
      isApproved: input.isApproved === true,
      comment: typeof input.comment === 'string' ? input.comment : '',
    });
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
  }

  if (!account) {
    return <div className="mx-auto px-4 py-12"><p>ログインしてください。</p></div>;
  }
  if (!result || !result.ok) {
    return (
      <div className="mx-auto px-4 py-12 space-y-4">
        <p className="text-red-300">{result?.ok === false ? result.error : '依頼が見つかりませんでした。'}</p>
        <Link href="/admin/control/reviews" className="text-emerald-400 hover:underline">レビューの一覧へ</Link>
      </div>
    );
  }
  if (!result.value) {
    return (
      <div className="mx-auto px-4 py-12 space-y-4">
        <p>依頼が見つかりませんでした。</p>
        <Link href="/admin/control/reviews" className="text-emerald-400 hover:underline">レビューの一覧へ</Link>
      </div>
    );
  }
  const detail = result.value;

  return (
    <div className="mx-auto px-4 py-12 space-y-8">
      <div className="space-y-2">
        <Link href="/admin/control/reviews" className="text-sm text-gray-400 hover:text-emerald-400">← レビューの一覧</Link>
        <h1 className="text-2xl font-bold">{detail.postTitle}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-gray-300">
          <dt className="text-gray-500">状態</dt>
          <dd>{detail.request.status === 'pending' ? detail.request.stageLabel : detail.request.statusLabel}</dd>
          <dt className="text-gray-500">執筆者</dt>
          <dd>{detail.authorName}</dd>
          <dt className="text-gray-500">担当課</dt>
          <dd>{detail.request.divisionName ?? '組織運営に関する記事'}</dd>
          <dt className="text-gray-500">依頼日時</dt>
          <dd>{formatDateTime(detail.request.requestedAt)}</dd>
          {detail.request.status === 'pending' && (
            <>
              <dt className="text-gray-500">承認できる人</dt>
              <dd>{detail.reviewerNames.length > 0 ? detail.reviewerNames.join('、') : '（該当者がいません）'}</dd>
            </>
          )}
        </dl>
      </div>

      {detail.actions.length > 0 && (
        <section aria-label="操作の履歴" className="space-y-2 text-sm">
          <h2 className="font-bold">操作の履歴</h2>
          <ul className="flex flex-col gap-2">
            {detail.actions.map((action) => (
              <li key={action.stage} className="rounded border border-gray-700 p-3">
                {action.isApproved ? '承認' : '差し戻し'}・{action.reviewerName}・{formatDateTime(action.createdAt)}
                {action.comment && <p className="mt-1 whitespace-pre-line text-gray-300">{action.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.canReview && <ReviewForm onReview={handleReview} />}
      {!detail.canReview && detail.request.status === 'pending' && (
        <p className="text-sm text-gray-400">この段階の承認者ではないため、審査できません。</p>
      )}

      <section aria-label="記事の内容" className="rounded-lg border border-gray-700 p-4">
        <MarkdownPreview
          title={detail.postTitle}
          author={detail.authorName}
          publishedAt={null}
          tags={[]}
          content={detail.postContent}
          isActive
        />
      </section>
    </div>
  );
}
