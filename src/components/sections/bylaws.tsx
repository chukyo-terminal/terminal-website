'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Code } from 'lucide-react';

import type { JSX } from 'react';

export default function BylawsSection(): JSX.Element {
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
          会則
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <p className="text-gray-300 mb-6">
          本会の会則は<Link href="/bylaws" className="text-blue-400 hover:underline">こちら</Link>からご確認いただけます。
          加入をご希望の方はお申し込み前にご一読ください。
        </p>
      </motion.div>
    </div>
  );
}
