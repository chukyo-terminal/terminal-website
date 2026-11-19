'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { Code } from 'lucide-react';

import {
  CONTACT_CONTENT_MAX_LENGTH, CONTACT_EMAIL_MAX_LENGTH, CONTACT_NAME_MAX_LENGTH, CONTACT_SUBJECT_MAX_LENGTH,
} from '@/lib/contact';

import type { JSX } from 'react';

type Properties = {
  submitForm: (name: string, email: string, subject: string, content: string, turnstileToken: string) => Promise<void>;
};

export default function ContactForm({ submitForm }: Properties): JSX.Element {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isTurnstileErrored, setIsTurnstileErrored] = useState(false);
  useEffect(() => {
    const handleTurnstileToken = (event: CustomEvent) => {
      console.log('Turnstile token received');
      setIsTurnstileErrored(false);
      setTurnstileToken(event.detail);
    };
    const handleTurnstileError = () => {
      console.error('Turnstile error occurred');
      setIsTurnstileErrored(true);
      setTurnstileToken(null);
    };
    const handleTurnstileExpired = () => {
      console.warn('Turnstile token expired');
      setTurnstileToken(null);
    };

    globalThis.addEventListener('turnstileToken', handleTurnstileToken as EventListener);
    globalThis.addEventListener('turnstileError', handleTurnstileError as EventListener);
    globalThis.addEventListener('turnstileExpired', handleTurnstileExpired as EventListener);

    return () => {
      globalThis.removeEventListener('turnstileToken', handleTurnstileToken as EventListener);
      globalThis.removeEventListener('turnstileError', handleTurnstileError as EventListener);
      globalThis.removeEventListener('turnstileExpired', handleTurnstileExpired as EventListener);
    };
  }, []);
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <Script id="turnstile-callback">
        {`
          function turnstileCallback(token) {
            window.dispatchEvent(new CustomEvent('turnstileToken', { detail: token }));
          }
          function turnstileErrorCallback() {
            window.dispatchEvent(new CustomEvent('turnstileError'));
          }
          function turnstileExpiredCallback() {
            window.dispatchEvent(new CustomEvent('turnstileExpired'));
          }
        `}
      </Script>

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
              if (!turnstileToken) {
                alert('Turnstileの検証が完了していません。');
                return;
              }
              setIsSubmitting(true);
              try {
                await submitForm(name, email, subject, content, turnstileToken);
                router.push('/contact/thanks');
              } catch (e) {
                console.error(e);
                alert('エラーが発生しました');
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="space-y-4 md:space-y-6"
          >
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSubmitting}
                required
                maxLength={CONTACT_NAME_MAX_LENGTH}
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="中京 太郎"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                メールアドレス <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                required
                maxLength={CONTACT_EMAIL_MAX_LENGTH}
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="example@example.com"
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
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="件名をご記入ください"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
                お問い合わせ内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="message"
                rows={4}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={isSubmitting}
                required
                maxLength={CONTACT_CONTENT_MAX_LENGTH}
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="お問い合わせ内容をご記入ください"
              ></textarea>
            </div>

            <div
              className="flex justify-center cf-turnstile"
              data-sitekey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY!}
              data-callback="turnstileCallback"
              data-error-callback="turnstileErrorCallback"
              data-expired-callback="turnstileExpiredCallback"
            ></div>

            <div className="text-xl text-red-500 text-center">
              {isTurnstileErrored && 'YOU ARE A ROBOT!'}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!turnstileToken || isSubmitting}
                className={'px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base' + (!turnstileToken || isSubmitting ? ' opacity-50 cursor-not-allowed' : '')}
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
    </>
  );
}
