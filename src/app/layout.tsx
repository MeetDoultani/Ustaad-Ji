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

export const metadata: Metadata = {
  title: 'Indian Salon Booking | अब लाइन में नहीं, स्लॉट में',
  description: 'Book traditional neighbourhood salons and barbers without walk-in waiting. Real price boards, appointment diary, and digital tokens.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Salon Booking',
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

  return (
    <html
      lang={locale}
      className={`${yatraOne.variable} ${hind.variable} ${baloo2.variable} ${specialElite.variable}`}
    >
      <body className="bg-paper text-ink font-body min-h-screen">
        <AuthProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
