'use client';

import { SessionProvider } from 'next-auth/react';

import type { RootLayoutProps } from '@/types';

/**
 * 子要素をそのまま親に渡すためのレイアウトコンポーネント。
 *
 * @param param0 - 子要素
 * @returns 子要素
 */
export default function LayoutPassthrough({ children }: RootLayoutProps): React.ReactNode {
  return <SessionProvider>{children}</SessionProvider>;
}
