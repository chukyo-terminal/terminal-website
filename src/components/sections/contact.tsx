'use client';

import { motion } from 'framer-motion';
import { Code, Mail, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function Contact() {
  return (
    <div className="space-y-8 z-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        viewport={{ once: true }}
        className="space-y-4"
      >
        <h2 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          お問い合わせ
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        viewport={{ once: true }}
        className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 shadow-lg"
      >
        <div className="flex items-center space-x-3 mb-6">
          <Mail className="h-6 w-6 text-emerald-400" />
          <h3 className="text-xl font-bold">お問い合わせフォーム</h3>
        </div>

        <p className="text-gray-300 mb-6">
          サークルへの入会希望や質問がありましたら、以下のフォームからお問い合わせください。
          48時間以内に返信いたします。
        </p>

        <div className="w-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
          <div className="w-full flex flex-col items-center justify-center p-4 md:p-6 text-center">
            <ExternalLink className="h-12 w-12 text-emerald-400 mb-4" />
            <h4 className="text-lg font-semibold mb-2">お問い合わせフォーム</h4>
            <p className="text-gray-400 mb-4">以下のボタンをクリックして、お問い合わせフォームにアクセスしてください</p>
            <Link
              href="/contact"
              target="_blank"
              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200"
            >
              <span>フォームを開く</span>
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-900 rounded border border-gray-700">
          <p className="text-sm text-gray-400">
            <span className="text-emerald-400 font-semibold">注意:</span>{' '}
            お問い合わせの際は、お名前、メールアドレスを必ずご記入ください。 返信の際必要となります。
          </p>
        </div>
      </motion.div>
    </div>
  );
}
