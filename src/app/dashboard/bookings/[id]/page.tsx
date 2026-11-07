import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth-server';
import { Role } from '@prisma/client';
import { SignboardHeader } from '@/components/ui';
import { getBookingDetailStaff } from '@/lib/dashboard-service';
import DashboardBookingDetailClient from './DashboardBookingDetailClient';

interface DashboardBookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DashboardBookingDetailPage(
  props: DashboardBookingDetailPageProps
) {
  const user = await requireRole(Role.BARBER, Role.OWNER);
  const { id } = await props.params;

  const result = await getBookingDetailStaff({
    staffUser: user,
    bookingId: id,
  });

  if (!result.ok || !result.data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <DashboardBookingDetailClient booking={result.data} />
      </main>
    </div>
  );
}
