import { NextResponse } from 'next/server';

const COOKIE = 'roi_auth';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow: login page, auth API, Next.js internals, public pitch deck
  if (
    pathname === '/login' ||
    pathname === '/investor-pitch.html' ||
    pathname === '/api/scout/export' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE)?.value;
  if (token && token === process.env.SESSION_SECRET) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to login, preserving intended destination
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
