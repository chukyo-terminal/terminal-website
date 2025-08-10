import Footer from '@/components/layouts/admin/footer';
import Header from '@/components/layouts/admin/header';

import type { JSX } from 'react';

import type { RootLayoutProps } from '@/types';


/**
 * 管理者ページのレイアウトを構成する。
 *
 * @param param0 - 子要素
 * @returns 生成したレイアウト
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-16 space-y-32">
        {children}
      </main>
      <Footer />
    </>
  );
}
