/**
 * お問い合わせに関する定数と検証スキーマ。
 *
 * サーバーとブラウザの両方で使用できるよう、データベースには依存しない。
 */

import { z } from 'zod';


/**
 * 名前の最大文字数。
 */
export const CONTACT_NAME_MAX_LENGTH = 100;


/**
 * メールアドレスの最大文字数。
 */
export const CONTACT_EMAIL_MAX_LENGTH = 254;


/**
 * 件名の最大文字数。
 */
export const CONTACT_SUBJECT_MAX_LENGTH = 200;


/**
 * 本文の最大文字数（問い合わせ・返信で共通）。
 */
export const CONTACT_CONTENT_MAX_LENGTH = 10_000;


/**
 * 1行の文字列（名前・件名）を正規化する（改行などの制御文字や連続する空白を1つの空白にし、前後の空白を除く）。
 *
 * メールのヘッダーに含めても改行が入らないようにする。
 *
 * @param value - 文字列
 * @returns 正規化した文字列
 */
export const normalizeSingleLine = (value: string): string => (
  value.replaceAll(/[\s\p{Cc}]+/gu, ' ').trim()
);


/**
 * 本文を正規化する（改行コードを統一し、前後の空白を除く）。
 *
 * @param value - 本文
 * @returns 正規化した本文
 */
export const normalizeContactContent = (value: string): string => value.replaceAll(/\r\n?/g, '\n').trim();


/**
 * 件名の検証スキーマ。
 *
 * @param maxLength - 最大文字数
 * @returns 検証スキーマ
 */
export const createSubjectSchema = (maxLength: number) => z
  .string({ error: '件名を入力してください。' })
  .transform(normalizeSingleLine)
  .pipe(z
    .string()
    .min(1, '件名を入力してください。')
    .max(maxLength, `件名は${maxLength}文字以内で入力してください。`));


/**
 * 本文の検証スキーマ。
 */
export const ContactContentSchema = z
  .string({ error: '本文を入力してください。' })
  .transform(normalizeContactContent)
  .pipe(z
    .string()
    .min(1, '本文を入力してください。')
    .max(CONTACT_CONTENT_MAX_LENGTH, `本文は${CONTACT_CONTENT_MAX_LENGTH}文字以内で入力してください。`));


/**
 * メールアドレスの検証スキーマ（お問い合わせフォームの最初の段階で入力する）。
 */
export const ContactEmailSchema = z
  .string({ error: 'メールアドレスを入力してください。' })
  .trim()
  .min(1, 'メールアドレスを入力してください。')
  .max(CONTACT_EMAIL_MAX_LENGTH, 'メールアドレスが長すぎます。')
  .pipe(z.email('メールアドレスの形式が正しくありません。'));


/**
 * お問い合わせ内容の検証スキーマ（メールアドレスの確認後に、入力用 URL のページで入力する）。
 */
export const ContactDetailsFormSchema = z.object({
  name: z
    .string({ error: 'お名前を入力してください。' })
    .transform(normalizeSingleLine)
    .pipe(z
      .string()
      .min(1, 'お名前を入力してください。')
      .max(CONTACT_NAME_MAX_LENGTH, `お名前は${CONTACT_NAME_MAX_LENGTH}文字以内で入力してください。`)),
  subject: createSubjectSchema(CONTACT_SUBJECT_MAX_LENGTH),
  content: ContactContentSchema,
});


/**
 * お問い合わせ内容の入力値。
 */
export type ContactDetailsFormValues = z.input<typeof ContactDetailsFormSchema>;


/**
 * お問い合わせフォームの最初の段階（メールアドレスの入力）で使用する Turnstile ウィジェットのアクション名と `cData`。
 */
export const CONTACT_EMAIL_TURNSTILE = { action: 'contact-email', cdata: 'contact' } as const;


/**
 * お問い合わせの入力用 URL（メールアドレスの確認後に送る一時的な URL）の有効期間（時間）。
 */
export const CONTACT_SESSION_TTL_HOURS = 24;


/**
 * 入力用 URL が無効な場合（有効期限が過ぎた場合や、送信済みの場合）のメッセージ。
 */
export const CONTACT_SESSION_INVALID_MESSAGE = 'お問い合わせの入力用URLの有効期限が過ぎたか、既に送信済みです。お手数ですが、メールアドレスの入力からやり直してください。';


/**
 * お問い合わせ自体を表す Message-ID を返す（返信メールをメールソフトで1つのスレッドにまとめるために使用する）。
 *
 * 問い合わせはメールで届いたものではないため、実際にこの Message-ID のメールは存在しない。
 *
 * @param contactId - 問い合わせID
 * @param domain - 送信元のドメイン
 * @returns Message-ID（山括弧を含む）
 */
export const toContactMessageId = (contactId: number, domain: string): string => `<contact-${contactId}@${domain}>`;


/**
 * 返信メールの Message-ID を返す。
 *
 * @param contactId - 問い合わせID
 * @param replyId - 問い合わせ返信ID
 * @param domain - 送信元のドメイン
 * @returns Message-ID（山括弧を含む）
 */
export const toReplyMessageId = (contactId: number, replyId: number, domain: string): string => (
  `<contact-${contactId}.reply-${replyId}@${domain}>`
);


/**
 * `toContactMessageId`・`toReplyMessageId` で生成した Message-ID から、問い合わせIDを読み取る。
 *
 * @param messageId - Message-ID（山括弧を含む）
 * @param domain - 送信元のドメイン
 * @returns 問い合わせID。このサイトが生成した Message-ID でない場合は `null`
 */
export function parseContactMessageId(messageId: string, domain: string): number | null {
  const match = /^<contact-(\d+)(?:\.reply-\d+)?@([^<>@\s]+)>$/i.exec(messageId.trim());
  if (!match || match[2].toLowerCase() !== domain.toLowerCase()) {
    return null;
  }
  const contactId = Number(match[1]);
  return Number.isSafeInteger(contactId) && contactId > 0 ? contactId : null;
}


/**
 * 返信メールの、引用より前の部分と引用の部分。
 */
export type QuotedTextParts = {
  /** 引用より前の部分（引用がない場合は全体） */
  body: string;
  /** 末尾の引用の部分（引用の前置き（「〜 wrote:」など）を含む。引用がない場合は空文字列） */
  quoted: string;
};


/**
 * 返信メールの区切り（Outlook などの「元のメッセージ」）を表す行。
 */
const ORIGINAL_MESSAGE_SEPARATOR = new RegExp(
  String.raw`^\s*(?:-{2,}\s*(?:original message|forwarded message|元のメッセージ|転送されたメッセージ)\s*-{2,}|_{10,})\s*$`,
  'i',
);


/**
 * 返信メールの本文を、返信の部分と引用の部分に分ける。
 *
 * - 末尾に続く「\>」で始まる行と、その直前の引用の前置き（「:」で終わる行）を引用とみなす（返信の下に引用する形式）
 * - 先頭に引用があり、その後に引用を含まない返信が続く場合は、先頭の引用を引用とみなす（引用の下に返信する形式）
 * - 「元のメッセージ」などの区切りがある場合は、区切り以降を引用とみなす
 * - 本文の途中に引用を挟んで返信している場合は、末尾の引用のみを分ける
 *
 * @param text - 本文
 * @returns 返信の部分と引用の部分
 */
export function splitQuotedText(text: string): QuotedTextParts {
  const lines = text.replaceAll(/\r\n?/g, '\n').split('\n');
  const isBlank = (index: number): boolean => lines[index].trim() === '';
  const isQuote = (index: number): boolean => /^\s*>/.test(lines[index]);
  // 引用の前置き（例: 「2026年11月19日(木) 17:44 Terminal <contact@example.com>:」「On ... wrote:」）。
  // 本文の「:」で終わる行を誤って引用とみなさないよう、日時やメールアドレスを含む行のみを前置きとする
  const isQuoteHeader = (index: number): boolean => (
    /[:：]\s*$/.test(lines[index]) && /\d|@|wrote/i.test(lines[index])
  );
  // 前置きが2行に折り返されている場合の1行目（例: 「On Thu, ... Terminal <」「contact@example.com> wrote:」）
  const isWrappedQuoteHeader = (index: number): boolean => (
    index + 1 < lines.length && /^on\s/i.test(lines[index]) && !isQuoteHeader(index) && isQuoteHeader(index + 1)
  );
  const containsQuote = (from: number, to: number): boolean => lines.slice(from, to).some((_, offset) => (
    isQuote(from + offset)
  ));

  // 返信の部分の範囲（start 以上 end 未満）
  let start = 0;
  let end = lines.length;

  // 末尾の、引用の行と空行だけが続く部分
  let tailStart = lines.length;
  while (tailStart > 0 && (isBlank(tailStart - 1) || isQuote(tailStart - 1))) {
    tailStart--;
  }
  if (containsQuote(tailStart, lines.length)) {
    end = tailStart;
    let header = end - 1;
    while (header >= 0 && isBlank(header)) {
      header--;
    }
    if (header >= 0 && isQuoteHeader(header)) {
      end = header > 0 && isWrappedQuoteHeader(header - 1) ? header - 1 : header;
    }
  }
  // 「元のメッセージ」などの区切り
  const separator = lines.findIndex((line, index) => index > 0 && index < end && ORIGINAL_MESSAGE_SEPARATOR.test(line));
  if (separator !== -1) {
    end = separator;
  }

  // 先頭の、引用の前置き・引用の行・空行だけが続く部分
  let headEnd = 0;
  while (headEnd < end && isBlank(headEnd)) {
    headEnd++;
  }
  if (headEnd < end && isWrappedQuoteHeader(headEnd)) {
    headEnd += 2;
  } else if (headEnd < end && isQuoteHeader(headEnd)) {
    headEnd++;
  }
  const quoteStart = headEnd;
  while (headEnd < end && (isBlank(headEnd) || isQuote(headEnd))) {
    headEnd++;
  }
  if (containsQuote(quoteStart, headEnd) && !containsQuote(headEnd, end)) {
    start = headEnd;
  }

  const body = lines.slice(start, end).join('\n').trim();
  // 本文がすべて引用の場合は、分けずに全体を本文とする
  if (body === '') {
    return { body: text.trim(), quoted: '' };
  }
  const quoted = [lines.slice(0, start), lines.slice(end)]
    .map((part) => part.join('\n').trim())
    .filter((part) => part !== '')
    .join('\n\n');
  return { body, quoted };
}
