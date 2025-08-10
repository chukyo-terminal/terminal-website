import { NextResponse } from 'next/server';

import { getToken } from 'next-auth/jwt';

import type { NextRequest } from 'next/server';


export async function middleware(request: NextRequest) { // eslint-disable-line sonarjs/cognitive-complexity
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (request.nextUrl.pathname === '/admin/login') {
    if (token) {
      const controlPanelPath = token.provider === 'google' ? '/admin/control/root' : '/admin/control';
      return NextResponse.redirect(new URL(controlPanelPath, request.url));
    } else {
      return NextResponse.next();
    }
  } else if (request.nextUrl.pathname === '/admin/control/root') {
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    } else if (token.provider === 'google') {
      return NextResponse.next();
    } else {
      return NextResponse.redirect(new URL('/admin/control', request.url));
    }
  } else if (request.nextUrl.pathname.startsWith('/admin/control')) {
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    } else if (token.provider === 'google') {
      return NextResponse.redirect(new URL('/admin/control/root', request.url));
    } else {
      return NextResponse.next();
    }
  } else if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    } else if (token.provider === 'google') {
      return NextResponse.redirect(new URL('/admin/control/root', request.url));
    } else {
      return NextResponse.redirect(new URL('/admin/control', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
