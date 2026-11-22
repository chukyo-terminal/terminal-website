import { formatDateTime } from '../_lib/date-format';
import { POST_STATUS_BADGES, PRIVATE_BADGE } from '../_lib/post-status';

import type { JSX } from 'react';
import type { PostStatus } from '../_lib/post-status';


/**
 * バッジの共通クラス。
 */
const BADGE_CLASS_NAME = 'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs '
  + 'whitespace-nowrap';


/**
 * 記事の公開状態を表すバッジ。
 *
 * @param properties - プロパティ
 * @returns バッジ
 */
export function PostStatusBadge({ status }: { status: PostStatus }): JSX.Element {
  const badge = POST_STATUS_BADGES[status];
  return <span className={`${BADGE_CLASS_NAME} ${badge.className}`}>{badge.label}</span>;
}


/**
 * 記事が非公開に設定されていることを表すバッジ。
 *
 * @returns バッジ
 */
export function PrivateBadge(): JSX.Element {
  return <span className={`${BADGE_CLASS_NAME} ${PRIVATE_BADGE.className}`}>{PRIVATE_BADGE.label}</span>;
}


/**
 * 公開が予約されていることを表すバッジ。
 *
 * @param properties - プロパティ
 * @returns バッジ
 */
export function ScheduledBadge({ scheduledAt }: { scheduledAt: Date }): JSX.Element {
  return (
    <span className={`${BADGE_CLASS_NAME} border-blue-500/60 text-blue-200`}>
      予約中: {formatDateTime(scheduledAt)}
    </span>
  );
}
