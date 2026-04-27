import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.formData();
  const password = body.get('password');
  const from = body.get('from') || '/dashboard';

  if (password === process.env.SITE_PASSWORD) {
    const response = NextResponse.redirect(new URL(from, req.url));
    response.cookies.set('roi_auth', process.env.SITE_PASSWORD, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('from', from);
  loginUrl.searchParams.set('error', '1');
  return NextResponse.redirect(loginUrl);
}
