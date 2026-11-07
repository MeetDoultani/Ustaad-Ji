import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { resolveLocale } from './config';
import { getCurrentUser } from '@/lib/auth-server';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  let userLanguage: string | null = null;
  // If no cookie exists, check logged-in user profile
  if (!cookieLocale) {
    try {
      const user = await getCurrentUser();
      userLanguage = user?.language || null;
    } catch {
      // Ignored if auth not available
    }
  }

  const locale = resolveLocale(cookieLocale, userLanguage);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
