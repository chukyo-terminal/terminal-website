'use client';

import { motion } from 'framer-motion';
import { Terminal, TrendingUp, Code, Users } from 'lucide-react';

export default function Overview() {
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
          <Terminal className="mr-2 h-8 w-8" />
          サークル概要
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        viewport={{ once: true }}
        className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg"
      >
        <div className="prose prose-invert max-w-none">
          <p className="text-lg leading-relaxed mb-4">
            Terminalは、プログラミングに興味を持つ学生が集まる中京大学の学生団体です。私たちは、実践的なスキルを身につけ、ハッカソンで賞を獲得することを目指しています。
          </p>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="bg-gray-900 p-5 rounded-lg border border-gray-700 flex flex-col items-center text-center">
              <TrendingUp className="h-10 w-10 text-emerald-400 mb-3" />
              <h3 className="text-xl font-semibold mb-2">技術力向上</h3>
              <p className="text-gray-400">最新の技術トレンドを学び、実践的なスキルを磨きます</p>
            </div>

            <div className="bg-gray-900 p-5 rounded-lg border border-gray-700 flex flex-col items-center text-center">
              <Code className="h-10 w-10 text-emerald-400 mb-3" />
              <h3 className="text-xl font-semibold mb-2">チーム開発</h3>
              <p className="text-gray-400">協力してプロジェクトを完成させる経験を積みます</p>
            </div>

            <div className="bg-gray-900 p-5 rounded-lg border border-gray-700 flex flex-col items-center text-center">
              <Users className="h-10 w-10 text-emerald-400 mb-3" />
              <h3 className="text-xl font-semibold mb-2">コミュニティ</h3>
              <p className="text-gray-400">同じ興味を持つ仲間と交流し、知識を共有します</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
