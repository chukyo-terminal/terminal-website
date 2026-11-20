'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { Code } from 'lucide-react';

import { formatDateTime } from '@/app/admin/control/posts/_lib/date-format';
import {
  CONTACT_CONTENT_MAX_LENGTH, CONTACT_NAME_MAX_LENGTH, CONTACT_SESSION_INVALID_MESSAGE, CONTACT_SUBJECT_MAX_LENGTH,
} from '@/utils/contact';

import type { JSX } from 'react';
import type { ContactDetailsFormValues } from '@/utils/contact';
import type { ActionResult } from '@/types';


type Properties = {
  /** 確認済みのメールアドレス */
  email: string;
  /** 入力用 URL の有効期限（ISO 8601 形式） */
  expiresAt: string;
  submitContact: (values: ContactDetailsFormValues) => Promise<ActionResult>;
};


/**
 * 入力欄の共通のクラス。
 */
const INPUT_CLASS_NAME = 'w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base';


/**
 * お問い合わせフォームの2番目の段階（お問い合わせ内容の入力）。
 *
 * @param param0 - プロパティ
 * @returns フォームの要素
 */
export default function ContactDetailsForm({ email, expiresAt, submitContact }: Properties): JSX.Element {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto space-y-6 md:space-y-8"
    >
      <div className="space-y-3 md:space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-6 w-6 md:h-8 md:w-8" />
          お問い合わせフォーム
        </h1>
        <div className="h-1 w-16 md:w-20 bg-emerald-400 rounded"></div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);
            setError(null);
            try {
              const result = await submitContact({ name, subject, content });
              if (result.ok) {
                router.replace('/contact/thanks');
                return;
              }
              setError(result.error);
            } catch (e) {
              console.error(e);
              setError('エラーが発生しました。時間をおいて再度お試しください。');
            }
            setIsSubmitting(false);
          }}
          className="space-y-4 md:space-y-6"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={email}
              readOnly
              className={`${INPUT_CLASS_NAME} text-gray-400! cursor-default`}
            />
            <p className="mt-1 text-xs text-gray-400">
              確認済みのメールアドレスです。このURLの有効期限は {formatDateTime(new Date(expiresAt))} です。
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
              お名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              required
              maxLength={CONTACT_NAME_MAX_LENGTH}
              className={INPUT_CLASS_NAME}
              placeholder="中京 太郎"
            />
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-300 mb-1">
              件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={isSubmitting}
              required
              maxLength={CONTACT_SUBJECT_MAX_LENGTH}
              className={INPUT_CLASS_NAME}
              placeholder="件名をご記入ください"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
              お問い合わせ内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={isSubmitting}
              required
              maxLength={CONTACT_CONTENT_MAX_LENGTH}
              className={INPUT_CLASS_NAME}
              placeholder="お問い合わせ内容をご記入ください"
            ></textarea>
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300 space-y-2">
              <p>{error}</p>
              {error === CONTACT_SESSION_INVALID_MESSAGE && (
                <p>
                  入力した内容は、このページを閉じると失われます。必要に応じて控えてから、
                  <Link href="/contact" className="underline hover:text-red-200">メールアドレスの入力</Link>
                  に戻ってください。
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className={'px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base' + (isSubmitting ? ' opacity-50 cursor-not-allowed' : '')}
            >
              {isSubmitting ? '送信中...' : '送信する'}
            </button>
          </div>
        </form>
      </div>

      <div className="text-xs md:text-sm text-gray-400 text-center">
        <p>※ 必須項目は必ずご記入ください</p>
        <p>※ 48時間以内に返信いたします</p>
      </div>
    </motion.div>
  );
}
