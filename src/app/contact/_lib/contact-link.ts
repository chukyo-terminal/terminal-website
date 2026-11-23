/**
 * お問い合わせの入力用 URL のメールと Cookie に関する処理（サーバーでのみ使用する）。
 */

import { formatDateTime } from '@/app/admin/control/posts/_lib/date-format';
import { SENDER_ORGANIZATION_NAME } from '@/app/admin/control/contact/_lib/reply-mail';


/**
 * 入力用 URL を開いた後に、トークンを保存する Cookie の名前。
 *
 * トークンを URL に含めたままにすると、ブラウザの履歴やアクセス解析に残るため、
 * 入力用 URL を開いたときに Cookie に移し、トークンを含まない URL（`CONTACT_DETAILS_PATH`）にリダイレクトする。
 */
export const CONTACT_SESSION_COOKIE_NAME = 'contact_session';


/**
 * お問い合わせ内容を入力するページのパス。
 */
export const CONTACT_DETAILS_PATH = '/contact/form';


/**
 * トークンを保存する Cookie の属性を返す。
 *
 * @param expires - 有効期限（入力用 URL の有効期限）
 * @returns Cookie の属性
 */
export const getContactSessionCookieOptions = (expires: Date): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  expires: Date;
} => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // メールソフトからリンクを開いたとき（別のサイトからの移動）にも Cookie を送信できるよう、`strict` にはしない
  sameSite: 'lax',
  path: CONTACT_DETAILS_PATH,
  expires,
});


/**
 * 入力用 URL を返す。
 *
 * @param siteUrl - サイトの URL
 * @param token - トークン
 * @returns 入力用 URL
 */
export const toContactLinkUrl = (siteUrl: URL, token: string): string => (
  new URL(`${CONTACT_DETAILS_PATH}/${token}`, siteUrl).toString()
);


/**
 * 入力用 URL を知らせるメールの件名。
 */
export const CONTACT_LINK_MAIL_SUBJECT = 'お問い合わせフォームのご案内';


/**
 * 入力用 URL を知らせるメールの本文を組み立てる。
 *
 * @param options - 入力用 URL、有効期限、サイトの URL
 * @returns 本文
 */
export function buildContactLinkMailText({ url, expiresAt, siteUrl }: {
  url: string;
  expiresAt: Date;
  siteUrl: URL;
}): string {
  return [
    `${SENDER_ORGANIZATION_NAME} のWebサイトのお問い合わせフォームをご利用いただき、ありがとうございます。`,
    '',
    '以下のURLを開き、お問い合わせ内容をご入力ください。',
    '',
    url,
    '',
    `このURLの有効期限は ${formatDateTime(expiresAt)} です。`,
    '有効期限が過ぎた場合や、お問い合わせを送信した後は、このURLは使用できなくなります。',
    'その場合は、お手数ですが、お問い合わせフォームからもう一度メールアドレスをご入力ください。',
    '',
    '※ このメールに心当たりがない場合は、どなたかが誤ってメールアドレスを入力した可能性があります。お手数ですが、このメールは破棄してください。',
    '※ このメールに返信されても、お問い合わせとしては受け付けられません。上記のURLからお問い合わせください。',
    '',
    '-- ',
    SENDER_ORGANIZATION_NAME,
    siteUrl.toString(),
  ].join('\n');
}
