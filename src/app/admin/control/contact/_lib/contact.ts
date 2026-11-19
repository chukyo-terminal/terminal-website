/**
 * お問い合わせ管理に関する型とユーティリティ。
 *
 * サーバーとブラウザの両方で使用できるよう、データベースには依存しない。
 */

import { z } from 'zod';

import { ContactContentSchema, createSubjectSchema } from '@/lib/contact';


/**
 * 返信の件名の最大文字数（問い合わせの件名に「Re: 」を付けても収まるようにする）。
 */
export const REPLY_SUBJECT_MAX_LENGTH = 255;


/**
 * 管理者（担当者・返信者）。
 */
export type StaffUser = {
  id: number;
  name: string;
};


/**
 * お問い合わせの対応状況。
 *
 * - `new`: 未対応（まだ返信しておらず、完了にしていない）
 * - `in-progress`: 対応中（返信したが、完了にしていない）
 * - `completed`: 完了
 */
export type ContactStatus = 'new' | 'in-progress' | 'completed';


/**
 * 対応状況の表示名と配色。
 */
export const CONTACT_STATUS_BADGES: Readonly<Record<ContactStatus, { label: string; className: string }>> = {
  'new': { label: '未対応', className: 'border-sky-500/60 text-sky-300' },
  'in-progress': { label: '対応中', className: 'border-amber-500/60 text-amber-300' },
  'completed': { label: '完了', className: 'border-emerald-500/60 text-emerald-300' },
};


/**
 * お問い合わせに対するやり取り（管理者の返信、または問い合わせ者からの返信）。
 */
export type ContactMessage = {
  id: number;
  /** 問い合わせ者からの返信であるかどうか */
  isFromInquirer: boolean;
  /** 返信者、または問い合わせ者からの返信を手動で記録した管理者（自動で記録した場合や、ユーザーが削除された場合は `null`） */
  author: StaffUser | null;
  /**
   * 受信したメールの情報（IMAP で受信して自動で記録した問い合わせ者からの返信のみ。それ以外は `null`）
   */
  receivedMail: {
    messageId: string;
    /** 送信元のメールアドレス（読み取れなかった場合は `null`） */
    fromAddress: string | null;
    /** 添付ファイルの名前（添付ファイル自体は保存していない） */
    attachmentNames: string[];
  } | null;
  subject: string;
  content: string;
  /** 管理者の返信は送信日時、問い合わせ者からの返信は受信日時（手動で記録した場合は記録日時） */
  createdAt: Date;
};


/**
 * お問い合わせ（一覧と詳細に共通する項目）。
 */
type ContactBase = {
  id: number;
  name: string;
  email: string;
  subject: string;
  content: string;
  /** 受付日時 */
  createdAt: Date;
  /** 完了日時（未完了の場合は `null`） */
  completedAt: Date | null;
  /** 担当者（割り当てていない場合は `null`） */
  assignee: StaffUser | null;
  status: ContactStatus;
  /** 返信が必要かどうか（完了にしておらず、最新のメッセージが問い合わせ者のものである） */
  needsReply: boolean;
};


/**
 * お問い合わせ一覧に表示するお問い合わせ。
 */
export type ContactListItem = ContactBase & {
  /** やり取りの数（管理者の返信と、記録した問い合わせ者からの返信） */
  messageCount: number;
  /** 最後にメッセージが追加された日時（やり取りがない場合は受付日時） */
  lastActivityAt: Date;
};


/**
 * お問い合わせの詳細。
 */
export type ContactDetail = ContactBase & {
  /** やり取り（古い順） */
  messages: ContactMessage[];
};


/**
 * 対応状況を判定する。
 *
 * @param completedAt - 完了日時
 * @param messages - やり取り（古い順）
 * @returns 対応状況と、返信が必要かどうか
 */
export function getContactStatus(
  completedAt: Date | null,
  messages: readonly Pick<ContactMessage, 'isFromInquirer'>[],
): { status: ContactStatus; needsReply: boolean } {
  if (completedAt) {
    return { status: 'completed', needsReply: false };
  }
  return {
    status: messages.some((message) => !message.isFromInquirer) ? 'in-progress' : 'new',
    // やり取りがない場合は、問い合わせ自体が最新のメッセージ
    needsReply: messages.at(-1)?.isFromInquirer ?? true,
  };
}


/**
 * 返信の件名を返す（既に「Re:」で始まる場合はそのまま返す）。
 *
 * @param subject - 返信元の件名
 * @returns 返信の件名
 */
export const toReplySubject = (subject: string): string => (/^re:/i.test(subject) ? subject : `Re: ${subject}`);


/**
 * 返信の入力値。
 */
export type ReplyFormValues = {
  subject: string;
  content: string;
  /** 送信後に対応を完了にするかどうか（`false` の場合、完了にしていたお問い合わせは未完了に戻す） */
  markCompleted: boolean;
};


/**
 * 返信の検証スキーマ。
 */
export const ReplyFormSchema = z.object({
  subject: createSubjectSchema(REPLY_SUBJECT_MAX_LENGTH),
  content: ContactContentSchema,
  markCompleted: z.boolean({ error: '送信後の対応状況が正しくありません。' }),
});


/**
 * 問い合わせ者からの返信を記録する際の入力値。
 */
export type InquirerMessageFormValues = {
  subject: string;
  content: string;
};


/**
 * 問い合わせ者からの返信を記録する際の検証スキーマ。
 */
export const InquirerMessageFormSchema = z.object({
  subject: createSubjectSchema(REPLY_SUBJECT_MAX_LENGTH),
  content: ContactContentSchema,
});
