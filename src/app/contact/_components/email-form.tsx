'use client';

import { useState } from 'react';

import { motion } from 'framer-motion';
import { Code, MailCheck } from 'lucide-react';

import { CONTACT_EMAIL_MAX_LENGTH, CONTACT_EMAIL_TURNSTILE, CONTACT_SESSION_TTL_HOURS } from '@/utils/contact';
import { useTurnstile } from '@/utils/use-turnstile';

import type { JSX } from 'react';
import type { ActionResult } from '@/types';


type Properties = {
  requestContactLink: (email: string, turnstileToken: string) => Promise<ActionResult<{ email: string }>>;
};


/**
 * お問い合わせフォームの最初の段階（メールアドレスの入力）。
 *
 * 送信すると、入力したメールアドレスに、お問い合わせ内容を入力するための URL が届く。
 *
 * @param param0 - プロパティ
 * @returns フォームの要素
 */
export default function ContactEmailForm({ requestContactLink }: Properties): JSX.Element {
  const [sentTo, setSentTo] = useState<string | null>(null);

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

      {sentTo === null ? (
        <EmailStep requestContactLink={requestContactLink} onSent={setSentTo} />
      ) : (
        <SentNotice email={sentTo} onBack={() => setSentTo(null)} />
      )}
    </motion.div>
  );
}


/**
 * メールアドレスの入力欄と Turnstile のウィジェット。
 *
 * @param param0 - プロパティ
 * @returns フォームの要素
 */
function EmailStep({ requestContactLink, onSent }: Properties & { onSent: (email: string) => void }): JSX.Element {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { containerRef, status: turnstileStatus, takeToken } = useTurnstile({
    siteKey: process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? '',
    action: CONTACT_EMAIL_TURNSTILE.action,
    cData: CONTACT_EMAIL_TURNSTILE.cdata,
  });
  const canSubmit = turnstileStatus === 'ready' && !isSubmitting;

  return (
    <>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);
            setError(null);
            try {
              const result = await requestContactLink(email, await takeToken());
              if (result.ok) {
                onSent(result.data.email);
              } else {
                setError(result.error);
              }
            } catch (e) {
              console.error(e);
              setError('エラーが発生しました。時間をおいて再度お試しください。');
            } finally {
              setIsSubmitting(false);
            }
          }}
          className="space-y-4 md:space-y-6"
        >
          <p className="text-sm md:text-base text-gray-300">
            ご入力いただいたメールアドレスに、お問い合わせ内容を入力するためのURLをお送りします。
          </p>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              required
              maxLength={CONTACT_EMAIL_MAX_LENGTH}
              className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
              placeholder="example@example.com"
            />
          </div>

          <div ref={containerRef} className="flex justify-center"></div>

          <div className="text-xl text-red-500 text-center">
            {turnstileStatus === 'error' && 'YOU ARE A ROBOT!'}
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className={'px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base' + (canSubmit ? '' : ' opacity-50 cursor-not-allowed')}
            >
              {isSubmitting ? '送信中...' : 'URLを受け取る'}
            </button>
          </div>
        </form>
      </div>

      <div className="text-xs md:text-sm text-gray-400 text-center">
        <p>※ URLの有効期限は{CONTACT_SESSION_TTL_HOURS}時間です</p>
        <p>※ 48時間以内に返信いたします</p>
      </div>
    </>
  );
}


/**
 * 入力用 URL を送信したことを知らせる。
 *
 * @param param0 - 送信先のメールアドレスと、入力し直すときの処理
 * @returns 要素
 */
function SentNotice({ email, onBack }: { email: string; onBack: () => void }): JSX.Element {
  return (
    <div role="status" className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg space-y-4">
      <h2 className="text-xl md:text-2xl font-bold text-emerald-400 flex items-center">
        <MailCheck className="mr-2 h-6 w-6" aria-hidden />
        メールを送信しました
      </h2>
      <p className="text-sm md:text-base text-gray-300">
        <span className="font-mono text-gray-100 break-all">{email}</span> 宛てに、お問い合わせ内容を入力するためのURLをお送りしました。
        メールに記載されたURLを開き、お問い合わせ内容をご入力ください。
      </p>
      <ul className="list-disc pl-5 text-xs md:text-sm text-gray-400 space-y-1">
        <li>URLの有効期限は{CONTACT_SESSION_TTL_HOURS}時間です。</li>
        <li>メールが届かない場合は、迷惑メールフォルダをご確認いただくか、メールアドレスに誤りがないかご確認ください。</li>
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onBack}
          className="px-4 md:px-6 py-2 border border-gray-600 hover:bg-gray-700 text-gray-200 font-medium rounded-md transition-colors duration-200 text-sm md:text-base"
        >
          メールアドレスを入力し直す
        </button>
      </div>
    </div>
  );
}
