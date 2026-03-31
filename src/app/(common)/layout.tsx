import type React from 'react';
import type { Metadata } from 'next';
import '@/styles/globals.css';

import Footer from '@/components/layouts/footer';
import Header from '@/components/layouts/header';

import type { JSX } from 'react';
import type { RootLayoutProps } from '@/types';


export const metadata: Metadata = {
  title: 'Terminal | 中京大学公式エンジニアサークル',
  description: 'プログラミングに興味を持つ学生のためのサークル'
};


/**
 * 全ページ共通のレイアウトを構成する。
 *
 * @param param0 - 子要素
 * @returns 生成したページ
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="container mx-auto px-4 py-16 space-y-32">
        {children}
      </main>
      <Footer className="mt-auto" />
    </div>
  );
}
