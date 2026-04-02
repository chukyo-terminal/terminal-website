'use client'

import { motion } from 'framer-motion'
import { MapPin, Code } from 'lucide-react'
import Image from 'next/image'

export default function Location() {
  return (
    <div className="space-y-8  z-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        viewport={{ once: true }}
        className="space-y-4"
      >
        <h2 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          活動場所
        </h2>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="space-y-4"
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-lg">
            <div className="flex items-start space-x-3 mb-4">
              <MapPin className="h-6 w-6 text-emerald-400 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-xl font-bold">11号館4階</h3>
                <p className="text-gray-400 mt-2">
                  主な活動場所は11号館4階の共有スペースです。
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                <p className="text-gray-300">金曜日: 17:00から</p>
              </div>              
            </div>

            <div className="mt-6 p-4 bg-gray-900 rounded border border-gray-700">
              <p className="text-sm text-gray-400">
                <span className="text-emerald-400 font-semibold">注意:</span>{' '}
                活動時間外に活動場所に入ることは禁止です。
              </p>
            </div>
          </div>
        </motion.div>

        {false && <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg"
        >
          <Image
            src="/placeholder.svg?height=400&width=600"
            alt="17号館4階 活動場所"
            width={600}
            height={400}
            className="w-full h-auto object-cover"
          />
        </motion.div>}
      </div>
    </div>
  )
}
