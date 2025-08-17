import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

import { prisma } from '@/lib/prisma';


/**
 * NextAuthのプロバイダーの型定義。
 */
type ClientType = {
  clientId: string;
  clientSecret: string;
};


/**
 * NextAuthのオプション。
 */
const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    } as ClientType),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 4 * 60 * 60, // 4時間（秒単位）
  },
  callbacks: {
    async jwt({ token, trigger }) {
      switch (trigger) {
        case 'signIn': {
          token.mode = 'user';
          break;
        }
        case 'signUp': {
          throw new Error('Sign up is not allowed');
        }
      }
      return token;
    },
    async signIn({ user, account }) {
      // Google SSOでログインしたアカウントが登録されているか検証
      if (account?.provider === 'google' && user.email?.endsWith('@m.chukyo-u.ac.jp')) {
        const cuId = user.email.split('@')[0];
        const result = await prisma.user.findUnique({ where: { cuId } });
        return !!result;
      }
      // 許可しない場合はfalse
      return false;
    },
  },
};


/**
 * NextAuthのリクエストハンドラー。
 */
const handler = NextAuth(authOptions);


/**
 * GETおよびPOSTリクエストをNextAuthのリクエストハンドラーで処理する。
 */
export { handler as GET, handler as POST };
