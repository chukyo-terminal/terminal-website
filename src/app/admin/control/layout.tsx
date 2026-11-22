import Link from 'next/link';

import Footer from '@/components/layouts/admin/footer';
import Header from '@/components/layouts/admin/header';
import { getCurrentUserId } from '@/lib/auth';

import type { JSX } from 'react';

import type { RootLayoutProps } from '@/types';


/**
 * 管理者ページのレイアウトを構成する。
 *
 * ログインしていても、利用者として有効でない（無効にされた、または登録されていない）場合は管理画面を表示しない。
 * ログインページへ転送すると、ログイン済みとして管理画面へ戻されるため、案内を表示してログアウトしてもらう。
 *
 * @param param0 - 子要素
 * @returns 生成したレイアウト
 */
export default async function RootLayout({ children }: RootLayoutProps): Promise<JSX.Element> {
  if ((await getCurrentUserId()) === null) {
    return (
      <div className="flex flex-col min-h-screen">
        <main className="container mx-auto px-4 py-16 space-y-6">
          <h1 className="text-2xl font-bold">このアカウントは利用できません</h1>
          <p className="text-gray-300">
            アカウントが無効になっているか、管理画面の利用者として登録されていません。管理者にお問い合わせください。
          </p>
          <Link href="/api/auth/signout" className="inline-block text-emerald-400 hover:underline">
            ログアウト
          </Link>
        </main>
        <Footer className="mt-auto" />
      </div>
    );
  }
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
