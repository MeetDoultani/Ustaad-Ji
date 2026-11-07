import React from 'react';
import { requireUser } from '@/lib/auth-server';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';
import AccountFormClient from './AccountFormClient';
import { getTranslations } from 'next-intl/server';

export default async function AccountPage() {
  const user = await requireUser('/account');
  const t = await getTranslations('account');
  const tRoles = await getTranslations('roles');
  const tCommon = await getTranslations('common');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-2xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <div className="border-b-2 border-ink/20 pb-4">
          <h1 className="font-sign text-2xl sm:text-4xl text-maroon">
            {t('title')}
          </h1>
          <p className="font-body text-xs sm:text-sm text-steel">
            {t('subtitle')}
          </p>
        </div>

        <div className="border-4 border-maroon bg-paper p-6 sm:p-8 shadow-[5px_5px_0px_#7A1F2B] space-y-6 rounded-2xl">
          {/* Account Details Overview */}
          <div className="bg-tile/20 border-2 border-ink p-4 space-y-2 text-sm font-body rounded-xl">
            <div className="flex justify-between">
              <span className="font-bold">{t('phoneLabel')}:</span>
              <span className="font-token">{user.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">{t('roleLabel')}:</span>
              <span className="font-token uppercase text-maroon font-bold">
                {tRoles(user.role as 'CUSTOMER' | 'BARBER' | 'OWNER' | 'ADMIN')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">{t('languageSection')}:</span>
              <span className="font-token text-tealDeep font-bold">
                {user.language === 'hi' ? tCommon('hindi') : tCommon('english')}
              </span>
            </div>
          </div>

          {/* Profile & Language Form */}
          <div>
            <h2 className="font-sign text-xl text-maroon mb-3">
              {t('profileInfo')}
            </h2>
            <AccountFormClient
              initialName={user.name}
              initialLanguage={user.language}
            />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t-2 border-ink/20">
        <BarberPoleDivider />
      </footer>
    </div>
  );
}
