import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';


/**
 * NextAuthのプロバイダーの型定義。
 */
type ClientType = {
  clientId: string;
  clientSecret: string;
};


/**
 * NextAuthのオプションを設定する。
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
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider; // 認証方式をトークンに追加
      }
      return token;
    },
    async signIn({ user, account }) {
      // Google SSOでログインしたアカウントが特定のアカウントか検証
      if (account?.provider === 'google' && user.email?.endsWith('@m.chukyo-u.ac.jp')) {
        const sudoers = ['t325030']; // TODO: DBから取得するようにする
        return sudoers.includes(user.email.split('@')[0]);
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
