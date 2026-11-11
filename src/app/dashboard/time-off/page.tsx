import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { SignboardHeader, StaffDashboardNav } from '@/components/ui';
import { getStaffDashboardContext } from '@/lib/dashboard-service';
import { getBarberTimeOffStaff } from '@/lib/staff-config-service';
import { getTranslations } from 'next-intl/server';
import TimeOffClient from './TimeOffClient';

interface TimeOffPageProps {
  searchParams: Promise<{ salonId?: string; barberId?: string }>;
}

export default async function TimeOffPage(props: TimeOffPageProps) {
  const user = await requireRole(Role.BARBER, Role.OWNER);
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

  let targetBarberId = context.barber?.id;
  if (context.role === 'OWNER') {
    if (searchParams.barberId) {
      const match = context.barbers.find((b) => b.id === searchParams.barberId);
      if (match) {
        targetBarberId = match.id;
      }
    }
    if (!targetBarberId && context.barbers.length > 0) {
      targetBarberId = context.barbers[0].id;
    }
  }

  if (!targetBarberId) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col">
        <SignboardHeader />
        <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
          <StaffDashboardNav
            currentTab="time-off"
            role={context.role}
            salonId={context.salon.id}
          />
          <div className="border-4 border-maroon bg-paper p-8 text-center rounded-2xl font-body text-steel">
            {t('noServices')}
          </div>
        </main>
      </div>
    );
  }

  const result = await getBarberTimeOffStaff(user, targetBarberId);
  const timeOffList = result.ok && result.data ? result.data : [];

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <StaffDashboardNav
          currentTab="time-off"
          role={context.role}
          salonId={context.salon.id}
        />

        <TimeOffClient
          userRole={context.role}
          salonId={context.salon.id}
          barbers={context.barbers}
          selectedBarberId={targetBarberId}
          initialTimeOffList={timeOffList}
        />
      </main>
    </div>
  );
}
