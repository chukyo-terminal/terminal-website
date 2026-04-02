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
  const pathSegments = new PathSegmentReader(request.nextUrl.pathname);

  switch (pathSegments.next()) {
    case 'admin': {
      switch (pathSegments.next()) {
        case 'login': {
          if (token) {
            // ログイン済みの場合は管理画面にリダイレクト
            const controlPanelPath = token.mode === 'root' ? '/admin/control/root' : '/admin/control';
            return NextResponse.redirect(new URL(controlPanelPath, request.url));
          } else {
            // ログインしていない場合はそのままログインページへ
            return NextResponse.next();
          }
        }
        case 'control': {
          if (!token) {
            // ログインしていない場合はログインページへリダイレクト
            return NextResponse.redirect(new URL('/admin/login', request.url));
          } else {
            switch (pathSegments.next()) {
              case 'root': {
                if (token.mode === 'root') { // eslint-disable-line unicorn/prefer-ternary
                  // 上級管理者はそのままアクセスを許可
                  return NextResponse.next();
                } else {
                  // 一般管理者は通常の管理画面へリダイレクト
                  return NextResponse.redirect(new URL('/admin/control', request.url));
                }
              }
              default: {
                if (token.mode === 'root') { // eslint-disable-line unicorn/prefer-ternary
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
        case 'api': {
          switch (pathSegments.next()) {
            case 'auth': {
              // 認証関連のAPIは認証不要
              return NextResponse.next();
            }
            case 'sudoers':
            case 'users': {
              if (!token) {
                // ログインしていない場合は認証エラー
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
              } else if (token.mode !== 'root') {
                // 一般管理者はこれらのAPIにアクセスできない
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
              } else {
                // 上級管理者はアクセスを許可
                return NextResponse.next();
              }
            }
            default: {
              if (!token) { // eslint-disable-line unicorn/prefer-ternary
                // ログインしていない場合は認証エラー
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
              } else {
                // その他のAPIはログインしていればアクセスを許可
                return NextResponse.next();
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
  matcher: ['/admin/:path*', '/api/:path*'],
};
