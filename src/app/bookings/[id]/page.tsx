import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-server';
import { getBookingForUser } from '@/lib/booking-service';
import { formatIstDate, formatIstTime, getNextIstDates } from '@/lib/time';
import { CANCEL_CUTOFF_MIN, ACTIVE_STATUSES } from '@/lib/booking-config';
import { SignboardHeader, BarberPoleDivider, TileBackground } from '@/components/ui';
import TokenSlipClient from './TokenSlipClient';

interface BookingDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?callbackUrl=/bookings/${id}`);
  }

  const booking = await getBookingForUser(user, id);
  if (!booking) {
    notFound();
  }

  const now = new Date();
  const startsAtDate = new Date(booking.startsAt);
  const formattedDate = formatIstDate(startsAtDate, 'en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = formatIstTime(startsAtDate);

  const isCustomer = user.role === 'CUSTOMER';
  const isActive = (ACTIVE_STATUSES as readonly string[]).includes(booking.status);
  const cutoffPassed = startsAtDate.getTime() - now.getTime() < CANCEL_CUTOFF_MIN * 60 * 1000;

  const canCancel = isCustomer && isActive && !cutoffPassed;
  const canReschedule = isCustomer && isActive && !cutoffPassed;

  // 14 days tabs for potential reschedule
  const nextDates = getNextIstDates(14, now);
  const dateTabs = nextDates.map((dateIst, idx) => {
    let labelEn = formatIstDate(dateIst, 'en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    let labelHi = formatIstDate(dateIst, 'hi', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    if (idx === 0) {
      labelEn = 'Today';
      labelHi = 'आज';
    } else if (idx === 1) {
      labelEn = 'Tomorrow';
      labelHi = 'कल';
    }

    return {
      dateIst,
      labelEn,
      labelHi,
    };
  });

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col pb-20">
      <SignboardHeader
        salonName="Booking Slip / टोकन पर्ची"
        salonNameHi="बुकिंग रसीद"
      />

      <main className="flex-1">
        <TokenSlipClient
          booking={booking}
          formattedDate={formattedDate}
          formattedTime={formattedTime}
          canCancel={canCancel}
          canReschedule={canReschedule}
          cutoffPassed={cutoffPassed}
          dateTabs={dateTabs}
        />
      </main>

      <footer className="mt-16 border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-6 px-4 text-center">
          <p className="font-sign text-lg text-maroon">
            Indian Salon Booking • Digital Token System
          </p>
          <p className="font-body text-xs text-ink/70 mt-1">
            Show this slip at the salon reception desk.
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
