import React from 'react';
import { requireUser } from '@/lib/auth-server';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';
import AccountFormClient from './AccountFormClient';

export default async function AccountPage() {
  const user = await requireUser('/account');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-2xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <div className="border-b-2 border-ink/20 pb-4">
          <h1 className="font-sign text-2xl sm:text-4xl text-maroon">
            Aapka Profile / Your Account
          </h1>
          <p className="font-body text-xs sm:text-sm text-steel">
            Manage your personal profile and account details
          </p>
        </div>

        <div className="border-4 border-maroon bg-paper p-6 sm:p-8 shadow-[5px_5px_0px_#7A1F2B] space-y-6">
          {/* Account Details Overview */}
          <div className="bg-tile/20 border-2 border-ink p-4 space-y-2 text-sm font-body">
            <div className="flex justify-between">
              <span className="font-bold">Phone / फ़ोन:</span>
              <span className="font-token">{user.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Role / भूमिका:</span>
              <span className="font-token uppercase text-maroon font-bold">{user.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">Status / स्थिति:</span>
              <span className="text-tealDeep font-bold">● Active / सक्रिय</span>
            </div>
          </div>

          {/* Name Editor */}
          <div>
            <h2 className="font-sign text-xl text-maroon mb-3">
              Personal Information / व्यक्तिगत जानकारी
            </h2>
            <AccountFormClient initialName={user.name} />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t-2 border-ink/20">
        <BarberPoleDivider />
      </footer>
    </div>
  );
}
