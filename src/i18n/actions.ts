'use server';

import { cookies } from 'next/headers';
import { isValidLocale, Locale } from './config';
import { getCurrentUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

export async function setLocaleAction(newLocale: string) {
  if (!isValidLocale(newLocale)) {
    return { success: false, error: 'INVALID_LOCALE' as const };
  }

  const cookieStore = await cookies();
  cookieStore.set('NEXT_LOCALE', newLocale, {
    path: '/',
    maxAge: 31536000, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  try {
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.language !== newLocale) {
      await db.user.update({
        where: { id: currentUser.id },
        data: { language: newLocale },
      });
    }
  } catch {
    // Non-fatal if session check or DB update fails during locale switch
  }

  return { success: true, locale: newLocale as Locale };
}
