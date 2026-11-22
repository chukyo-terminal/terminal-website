'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { motion } from 'framer-motion';
import { Code } from 'lucide-react';
import { signIn } from 'next-auth/react';

import type { FormEvent, JSX } from 'react';


/**
 * 入力欄の共通の見た目。
 */
const INPUT_CLASS_NAME = 'w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base';


/**
 * ログインページを生成する。
 *
 * 学籍番号（ID）とパスワードは LDAP の会員の情報で確かめる。
 *
 * @returns ログインページ
 */
export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [cuId, setCuId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await signIn('credentials', { cuId, password, redirect: false });
      if (result?.ok && !result.error) {
        router.replace('/admin/control');
        router.refresh();
        return;
      }
      setError('ID またはパスワードが正しくありません。');
    } catch (e) {
      console.error('Failed to sign in:', e);
      setError('ログインできませんでした。時間をおいて再度お試しください。');
    }
    setPassword('');
    setIsSubmitting(false);
  };

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
          管理者ログイン
        </h1>
        <div className="h-1 w-16 md:w-20 bg-emerald-400 rounded"></div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 md:space-y-6"
        >
          <div>
            <label htmlFor="cu-id" className="block text-sm font-medium text-gray-300 mb-1">
              ID（学籍番号）
            </label>
            <input
              type="text"
              id="cu-id"
              name="cuId"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              value={cuId}
              onChange={(event) => setCuId(event.target.value)}
              required
              disabled={isSubmitting}
              className={INPUT_CLASS_NAME}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">パスワード</label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={isSubmitting}
              className={INPUT_CLASS_NAME}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-300">{error}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className={
                'px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium '
                + 'rounded-md transition-colors duration-200 text-sm md:text-base'
              }
            >
              {isSubmitting ? 'ログイン中…' : 'ログイン'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
