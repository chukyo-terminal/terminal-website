import { NextResponse } from 'next/server';

import { getToken } from 'next-auth/jwt';

import type { NextRequest } from 'next/server';


/**
 * URLパスを階層ごとに読み取るためのユーティリティクラス。
 *
 * 例: `/admin/control/root` というパスがあった場合、最初の `next()` 呼び出しで "admin"、次の呼び出しで "control"、最後の呼び出しで "root" を返す。
 */
class PathSegmentReader {
  private segments: string[];
  private index: number;

  /**
   * `PathSegmentReader` のインスタンスを生成する。
   *
   * @param path - 読み取るURLパス。例: `/admin/control/root`
   */
  constructor(path: string) {
    this.segments = path.split('/').slice(1);
    this.index = 0;
  }

  /**
   * 次のパス階層を取得する。
   *
   * @returns 次のパス階層、存在しない場合は `null`
   */
  public next(): string | null {
    return this.index < this.segments.length ? this.segments[this.index++] : null;
  }
}


export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  // 学籍番号のないトークン（LDAP 導入前の Google 連携で発行されたもの）は、ログインしていないものとして扱う
  const isLoggedIn = Boolean(token?.cuId);
  const pathSegments = new PathSegmentReader(request.nextUrl.pathname);

  switch (pathSegments.next()) {
    case 'admin': {
      switch (pathSegments.next()) {
        case 'login': {
          if (isLoggedIn) {
            // ログイン済みの場合は管理画面にリダイレクト
            const controlPanelPath = token?.mode === 'root' ? '/admin/control/root' : '/admin/control';
            return NextResponse.redirect(new URL(controlPanelPath, request.url));
          } else {
            // ログインしていない場合はそのままログインページへ
            return NextResponse.next();
          }
        }
        case 'control': {
          if (!isLoggedIn) {
            // ログインしていない場合はログインページへリダイレクト
            return NextResponse.redirect(new URL('/admin/login', request.url));
          } else {
            switch (pathSegments.next()) {
              case 'root': {
                if (token?.mode === 'root') { // eslint-disable-line unicorn/prefer-ternary
                  // 上級管理者はそのままアクセスを許可
                  return NextResponse.next();
                } else {
                  // 一般管理者は通常の管理画面へリダイレクト
                  return NextResponse.redirect(new URL('/admin/control', request.url));
                }
              }
              default: {
                if (token?.mode === 'root') { // eslint-disable-line unicorn/prefer-ternary
                  // 上級管理者は上級管理者用の管理画面へリダイレクト
                  return NextResponse.redirect(new URL('/admin/control/root', request.url));
                } else {
                  // 一般管理者はそのままアクセスを許可
                  return NextResponse.next();
                }
              }
            }
          }
        }
      }
    }
  }

  return NextResponse.next();
}


export const config = {
  matcher: ['/admin/:path*'],
};
