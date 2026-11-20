/**
 * お問い合わせへの返信メールを組み立てる。
 *
 * 送信前のプレビュー（ブラウザ）と実際の送信（サーバー）で同じ内容になるよう、両方からこのモジュールを使用する。
 */

import { formatDateTime } from '@/app/admin/control/posts/_lib/date-format';
import { splitQuotedText } from '@/utils/contact';

import type { ContactDetail } from './contact';


/**
 * 返信メールの署名と書き出しに使用する、送信者の名称。
 */
export const SENDER_ORGANIZATION_NAME = '中京大学プログラミングサークルTerminal (CuT)';


/**
 * 返信メールで引用するメッセージ。
 */
export type QuotedMessage = {
  /** `inquiry` は問い合わせ自体、`reply` は記録した問い合わせ者からの返信 */
  kind: 'inquiry' | 'reply';
  subject: string;
  content: string;
  createdAt: Date;
};


/**
 * 返信メールで引用するメッセージ（問い合わせ者の最新のメッセージ）を返す。
 *
 * 問い合わせ者からの返信は、引用が重なって長くならないよう、末尾の引用を除いた部分のみを引用する。
 *
 * @param contact - お問い合わせ
 * @returns 引用するメッセージ
 */
export function getQuotedMessage(
  contact: Pick<ContactDetail, 'subject' | 'content' | 'createdAt' | 'messages'>,
): QuotedMessage {
  const latest = contact.messages.findLast((message) => message.isFromInquirer);
  if (!latest) {
    return { kind: 'inquiry', subject: contact.subject, content: contact.content, createdAt: contact.createdAt };
  }
  return {
    kind: 'reply',
    subject: latest.subject,
    content: splitQuotedText(latest.content).body,
    createdAt: latest.createdAt,
  };
}


/**
 * 返信メールの本文を組み立てる（入力した本文に、署名と問い合わせ者の最新のメッセージの引用を付ける）。
 *
 * @param options - 入力した本文、問い合わせ者の名前、引用するメッセージ、サイトの URL
 * @returns 返信メールの本文
 */
export function buildReplyMailText({ content, inquirerName, quoted, siteUrl }: {
  content: string;
  inquirerName: string;
  quoted: QuotedMessage;
  /** 署名に載せるサイトの URL（設定されていない場合は `null`） */
  siteUrl: string | null;
}): string {
  const lines = [
    content,
    '',
    // 署名の区切り（多くのメールソフトが署名として扱う）
    '-- ',
    SENDER_ORGANIZATION_NAME,
    ...(siteUrl ? [siteUrl] : []),
    '',
    quoted.kind === 'inquiry'
      ? `${formatDateTime(quoted.createdAt)} に ${inquirerName} 様からいただいたお問い合わせ:`
      : `${inquirerName} 様からいただいたメール:`,
    `> 件名: ${quoted.subject}`,
    '>',
    ...quoted.content.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)),
  ];
  return lines.join('\n');
}


/**
 * 返信の本文の書き出しを返す（返信フォームの初期値）。
 *
 * @param options - 問い合わせ者の名前、返信する管理者の名前、やり取り
 * @returns 書き出し
 */
export function buildReplyTemplate({ inquirerName, staffName, messages }: {
  inquirerName: string;
  /** 返信する管理者の名前（不明な場合は `null`） */
  staffName: string | null;
  messages: ContactDetail['messages'];
}): string {
  let greeting: string | null = null;
  if (!messages.some((message) => !message.isFromInquirer)) {
    greeting = 'お問い合わせいただき、ありがとうございます。';
  } else if (messages.at(-1)?.isFromInquirer) {
    greeting = 'ご返信いただき、ありがとうございます。';
  }
  return [
    `${inquirerName} 様`,
    '',
    ...(greeting ? [greeting] : []),
    staffName ? `${SENDER_ORGANIZATION_NAME} の${staffName.split(' ', 1)[0]}${messages.at(-1)?.isFromInquirer ? 'です。' : 'と申します。' }` : `${SENDER_ORGANIZATION_NAME}です。`,
    '',
    '',
  ].join('\n');
}
