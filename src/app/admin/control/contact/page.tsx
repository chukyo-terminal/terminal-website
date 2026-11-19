import ContactList from './_components/contact-list';
import { parseContactListFilters } from './_lib/contact-list';
import { selectContactList, selectStaffUsers } from './_lib/contact-queries';
import { checkPermission, getCurrentUserId } from '@/lib/auth';
import { selectMailSyncStatus, syncContactMail } from '@/lib/contact-mail-sync';

import type { JSX } from 'react';
import type { MailSyncResult } from '@/lib/contact-mail-sync';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


export default async function ContactManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const [contacts, staffUsers, currentUserId, mailSyncStatus] = await Promise.all([
    selectContactList(),
    selectStaffUsers(),
    getCurrentUserId(),
    selectMailSyncStatus(),
  ]);

  async function handleSyncMail(): Promise<ActionResult<MailSyncResult>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    return await syncContactMail();
  }

  return (
    <div className="mx-auto px-4 py-12">
      <ContactList
        contacts={contacts}
        staffUsers={staffUsers}
        currentUserId={currentUserId}
        mailSyncStatus={mailSyncStatus}
        initialFilters={parseContactListFilters(await searchParams)}
        now={new Date()}
        onSyncMail={handleSyncMail}
      />
    </div>
  );
}
