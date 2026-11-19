import { postDiscordWebhook } from '@/utils/discord';


/**
 * Discord の埋め込みの説明に含める本文の最大文字数（Discord の上限は 4096 文字）。
 */
const DISCORD_DESCRIPTION_MAX_LENGTH = 4000;


/**
 * 埋め込みの色（新しいお問い合わせ）。
 */
const NEW_CONTACT_COLOR = 0x00_BF_FF;


/**
 * 埋め込みの色（問い合わせ者からの返信）。
 */
const CONTACT_REPLY_COLOR = 0x38_BD_F8;


/**
 * 管理画面のお問い合わせのページの URL を返す。
 *
 * @param contactId - 問い合わせID
 * @returns URL。サイトの URL が設定されていない場合は `undefined`
 */
function getContactAdminUrl(contactId: number): string | undefined {
  try {
    return new URL(`/admin/control/contact/${contactId}`, process.env.NEXT_PUBLIC_APP_URL).toString();
  } catch {
    return undefined;
  }
}


/**
 * 本文を Discord の埋め込みの説明に収まる長さにする（続きは管理画面で確認する）。
 *
 * @param content - 本文
 * @returns 説明
 */
const toDescription = (content: string): string => (content.length > DISCORD_DESCRIPTION_MAX_LENGTH
  ? `${content.slice(0, DISCORD_DESCRIPTION_MAX_LENGTH)}…`
  : content);


/**
 * Discord に通知する。通知に失敗しても、呼び出し元の処理は続ける。
 *
 * @param embed - 埋め込み
 */
async function notify(embed: NonNullable<Parameters<typeof postDiscordWebhook>[1]['embeds']>[number]): Promise<void> {
  const webhookUrl = process.env.DISCORD_FORM_WEBHOOK;
  if (!webhookUrl) {
    return;
  }
  try {
    await postDiscordWebhook(webhookUrl, { embeds: [embed] });
  } catch (e) {
    console.error('Webhook post failed:', e);
  }
}


/**
 * 新しいお問い合わせを Discord に通知する。
 *
 * @param contact - お問い合わせ
 */
export async function notifyNewContact(contact: {
  id: number;
  name: string;
  email: string;
  subject: string;
  content: string;
}): Promise<void> {
  await notify({
    author: { name: contact.name },
    title: contact.subject,
    // タイトルから管理画面のお問い合わせのページを開けるようにする
    url: getContactAdminUrl(contact.id),
    description: toDescription(contact.content),
    fields: [
      { name: 'メールアドレス', value: `\`${contact.email}\`` },
    ],
    color: NEW_CONTACT_COLOR,
  });
}


/**
 * 問い合わせ者からの返信を Discord に通知する。
 *
 * @param reply - 返信と、返信先のお問い合わせ
 */
export async function notifyContactReply(reply: {
  contactId: number;
  name: string;
  /** お問い合わせの件名 */
  contactSubject: string;
  /** 返信の本文（引用を除いたもの） */
  content: string;
}): Promise<void> {
  await notify({
    author: { name: reply.name },
    title: `Re: ${reply.contactSubject}`.slice(0, 256),
    url: getContactAdminUrl(reply.contactId),
    description: toDescription(reply.content),
    footer: { text: 'お問い合わせへの返信がメールで届きました' },
    color: CONTACT_REPLY_COLOR,
  });
}
