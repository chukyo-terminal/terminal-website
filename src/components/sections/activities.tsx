/* eslint-disable sonarjs/no-redundant-boolean */

'use client';

import { motion } from 'framer-motion';
import { Code, Users, Trophy, BookOpen } from 'lucide-react';
import Image from 'next/image';

export default function Activities() {
  const activities = [
    {
      title: 'ハッカソンでの受賞を目指す',
      description:
        '外部ハッカソンに積極的に参加し、チームで協力して賞を獲得することを目標としています。実践的な経験を通じて、問題解決能力やプログラミング技術を磨きます。',
      icon: <Trophy className="h-10 w-10 text-emerald-400" />,
      image: '/placeholder.svg?height=200&width=400',
    },
    {
      title: '勉強会の開催',
      description:
        'サークル内で、最新の技術やトピックに関する勉強会を定期的に開催します。コーディングはもちろん、資格試験の対策なども行います。',
      icon: <BookOpen className="h-10 w-10 text-emerald-400" />,
      image: '/placeholder.svg?height=200&width=400',
    },
    {
      title: 'サークル内ミニハッカソン',
      description:
        '1ヶ月程度の期間でグループを組み、共同開発プロジェクトに取り組みます。最後に成果発表会を行い、お互いの成長を確認します。',
      icon: <Users className="h-10 w-10 text-emerald-400" />,
      image: '/placeholder.svg?height=200&width=400',
    },
  ];

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
          活動内容
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </motion.div>

      <div className="space-y-16">
        {activities.map((activity, index) => (
          <motion.div
            key={activity.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.2 }}
            viewport={{ once: true }}
            className={`flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 items-center`}
          >
            <div className="w-full md:w-1/2 space-y-4">
              <div className="flex items-center space-x-3">
                {activity.icon}
                <h3 className="text-2xl font-bold">{activity.title}</h3>
              </div>
              <p className="text-gray-300 leading-relaxed">{activity.description}</p>
            </div>
            {false && <div className="w-full md:w-1/2">
              <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg">
                <Image
                  src={activity.image || '/placeholder.svg'}
                  alt={activity.title}
                  width={400}
                  height={200}
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
