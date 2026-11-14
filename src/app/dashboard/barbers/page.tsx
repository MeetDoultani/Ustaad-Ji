import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { SignboardHeader, StaffDashboardNav } from '@/components/ui';
import { getStaffDashboardContext } from '@/lib/dashboard-service';
import { getSalonBarbersStaff } from '@/lib/staff-roster-service';
import { getTranslations } from 'next-intl/server';
import BarbersClient from './BarbersClient';

interface BarbersPageProps {
  searchParams: Promise<{ salonId?: string }>;
}

export default async function BarbersPage(props: BarbersPageProps) {
  const user = await requireRole(Role.OWNER);
  const searchParams = await props.searchParams;
  const t = await getTranslations('dashboard');

  const context = await getStaffDashboardContext(user, searchParams.salonId);

  if (!context.ok) {
    const isSuspended = context.state === 'SUSPENDED';
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <SignboardHeader />
        <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
          <div className="border-4 border-maroon bg-paper p-8 sm:p-12 text-center shadow-[6px_6px_0px_#7A1F2B] space-y-4 rounded-2xl">
            <div className="font-token text-5xl">
              {isSuspended ? '⛔' : '⏳'}
            </div>
            <h1 className="font-sign text-2xl sm:text-4xl text-maroon font-bold">
              {isSuspended ? t('suspended') : t('awaitingVerification')}
            </h1>
            <p className="font-body text-base text-steel max-w-lg mx-auto">
              {isSuspended ? t('suspendedMsg') : t('awaitingVerificationMsg')}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const result = await getSalonBarbersStaff(user, context.salon.id);
  const barbers = result.ok && result.data ? result.data : [];

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <StaffDashboardNav
          currentTab="barbers"
          role="OWNER"
          salonId={context.salon.id}
        />

        <BarbersClient
          salonId={context.salon.id}
          initialBarbers={barbers}
        />
      </main>
    </div>
  );
}
