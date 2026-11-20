import Link from 'next/link';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import ContactDetailView from './_components/contact-detail';
import { InquirerMessageFormSchema, ReplyFormSchema } from '../_lib/contact';
import { selectContactDetail, selectStaffUsers } from '../_lib/contact-queries';
import { buildReplyMailText, getQuotedMessage } from '../_lib/reply-mail';
import { contactRepliesTable, contactsTable, usersTable } from '@/db/schema';
import { checkPermission, getCurrentUserId } from '@/lib/auth';
import { toContactMessageId, toReplyMessageId } from '@/utils/contact';
import { db } from '@/lib/drizzle';
import { isImapConfigured } from '@/lib/imap';
import { getMailDomain, isMailConfigured, sendMail } from '@/lib/mail';

import type { JSX } from 'react';
import type { ContactDetail, InquirerMessageFormValues, ReplyFormValues } from '../_lib/contact';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * お問い合わせ一覧のパス。
 */
const CONTACT_LIST_PATH = '/admin/control/contact';


/**
 * お問い合わせが見つからない場合のメッセージ。
 */
const CONTACT_NOT_FOUND_MESSAGE = 'お問い合わせが見つかりませんでした。削除された可能性があります。';


/**
 * 処理を中断し、利用者にメッセージを表示するためのエラー。
 */
class ContactActionError extends Error {}


/**
 * IDが正しい形式であるかを検証する。
 *
 * @param id - 検証する値
 * @returns 正の整数であれば `true`
 */
function isValidId(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) > 0;
}


/**
 * 署名に載せるサイトの URL を返す。
 *
 * @returns URL（設定されていない場合は `null`）
 */
function getSiteUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || null;
}


/**
 * ログイン中のユーザーIDを取得する。
 *
 * @returns ユーザーID
 * @throws ContactActionError ユーザーが見つからない場合
 */
async function requireCurrentUserId(): Promise<number> {
  const userId = await getCurrentUserId();
  if (userId === null) {
    throw new ContactActionError('ログイン中のユーザーが見つかりませんでした。');
  }
  return userId;
}


/**
 * 権限を検証してからお問い合わせを操作し、操作後のお問い合わせの詳細を返す。
 *
 * @param contactId - 問い合わせID
 * @param operation - お問い合わせを操作する処理。利用者にメッセージを表示して中断する場合は `ContactActionError` を投げる
 * @param fallback - 想定外のエラーの場合のメッセージ
 * @returns 操作後のお問い合わせの詳細
 */
async function runContactAction(
  contactId: number,
  operation: () => Promise<void>,
  fallback: string,
): Promise<ActionResult<ContactDetail>> {
  const permissionError = await checkPermission('user');
  if (permissionError) {
    return { ok: false, error: permissionError };
  }
  try {
    await operation();
    const detail = await selectContactDetail(contactId);
    if (!detail) {
      return { ok: false, error: CONTACT_NOT_FOUND_MESSAGE };
    }
    return { ok: true, data: detail };
  } catch (e) {
    if (e instanceof ContactActionError) {
      return { ok: false, error: e.message };
    }
    console.error(fallback, e);
    return { ok: false, error: fallback };
  }
}


export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}): Promise<JSX.Element> {
  const { contactId: contactIdParameter } = await params;
  const contactId = Number(contactIdParameter);
  const isValidContactId = /^\d+$/.test(contactIdParameter) && isValidId(contactId);

  const [contact, staffUsers, currentUserId] = await Promise.all([
    isValidContactId ? selectContactDetail(contactId) : null,
    selectStaffUsers(),
    getCurrentUserId(),
  ]);

  if (!contact) {
    return (
      <div className="mx-auto flex flex-col items-start gap-4 px-4 py-12">
        <h1 className="text-2xl">お問い合わせ</h1>
        <p>お問い合わせが見つかりませんでした。削除された可能性があります。</p>
        <Link href={CONTACT_LIST_PATH} className="text-emerald-400 hover:underline">お問い合わせ一覧に戻る</Link>
      </div>
    );
  }

  async function handleReload(): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {}, 'お問い合わせを読み込めませんでした。');
  }

  async function handleAssign(assigneeId: number | null): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {
      if (assigneeId !== null && !isValidId(assigneeId)) {
        throw new ContactActionError('担当者が正しくありません。');
      }
      if (assigneeId !== null) {
        const assignee = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.id, assigneeId), eq(usersTable.isActive, true)))
          .limit(1);
        if (assignee.length === 0) {
          throw new ContactActionError('担当者に指定したユーザーが見つかりませんでした。');
        }
      }
      const updated = await db
        .update(contactsTable)
        .set({ assignedTo: assigneeId })
        .where(eq(contactsTable.id, contactId))
        .returning({ id: contactsTable.id });
      if (updated.length === 0) {
        throw new ContactActionError(CONTACT_NOT_FOUND_MESSAGE);
      }
    }, '担当者を変更できませんでした。');
  }

  async function handleSetCompleted(isCompleted: boolean): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {
      if (typeof isCompleted !== 'boolean') {
        throw new ContactActionError('対応状況が正しくありません。');
      }
      const target = await db
        .select({ completedAt: contactsTable.completedAt })
        .from(contactsTable)
        .where(eq(contactsTable.id, contactId))
        .limit(1)
        .then((result) => result.at(0));
      if (!target) {
        throw new ContactActionError(CONTACT_NOT_FOUND_MESSAGE);
      }
      if ((target.completedAt !== null) === isCompleted) {
        return;
      }
      await db
        .update(contactsTable)
        .set({ completedAt: isCompleted ? new Date() : null })
        .where(eq(contactsTable.id, contactId));
    }, '対応状況を変更できませんでした。');
  }

  async function handleSendReply(
    values: ReplyFormValues,
    expectedLatestMessageId: number | null,
  ): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {
      const parsed = ReplyFormSchema.safeParse(values);
      if (!parsed.success) {
        throw new ContactActionError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      }
      if (expectedLatestMessageId !== null && !isValidId(expectedLatestMessageId)) {
        throw new ContactActionError('返信の対象が正しくありません。');
      }
      if (!isMailConfigured()) {
        throw new ContactActionError('メールの送信設定がされていないため、返信を送信できません。');
      }
      const authorId = await requireCurrentUserId();

      // 返信を保存してからメールを送信し、送信に失敗した場合は保存を取り消す
      await db.transaction(async (tx) => {
        // 複数の管理者が同時に返信しないよう、お問い合わせの行をロックする
        const locked = await tx
          .select({ id: contactsTable.id })
          .from(contactsTable)
          .where(eq(contactsTable.id, contactId))
          .for('update');
        const detail = locked.length > 0 ? await selectContactDetail(contactId, tx) : null;
        if (!detail) {
          throw new ContactActionError(CONTACT_NOT_FOUND_MESSAGE);
        }
        // 返信を書いている間に、ほかの管理者が返信した場合や、問い合わせ者からの返信が記録された場合は送信しない
        if ((detail.messages.at(-1)?.id ?? null) !== expectedLatestMessageId) {
          throw new ContactActionError(
            'このお問い合わせに新しいやり取りが追加されました。「再読み込み」で内容を確認してから、再度送信してください。',
          );
        }
        if (!z.email().safeParse(detail.email).success) {
          throw new ContactActionError('問い合わせ者のメールアドレスの形式が正しくないため、返信を送信できません。');
        }

        const [reply] = await tx
          .insert(contactRepliesTable)
          .values({ contactId, authorId, subject: parsed.data.subject, content: parsed.data.content })
          .returning({ id: contactRepliesTable.id });
        await tx
          .update(contactsTable)
          .set({
            // 担当者がいない場合は、返信した管理者を担当者にする
            assignedTo: detail.assignee?.id ?? authorId,
            completedAt: parsed.data.markCompleted ? (detail.completedAt ?? new Date()) : null,
          })
          .where(eq(contactsTable.id, contactId));

        const domain = getMailDomain();
        const rootMessageId = toContactMessageId(contactId, domain);
        // やり取りのメールの Message-ID（手動で記録した問い合わせ者からの返信には Message-ID がない）
        const threadMessageIds = detail.messages.flatMap((message) => {
          if (!message.isFromInquirer) {
            return [toReplyMessageId(contactId, message.id, domain)];
          }
          return message.receivedMail ? [message.receivedMail.messageId] : [];
        });
        const latestInquirerMessage = detail.messages.findLast((message) => message.isFromInquirer);
        try {
          await sendMail({
            to: { name: detail.name, address: detail.email },
            subject: parsed.data.subject,
            text: buildReplyMailText({
              content: parsed.data.content,
              inquirerName: detail.name,
              quoted: getQuotedMessage(detail),
              siteUrl: getSiteUrl(),
            }),
            // このメールへの返信を、どのお問い合わせへの返信か判別できるようにする（受信メールの確認で使用する）
            messageId: toReplyMessageId(contactId, reply.id, domain),
            // 問い合わせ者のメールソフトで、このお問い合わせのやり取りを1つのスレッドにまとめる
            inReplyTo: latestInquirerMessage?.receivedMail?.messageId ?? rootMessageId,
            references: [rootMessageId, ...threadMessageIds],
          });
        } catch (e) {
          console.error('Failed to send contact reply:', e);
          throw new ContactActionError('メールを送信できませんでした。返信は保存されていません。時間をおいて再度お試しください。');
        }
      });
    }, '返信を送信できませんでした。');
  }

  async function handleRecordInquirerMessage(values: InquirerMessageFormValues): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {
      const parsed = InquirerMessageFormSchema.safeParse(values);
      if (!parsed.success) {
        throw new ContactActionError(parsed.error.issues[0]?.message ?? '入力内容が正しくありません。');
      }
      const authorId = await requireCurrentUserId();
      await db.transaction(async (tx) => {
        // 問い合わせ者から返信が届いた場合は、返信が必要になるため未完了に戻す
        const updated = await tx
          .update(contactsTable)
          .set({ completedAt: null })
          .where(eq(contactsTable.id, contactId))
          .returning({ id: contactsTable.id });
        if (updated.length === 0) {
          throw new ContactActionError(CONTACT_NOT_FOUND_MESSAGE);
        }
        await tx
          .insert(contactRepliesTable)
          // eslint-disable-next-line unicorn/no-unused-array-method-return
          .values({ contactId, authorId, isFromInquirer: true, ...parsed.data });
      });
    }, '問い合わせ者からの返信を記録できませんでした。');
  }

  async function handleDeleteInquirerMessage(messageId: number): Promise<ActionResult<ContactDetail>> {
    'use server';
    return await runContactAction(contactId, async () => {
      if (!isValidId(messageId)) {
        throw new ContactActionError('指定された返信が正しくありません。');
      }
      const deleted = await db
        .delete(contactRepliesTable)
        .where(and(
          eq(contactRepliesTable.id, messageId),
          eq(contactRepliesTable.contactId, contactId),
          // 送信済みの返信は、送信した記録として残すため削除できない
          eq(contactRepliesTable.isFromInquirer, true),
        ))
        .returning({ id: contactRepliesTable.id });
      if (deleted.length === 0) {
        throw new ContactActionError('記録が見つかりませんでした。既に削除された可能性があります。');
      }
    }, '記録を削除できませんでした。');
  }

  async function handleDeleteContact(): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    try {
      const deleted = await db
        .delete(contactsTable)
        .where(eq(contactsTable.id, contactId))
        .returning({ id: contactsTable.id });
      if (deleted.length === 0) {
        return { ok: false, error: 'お問い合わせが見つかりませんでした。既に削除された可能性があります。' };
      }
      return { ok: true };
    } catch (e) {
      console.error('Failed to delete contact:', e);
      return { ok: false, error: 'お問い合わせを削除できませんでした。' };
    }
  }

  const currentUser = staffUsers.find((user) => user.id === currentUserId) ?? null;

  return (
    <div className="mx-auto px-4 py-12">
      <ContactDetailView
        initialContact={contact}
        staffUsers={staffUsers}
        currentUser={currentUser}
        isMailConfigured={isMailConfigured()}
        isImapConfigured={isImapConfigured()}
        siteUrl={getSiteUrl()}
        now={new Date()}
        onReload={handleReload}
        onAssign={handleAssign}
        onSetCompleted={handleSetCompleted}
        onSendReply={handleSendReply}
        onRecordInquirerMessage={handleRecordInquirerMessage}
        onDeleteInquirerMessage={handleDeleteInquirerMessage}
        onDeleteContact={handleDeleteContact}
      />
    </div>
  );
}
