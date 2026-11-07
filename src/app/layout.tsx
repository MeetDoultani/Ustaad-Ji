import type { Metadata, Viewport } from 'next';
import { Yatra_One, Hind, Baloo_2, Special_Elite } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import AuthProvider from '@/components/providers/AuthProvider';
import './globals.css';

const yatraOne = Yatra_One({
  weight: '400',
  subsets: ['latin', 'devanagari'],
  variable: '--font-sign',
  display: 'swap',
});

const hind = Hind({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'devanagari'],
  variable: '--font-body',
  display: 'swap',
});

const baloo2 = Baloo_2({
  weight: ['600', '700'],
  subsets: ['latin', 'devanagari'],
  variable: '--font-label',
  display: 'swap',
});

const specialElite = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-token',
  display: 'swap',
});

import { cookies } from 'next/headers';
import LanguagePickerOverlay from '@/components/ui/LanguagePickerOverlay';

export const metadata: Metadata = {
  title: {
    default: 'Ustaad-Ji | No more waiting in line. Book your slot.',
    template: '%s | Ustaad-Ji',
  },
  description: 'Book traditional neighbourhood salons and ustaad barbers without waiting in queue. Authentic rate cards, appointment diary, and digital tokens.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ustaad-Ji',
  },
  openGraph: {
    title: 'Ustaad-Ji',
    description: 'No more waiting in line. Book your slot.',
    siteName: 'Ustaad-Ji',
  },
  twitter: {
    card: 'summary',
    title: 'Ustaad-Ji',
    description: 'No more waiting in line. Book your slot.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F5E57',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const hasLocaleCookie = Boolean(cookieStore.get('NEXT_LOCALE')?.value);

  return (
    <html
      lang={locale}
      className={`${yatraOne.variable} ${hind.variable} ${baloo2.variable} ${specialElite.variable}`}
    >
      <body className="bg-paper text-ink font-body min-h-screen">
        <AuthProvider>
          <NextIntlClientProvider messages={messages}>
            <LanguagePickerOverlay initialHasCookie={hasLocaleCookie} />
            {children}
          </NextIntlClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
