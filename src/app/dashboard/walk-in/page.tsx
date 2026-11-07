import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { SignboardHeader } from '@/components/ui';
import { getStaffDashboardContext } from '@/lib/dashboard-service';
import { getTranslations } from 'next-intl/server';
import WalkInClient from './WalkInClient';

interface WalkInPageProps {
  searchParams: Promise<{ salonId?: string }>;
}

export default async function WalkInPage(props: WalkInPageProps) {
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

  // Load active services for this verified salon
  const services = await prisma.service.findMany({
    where: {
      salonId: context.salon.id,
      isActive: true,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      nameHi: true,
      durationMin: true,
      priceRupees: true,
      category: true,
    },
  });

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <WalkInClient
          userRole={context.role}
          salon={context.salon}
          barbers={context.barbers}
          initialBarberId={context.barber?.id}
          services={services}
        />
      </main>
    </div>
  );
}
