import React from 'react';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';
import LoginFormClient from './LoginFormClient';
import { getTranslations } from 'next-intl/server';

interface LoginPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolved = await searchParams;
  const callbackUrl = resolved?.callbackUrl;
  const t = await getTranslations('auth');
  const showDevHint =
    process.env.APP_ENV !== 'production' &&
    process.env.ALLOW_TEST_OTP === 'true';

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md border-4 border-maroon bg-paper p-6 sm:p-8 shadow-[6px_6px_0px_#7A1F2B] rounded-2xl">
          {/* Signboard Header Trim inside login box */}
          <div className="border-b-2 border-dashed border-marigold pb-4 mb-6 text-center">
            <span className="font-token text-xs uppercase tracking-normal text-tealDeep bg-tile/40 px-2.5 py-0.5 border border-tealDeep/30 font-bold rounded">
              ★ {t('loginBadge')} ★
            </span>
            <h1 className="font-sign text-2xl sm:text-3xl text-maroon mt-2">
              {t('loginTitle')}
            </h1>
            <p className="font-body text-xs sm:text-sm text-steel mt-1">
              {t('step1Subtitle')}
            </p>
          </div>

          <LoginFormClient callbackUrl={callbackUrl} showDevHint={showDevHint} />
        </div>
      </main>

      <footer className="mt-auto border-t-2 border-ink/20">
        <BarberPoleDivider />
      </footer>
    </div>
  );
}
