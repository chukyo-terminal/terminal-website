import { CONTACT_STATUS_BADGES } from '../_lib/contact';

import type { JSX } from 'react';
import type { ContactStatus } from '../_lib/contact';


/**
 * バッジの共通クラス。
 */
const BADGE_CLASS_NAME = 'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs '
  + 'whitespace-nowrap';


/**
 * お問い合わせの対応状況を表すバッジ。
 *
 * 対応中で返信が必要な場合（問い合わせ者から返信が届いている場合）は、「要返信」のバッジも表示する。
 * 未対応のお問い合わせは常に返信が必要なため、「要返信」のバッジは表示しない。
 *
 * @param properties - プロパティ
 * @returns バッジ
 */
export default function ContactStatusBadge({ status, needsReply }: {
  status: ContactStatus;
  needsReply: boolean;
}): JSX.Element {
  const badge = CONTACT_STATUS_BADGES[status];
  return (
    <>
      <span className={`${BADGE_CLASS_NAME} ${badge.className}`}>{badge.label}</span>
      {needsReply && status === 'in-progress' && (
        <span className={`${BADGE_CLASS_NAME} border-sky-500/60 bg-sky-500/10 text-sky-300`}>要返信</span>
      )}
    </>
  );
}
