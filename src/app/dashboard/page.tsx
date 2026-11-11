import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { SignboardHeader, BarberPoleDivider, StaffDashboardNav } from '@/components/ui';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  getStaffDashboardContext,
  getRegisterBookings,
} from '@/lib/dashboard-service';
import { utcToIstDetails } from '@/lib/time';
import RegisterClient from './RegisterClient';

interface DashboardPageProps {
  searchParams: Promise<{
    salonId?: string;
    date?: string;
    barberId?: string;
  }>;
}

export default async function DashboardPage(props: DashboardPageProps) {
  const user = await requireRole(Role.BARBER, Role.OWNER);
  const searchParams = await props.searchParams;
  const t = await getTranslations('dashboard');
  const locale = await getLocale();

  // Load staff context and verify active and verified status
  const context = await getStaffDashboardContext(user, searchParams.salonId);

  // If salon or barber is PENDING, REJECTED, or SUSPENDED, show themed awaiting/suspended notice with NO data
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

  // Calculate today's IST date and validate requested date range (-7 to +14 days)
  const now = new Date();
  const { dateIst: todayDateIst } = utcToIstDetails(now);

  let selectedDateIst = searchParams.date || todayDateIst;
  // Simple YYYY-MM-DD validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDateIst)) {
    selectedDateIst = todayDateIst;
  } else {
    const selectedTime = new Date(selectedDateIst + 'T12:00:00Z').getTime();
    const todayTime = new Date(todayDateIst + 'T12:00:00Z').getTime();
    const daysDiff = Math.round((selectedTime - todayTime) / (24 * 60 * 60 * 1000));
    if (daysDiff < -7 || daysDiff > 14) {
      selectedDateIst = todayDateIst;
    }
  }

  // Fetch register bookings & summary for the selected date
  const registerResult = await getRegisterBookings({
    staffUser: user,
    salonId: context.salon.id,
    barberId: searchParams.barberId,
    dateIst: selectedDateIst,
  });

  const bookings = registerResult.ok && registerResult.data ? registerResult.data.bookings : [];
  const summary = registerResult.ok && registerResult.data
    ? registerResult.data.summary
    : { todayTokens: 0, waiting: 0, inChair: 0, done: 0, cancelledNoShow: 0, earningsRupees: 0 };
  const nextCustomer = registerResult.ok && registerResult.data
    ? registerResult.data.nextCustomer
    : null;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <StaffDashboardNav
          currentTab="register"
          role={context.role}
          salonId={context.salon.id}
        />

        {/* Welcome Board */}
        <div className="bg-tealDeep text-chalk p-6 border-4 border-maroon shadow-[5px_5px_0px_#2B2118] rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-marigold/40 pb-4 mb-3">
            <div>
              <span className="font-token text-xs uppercase tracking-wider text-marigold bg-ink/50 px-2 py-0.5 border border-marigold/30 rounded">
                {context.role === 'OWNER' ? t('roleOwner') : t('roleBarber')}
              </span>
              <h1 className="font-sign text-2xl sm:text-4xl text-chalk mt-1">
                {t('welcome', { name: user.name || user.phone })}
              </h1>
            </div>
            <div className="text-left sm:text-right">
              <span className="font-label font-bold text-xs uppercase text-chalk/70 block">
                {t('shop')}
              </span>
              <span className="font-sign text-xl text-marigold font-bold">
                {locale === 'hi' && context.salon.nameHi ? context.salon.nameHi : context.salon.name}
              </span>
            </div>
          </div>

          <p className="font-body text-sm text-chalk/85">
            {t('introText')}
          </p>
        </div>

        <BarberPoleDivider />

        {/* Live Interactive Ledger Register */}
        <RegisterClient
          userRole={context.role}
          salon={context.salon}
          salons={context.salons}
          barbers={context.barbers}
          selectedDateIst={selectedDateIst}
          todayDateIst={todayDateIst}
          selectedBarberId={searchParams.barberId}
          bookings={bookings}
          summary={summary}
          nextCustomer={nextCustomer}
        />
      </main>
    </div>
  );
}
