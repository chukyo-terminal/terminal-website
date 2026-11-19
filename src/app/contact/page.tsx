import { db } from '@/lib/drizzle';

import ContactForm from './_components/form';
import { contactsTable } from '@/db/schema';
import { ContactFormSchema } from '@/lib/contact';
import { notifyNewContact } from '@/lib/contact-notification';


export default function FormPage() {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  async function submitForm(name: string, email: string, subject: string, content: string, turnstileToken: string): Promise<void> {
    'use server';
    const parsed = ContactFormSchema.safeParse({ name, email, subject, content });
    if (!parsed.success || !turnstileToken) {
      throw new Error('Invalid parameters');
    }
    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY!,
        response: turnstileToken,
      }),
    });
    const turnstileData = await turnstileResponse.json();
    if (!turnstileData.success) {
      console.error('Turnstile verification failed:', turnstileData);
      throw new Error('Turnstile verification failed');
    }
    const [{ id }] = await db.insert(contactsTable).values(parsed.data).returning({ id: contactsTable.id });
    // 通知の成否に関係なく訪問者には成功を返す
    await notifyNewContact({ id, ...parsed.data });
  }
  return (
    <ContactForm submitForm={submitForm} />
  );
}
