import { eq } from 'drizzle-orm';
import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

import { sudoersTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';


// NextAuthのJWTトークンにmodeを追加するための型定義
declare module 'next-auth/jwt' {
  interface JWT {
    mode?: 'user' | 'root';
    isSudoer?: boolean;
  }
}


// NextAuthのセッションにmode, isSudoerを追加するための型定義
// WARNING: この値をアクセス制限に使用しないこと
declare module 'next-auth' {
  interface Session {
    user: {
      mode?: 'user' | 'root';
      isSudoer?: boolean;
    };
  }
}


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
    async signIn({ user, account }) {
      // Google SSOでログインしたアカウントが登録されているか検証
      if (account?.provider === 'google' && user.email?.endsWith('@m.chukyo-u.ac.jp')) {
        const cuId = user.email.split('@')[0].toUpperCase();
        let canSignIn = false;
        await db.transaction(async (tx) => {
          const rows = await tx.select({ id: usersTable.id, name: usersTable.name, isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.cuId, cuId)).limit(1);
          if (rows.length > 0) {
            if (rows[0].isActive) {
              canSignIn = true;
            }
            if (user.name && rows[0].name !== user.name) {
              // 名前が一致しない場合は更新
              await tx.update(usersTable).set({ name: user.name }).where(eq(usersTable.id, rows[0].id));
            }
          }
        });
        return canSignIn;
      }
      // 許可しない場合はfalse
      return false;
    },
    async jwt({ token, trigger, session }) {
      const cuId = token.email?.split('@')[0].toUpperCase();
      if (!cuId) {
        throw new Error('Invalid user state');
      }
      const isSudoer = await db.select().from(sudoersTable).leftJoin(usersTable, eq(sudoersTable.id, usersTable.id)).where(eq(usersTable.cuId, cuId)).limit(1).then(rows => rows.length > 0);
      token.isSudoer = isSudoer;
      switch (trigger) {
        case 'signIn': {
          token.mode = 'user';
          token.isSudoer = isSudoer;
          break;
        }
        case 'signUp': {
          throw new Error('Sign up is not allowed');
        }
        case 'update': {
          token.mode = session?.user?.mode === 'root' && isSudoer ? 'root' : 'user';
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.mode = token.mode;
        session.user.isSudoer = token.isSudoer;
      }
      return session;
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
