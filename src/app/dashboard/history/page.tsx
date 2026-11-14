import React from 'react';
import { requireRole } from '@/lib/auth-server';
import { Role, BookingStatus } from '@prisma/client';
import { SignboardHeader, StaffDashboardNav } from '@/components/ui';
import { getStaffDashboardContext } from '@/lib/dashboard-service';
import { getBookingHistoryStaff } from '@/lib/staff-roster-service';
import { getTranslations } from 'next-intl/server';
import HistoryClient from './HistoryClient';

interface HistoryPageProps {
  searchParams: Promise<{
    salonId?: string;
    barberId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    token?: string;
    page?: string;
  }>;
}

export default async function HistoryPage(props: HistoryPageProps) {
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

  const parsedToken = searchParams.token ? parseInt(searchParams.token, 10) : undefined;
  const parsedPage = searchParams.page ? parseInt(searchParams.page, 10) : 1;

  const historyRes = await getBookingHistoryStaff({
    staffUser: user,
    salonId: context.salon.id,
    barberId: searchParams.barberId,
    statusFilter: (searchParams.status as BookingStatus | 'ALL_FINAL') || 'ALL_FINAL',
    fromDateIst: searchParams.fromDate,
    toDateIst: searchParams.toDate,
    searchToken: parsedToken && !isNaN(parsedToken) ? parsedToken : undefined,
    page: parsedPage && !isNaN(parsedPage) ? parsedPage : 1,
    pageSize: 20,
  });

  const historyData = historyRes.ok && historyRes.data
    ? historyRes.data
    : {
        items: [],
        totalCount: 0,
        totalCompletedRupees: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <StaffDashboardNav
          currentTab="history"
          role={context.role}
          salonId={context.salon.id}
        />

        <HistoryClient
          role={context.role}
          salonId={context.salon.id}
          items={historyData.items}
          totalCount={historyData.totalCount}
          totalCompletedRupees={historyData.totalCompletedRupees}
          currentPage={historyData.page}
          totalPages={historyData.totalPages}
          barbers={context.barbers || []}
          currentStatus={searchParams.status || 'ALL_FINAL'}
          currentFromDate={searchParams.fromDate || ''}
          currentToDate={searchParams.toDate || ''}
          currentBarberId={searchParams.barberId || ''}
          currentTokenSearch={searchParams.token || ''}
        />
      </main>
    </div>
  );
}
