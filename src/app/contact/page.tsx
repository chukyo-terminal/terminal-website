import ContactEmailForm from './_components/email-form';
import { CONTACT_LINK_MAIL_SUBJECT, buildContactLinkMailText, toContactLinkUrl } from './_lib/contact-link';
import { CONTACT_EMAIL_TURNSTILE, ContactEmailSchema } from '@/utils/contact';
import {
  CONTACT_MAIL_COOLDOWN_SECONDS, createContactSession, deleteContactSession, releaseContactMailCooldown,
  reserveContactMailQuota,
} from '@/utils/contact-session';
import { isMailConfigured, sendMail } from '@/lib/mail';
import { verifyInteractiveTurnstileToken } from '@/utils/turnstile';
import { isValkeyConfigured } from '@/lib/valkey';
import { getSiteUrl } from '@/utils/site-url';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';


/**
 * お問い合わせフォーム（メールアドレスの入力）のページを構成する。
 *
 * 入力されたメールアドレスに、お問い合わせ内容を入力するための一時的な URL を送信する。
 *
 * @returns 生成したページ
 */
export default function ContactPage(): JSX.Element {
  /**
   * 入力されたメールアドレスに、入力用 URL を送信する。
   *
   * @param email - メールアドレス
   * @param turnstileToken - Turnstile のトークン
   * @returns 実行結果（成功した場合は、送信先のメールアドレス）
   */
  // eslint-disable-next-line unicorn/consistent-function-scoping
  async function requestContactLink(email: string, turnstileToken: string): Promise<ActionResult<{ email: string }>> {
    'use server';
    const parsed = ContactEmailSchema.safeParse(email);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'メールアドレスの形式が正しくありません。' };
    }
    if (!await verifyInteractiveTurnstileToken(turnstileToken, CONTACT_EMAIL_TURNSTILE)) {
      return { ok: false, error: 'ロボットでないことを確認できませんでした。もう一度お試しください。' };
    }
    const siteUrl = getSiteUrl();
    if (!siteUrl || !isMailConfigured() || !isValkeyConfigured()) {
      console.error('Contact form is not configured. Set NEXT_PUBLIC_APP_URL, SMTP_HOST, MAIL_FROM and VALKEY_URL.');
      return { ok: false, error: '現在、お問い合わせを受け付けられません。時間をおいて再度お試しください。' };
    }

    const address = parsed.data;
    try {
      const quota = await reserveContactMailQuota(address);
      if (quota === 'cooldown') {
        return {
          ok: false,
          error: `このメールアドレスには先ほどメールを送信しました。届かない場合は、${CONTACT_MAIL_COOLDOWN_SECONDS}秒ほど待ってから再度お試しください。`,
        };
      }
      if (quota === 'limit') {
        return { ok: false, error: 'このメールアドレスへの送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。' };
      }
      const { token, expiresAt } = await createContactSession(address);
      try {
        await sendMail({
          to: { name: '', address },
          subject: CONTACT_LINK_MAIL_SUBJECT,
          text: buildContactLinkMailText({ url: toContactLinkUrl(siteUrl, token), expiresAt, siteUrl }),
        });
      } catch (e) {
        // 届かなかった入力用 URL は使えないようにし、すぐに再送できるようにする
        await Promise.allSettled([deleteContactSession(token), releaseContactMailCooldown(address)]);
        throw e;
      }
    } catch (e) {
      console.error('Failed to send contact link mail:', e);
      return { ok: false, error: 'メールを送信できませんでした。メールアドレスをご確認のうえ、時間をおいて再度お試しください。' };
    }
    return { ok: true, data: { email: address } };
  }

  return (
    <ContactEmailForm requestContactLink={requestContactLink} />
  );
}
