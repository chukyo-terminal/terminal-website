'use client';

import { useState } from 'react';

import { motion } from 'framer-motion';
import { Code } from 'lucide-react';
import { signIn } from 'next-auth/react';

import type { FormEvent, JSX } from 'react';


/**
 * ログインページを生成する。
 *
 * @returns ログインページ
 */
export default function LoginPage(): JSX.Element {
  const [uid, setUid] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (uid === 'root') {
      signIn('google', undefined, { login_hint: password + '@m.chukyo-u.ac.jp', prompt: 'login' });
    } else {
      // TODO: APIを呼び出してログイン処理を行う
      alert('未実装の機能です。');
    }
  }

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
            <label htmlFor="uid" className="block text-sm font-medium text-gray-300 mb-1">ID</label>
            <input
              type="text"
              id="uid"
              value={uid}
              onChange={(event) => setUid(event.target.value)}
              required
              className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">パスワード</label>
            <input
              type={uid === 'root' ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base"
            >
              ログイン
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
