import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth-config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/bookings',
  '/book',
  '/account',
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !req.auth) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icons).*)'],
};
