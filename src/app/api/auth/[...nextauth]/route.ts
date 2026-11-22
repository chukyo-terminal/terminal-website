import { eq } from 'drizzle-orm';
import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { sudoersTable, usersTable } from '@/db/schema';
import { authenticateLogin } from '@/lib/account';
import { db } from '@/lib/drizzle';


// NextAuthのユーザーに学籍番号（CU_ID）を追加するための型定義
declare module 'next-auth' {
  interface User {
    cuId?: string;
  }
}


// NextAuthのJWTトークンに学籍番号とmodeを追加するための型定義
declare module 'next-auth/jwt' {
  interface JWT {
    /** ログインした利用者の学籍番号（CU_ID）。LDAP で認証したログインにだけ設定される */
    cuId?: string;
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
 * 学籍番号の利用者が上級管理者かどうかを判定する。
 *
 * @param cuId - 学籍番号（CU_ID）
 * @returns 上級管理者の場合は `true`
 */
async function isSudoer(cuId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sudoersTable.id })
    .from(sudoersTable)
    .innerJoin(usersTable, eq(sudoersTable.id, usersTable.id))
    .where(eq(usersTable.cuId, cuId))
    .limit(1);
  return rows.length > 0;
}


/**
 * NextAuthのオプション。
 *
 * ログインは LDAP（学籍番号とパスワード）で認証する。LDAP の会員でも、アプリの利用者として有効でなければログインできない（`lib/account.ts`）。
 */
const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'LDAP',
      credentials: {
        cuId: { label: 'ID（学籍番号）', type: 'text' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const account = await authenticateLogin(credentials?.cuId ?? '', credentials?.password ?? '');
          return account ? { id: String(account.id), name: account.name, cuId: account.cuId } : null;
        } catch (e) {
          // LDAP に接続できない場合なども、利用者にはログインできなかったことだけを伝える
          console.error('Failed to authenticate with LDAP:', e);
          return null;
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 4 * 60 * 60, // 4時間（秒単位）
  },
  pages: {
    signIn: '/admin/login',
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.cuId) {
        token.cuId = user.cuId;
        token.mode = 'user';
      }
      // 学籍番号のないトークン（LDAP 導入前の Google 連携で発行されたもの）は、ログインしていないものとして扱う
      const cuId = token.cuId;
      if (!cuId) {
        return token;
      }
      token.isSudoer = await isSudoer(cuId);
      if (trigger === 'update') {
        token.mode = session?.user?.mode === 'root' && token.isSudoer ? 'root' : 'user';
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
