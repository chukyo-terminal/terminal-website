import { cookies } from 'next/headers';
import Link from 'next/link';

import { Clock } from 'lucide-react';

import ContactDetailsForm from './_components/details-form';
import { CONTACT_DETAILS_PATH, CONTACT_SESSION_COOKIE_NAME } from '../_lib/contact-link';
import { contactsTable } from '@/db/schema';
import { CONTACT_SESSION_INVALID_MESSAGE, ContactDetailsFormSchema } from '@/utils/contact';
import { notifyNewContact } from '@/utils/contact-notification';
import { consumeContactSession, getContactSession, restoreContactSession } from '@/utils/contact-session';
import { db } from '@/lib/drizzle';

import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';
import type { ContactDetailsFormValues } from '@/utils/contact';
import type { ContactSession } from '@/utils/contact-session';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};


/**
 * お問い合わせ内容を入力するページを構成する。
 *
 * 入力用 URL を開いたときに Cookie に保存したトークンで、確認済みのメールアドレスを取得する。
 *
 * @returns 生成したページ
 */
export default async function ContactDetailsPage(): Promise<JSX.Element> {
  /**
   * お問い合わせを送信する。
   *
   * @param values - 入力値
   * @returns 実行結果
   */
  async function submitContact(values: ContactDetailsFormValues): Promise<ActionResult> {
    'use server';
    const parsed = ContactDetailsFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(CONTACT_SESSION_COOKIE_NAME)?.value;

    // 同じ入力用 URL で2回送信できないよう、保存する前に使用済みにする
    let session: ContactSession | null;
    try {
      session = await consumeContactSession(token);
    } catch (e) {
      console.error('Failed to consume contact session:', e);
      return { ok: false, error: 'エラーが発生しました。時間をおいて再度お試しください。' };
    }
    if (!token || !session) {
      return { ok: false, error: CONTACT_SESSION_INVALID_MESSAGE };
    }

    const contact = { ...parsed.data, email: session.email };
    let id: number;
    try {
      [{ id }] = await db.insert(contactsTable).values(contact).returning({ id: contactsTable.id });
    } catch (e) {
      console.error('Failed to save contact:', e);
      // もう一度送信できるようにする
      await restoreContactSession(token, session).catch((e_: unknown) => {
        console.error('Failed to restore contact session:', e_);
      });
      return { ok: false, error: '送信できませんでした。時間をおいて再度お試しください。' };
    }
    cookieStore.delete({ name: CONTACT_SESSION_COOKIE_NAME, path: CONTACT_DETAILS_PATH });
    // 通知の成否に関係なく訪問者には成功を返す
    await notifyNewContact({ id, ...contact });
    return { ok: true };
  }

  const cookieStore = await cookies();
  let session: ContactSession | null;
  try {
    session = await getContactSession(cookieStore.get(CONTACT_SESSION_COOKIE_NAME)?.value);
  } catch (e) {
    console.error('Failed to get contact session:', e);
    return (
      <Notice title="一時的に利用できません">
        現在、お問い合わせを受け付けられません。お手数ですが、時間をおいてこのページを再読み込みしてください。
      </Notice>
    );
  }
  if (!session) {
    return (
      <Notice title="URLが無効です" linkToStart>
        {CONTACT_SESSION_INVALID_MESSAGE}
      </Notice>
    );
  }
  return (
    <ContactDetailsForm
      email={session.email}
      expiresAt={session.expiresAt.toISOString()}
      submitContact={submitContact}
    />
  );
}


/**
 * お問い合わせ内容を入力できないことを知らせる。
 *
 * @param param0 - 見出し、本文、メールアドレスの入力に戻るリンクを表示するかどうか
 * @returns 要素
 */
function Notice({ title, children, linkToStart = false }: {
  title: string;
  children: ReactNode;
  linkToStart?: boolean;
}): JSX.Element {
  return (
    <div className="max-w-2xl mx-auto space-y-6 md:space-y-8">
      <div className="space-y-3 md:space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold text-emerald-400 flex items-center">
          <Clock className="mr-2 h-6 w-6 md:h-8 md:w-8" aria-hidden />
          {title}
        </h1>
        <div className="h-1 w-16 md:w-20 bg-emerald-400 rounded"></div>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg space-y-4">
        <p className="text-sm md:text-base text-gray-300">{children}</p>
        {linkToStart && (
          <div className="flex justify-end">
            <Link
              href="/contact"
              className="px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base"
            >
              メールアドレスの入力に戻る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
