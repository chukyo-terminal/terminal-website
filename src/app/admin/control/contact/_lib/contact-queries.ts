import { asc, desc, eq } from 'drizzle-orm';

import { getContactStatus } from './contact';
import { contactRepliesTable, contactsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';

import type { ContactDetail, ContactListItem, ContactMessage, StaffUser } from './contact';


/**
 * クエリを実行するオブジェクト（`db` またはトランザクション）。
 */
type Executor = Pick<typeof db, 'select'>;


/**
 * ユーザーの表示名を返す（表示名が設定されていない場合は氏名）。
 *
 * @param user - ユーザーの氏名と表示名
 * @returns 表示名
 */
const toStaffName = (user: { name: string; displayName: string | null }): string => user.displayName || user.name;


/**
 * 担当者に割り当てられる管理者（有効なユーザー）を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @returns ID順に並べた管理者
 */
export async function selectStaffUsers(executor: Executor = db): Promise<StaffUser[]> {
  const rows = await executor
    .select({ id: usersTable.id, name: usersTable.name, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .orderBy(asc(usersTable.id));
  return rows.map((row) => ({ id: row.id, name: toStaffName(row) }));
}


/**
 * お問い合わせの列（担当者を含む）。
 */
const contactColumns = {
  id: contactsTable.id,
  name: contactsTable.name,
  email: contactsTable.email,
  subject: contactsTable.subject,
  content: contactsTable.content,
  createdAt: contactsTable.createdAt,
  completedAt: contactsTable.completedAt,
  assigneeId: usersTable.id,
  assigneeName: usersTable.name,
  assigneeDisplayName: usersTable.displayName,
};


/**
 * 担当者の列から担当者を組み立てる。
 *
 * @param row - お問い合わせの行
 * @returns 担当者（割り当てていない場合は `null`）
 */
function toAssignee(row: {
  assigneeId: number | null;
  assigneeName: string | null;
  assigneeDisplayName: string | null;
}): StaffUser | null {
  if (row.assigneeId === null) {
    return null;
  }
  return {
    id: row.assigneeId,
    name: toStaffName({ name: row.assigneeName ?? '', displayName: row.assigneeDisplayName }),
  };
}


/**
 * すべてのお問い合わせを、一覧に表示する形で取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @returns 受付日時の降順（新しい順）に並べたお問い合わせ
 */
export async function selectContactList(executor: Executor = db): Promise<ContactListItem[]> {
  const [contacts, replies] = await Promise.all([
    executor
      .select(contactColumns)
      .from(contactsTable)
      .leftJoin(usersTable, eq(contactsTable.assignedTo, usersTable.id))
      .orderBy(desc(contactsTable.createdAt), desc(contactsTable.id)),
    executor
      .select({
        contactId: contactRepliesTable.contactId,
        isFromInquirer: contactRepliesTable.isFromInquirer,
        createdAt: contactRepliesTable.createdAt,
      })
      .from(contactRepliesTable)
      .orderBy(asc(contactRepliesTable.createdAt), asc(contactRepliesTable.id)),
  ]);

  const repliesByContact = new Map<number, typeof replies>();
  for (const reply of replies) {
    repliesByContact.set(reply.contactId, [...(repliesByContact.get(reply.contactId) ?? []), reply]);
  }

  return contacts.map((row) => {
    const messages = repliesByContact.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      content: row.content,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      assignee: toAssignee(row),
      ...getContactStatus(row.completedAt, messages),
      messageCount: messages.length,
      lastActivityAt: messages.at(-1)?.createdAt ?? row.createdAt,
    };
  });
}


/**
 * お問い合わせの詳細（やり取りを含む）を取得する。
 *
 * @param contactId - 問い合わせID
 * @param executor - クエリを実行するオブジェクト
 * @returns お問い合わせの詳細。見つからない場合は `null`
 */
export async function selectContactDetail(contactId: number, executor: Executor = db): Promise<ContactDetail | null> {
  const [contact, replies] = await Promise.all([
    executor
      .select(contactColumns)
      .from(contactsTable)
      .leftJoin(usersTable, eq(contactsTable.assignedTo, usersTable.id))
      .where(eq(contactsTable.id, contactId))
      .limit(1)
      .then((result) => result.at(0)),
    executor
      .select({
        id: contactRepliesTable.id,
        isFromInquirer: contactRepliesTable.isFromInquirer,
        messageId: contactRepliesTable.messageId,
        fromAddress: contactRepliesTable.fromAddress,
        attachmentNames: contactRepliesTable.attachmentNames,
        authorId: usersTable.id,
        authorName: usersTable.name,
        authorDisplayName: usersTable.displayName,
        subject: contactRepliesTable.subject,
        content: contactRepliesTable.content,
        createdAt: contactRepliesTable.createdAt,
      })
      .from(contactRepliesTable)
      .leftJoin(usersTable, eq(contactRepliesTable.authorId, usersTable.id))
      .where(eq(contactRepliesTable.contactId, contactId))
      .orderBy(asc(contactRepliesTable.createdAt), asc(contactRepliesTable.id)),
  ]);
  if (!contact) {
    return null;
  }

  const messages: ContactMessage[] = replies.map((row) => ({
    id: row.id,
    isFromInquirer: row.isFromInquirer,
    author: row.authorId === null
      ? null
      : { id: row.authorId, name: toStaffName({ name: row.authorName ?? '', displayName: row.authorDisplayName }) },
    receivedMail: row.messageId === null
      ? null
      : { messageId: row.messageId, fromAddress: row.fromAddress, attachmentNames: row.attachmentNames },
    subject: row.subject,
    content: row.content,
    createdAt: row.createdAt,
  }));

  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    subject: contact.subject,
    content: contact.content,
    createdAt: contact.createdAt,
    completedAt: contact.completedAt,
    assignee: toAssignee(contact),
    ...getContactStatus(contact.completedAt, messages),
    messages,
  };
}
