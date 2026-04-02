'use client';

import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { Code } from 'lucide-react';


export default function FormPage() {
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await fetch(form.action, {
        method: 'POST',
        body: formData,
        mode: 'no-cors',
      });
      router.push('/contact/thanks');
    } catch (e) {
      console.error('Error submitting form:', e);
    }
  };

  return (
    <>
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
            action="https://docs.google.com/forms/u/0/d/e/1FAIpQLScCFupV2yb6V7iLx8bnvn1fxKvoX56R6qtfhYf-62PhLZmg8Q/formResponse"
            method="POST"
            onSubmit={handleSubmit}
            className="space-y-4 md:space-y-6"
          >
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="entry.419720043"
                required
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
                name="entry.391683196"
                required
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="example@example.com"
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">
                お問い合わせ内容
              </label>
              <textarea
                id="message"
                name="entry.513669972"
                rows={4}
                className="w-full px-3 md:px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm md:text-base"
                placeholder="お問い合わせ内容をご記入ください"
              ></textarea>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 md:px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-md transition-colors duration-200 text-sm md:text-base"
              >
                送信する
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