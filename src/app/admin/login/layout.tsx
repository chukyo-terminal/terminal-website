import type React from 'react';
import type { Metadata } from 'next';
import '@/styles/globals.css';

import Header from '@/components/layouts/form/header';

import type { JSX } from 'react';
import type { RootLayoutProps } from '@/types';


export const metadata: Metadata = {
  title: '管理者ログイン - Terminal | 中京大学公式エンジニアサークル',
};


/**
 * ログインフォーム専用のレイアウトを構成する。
 *
 * @param param0 - 子要素
 * @returns 生成したページ
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <>
      <Header />
      <main className="container mx-auto px-4 pt-2 md:py-8">
        {children}
      </main>
    </>
  );
}
