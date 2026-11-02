import React from 'react';
import { notFound } from 'next/navigation';
import { getSalonBySlug } from '@/lib/salons';
import { getCurrentUser } from '@/lib/auth-server';
import { getNextIstDates, formatIstDate } from '@/lib/time';
import { SignboardHeader, BarberPoleDivider, TileBackground } from '@/components/ui';
import BookFlowClient from './BookFlowClient';

interface BookPageProps {
  params: Promise<{
    salonSlug: string;
  }>;
  searchParams: Promise<{
    services?: string;
    barber?: string;
    date?: string;
    slot?: string;
  }>;
}

export default async function BookSalonPage({ params, searchParams }: BookPageProps) {
  const { salonSlug } = await params;
  const { services, barber, date, slot } = await searchParams;

  const salon = await getSalonBySlug(salonSlug);
  if (!salon) {
    notFound();
  }

  const currentUser = await getCurrentUser();

  // Generate next 14 IST calendar date tabs
  const now = new Date();
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

  const initialServiceIds = services ? services.split(',').filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col pb-20">
      {/* Signboard Header */}
      <SignboardHeader
        salonName={`Book: ${salon.name}`}
        salonNameHi={salon.nameHi ? `बुकिंग: ${salon.nameHi}` : undefined}
      />

      <main className="flex-1">
        <BookFlowClient
          salon={salon}
          user={currentUser}
          dateTabs={dateTabs}
          initialServiceIds={initialServiceIds}
          initialBarberId={barber}
          initialDateIst={date}
          initialSlotStartsAt={slot}
        />
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-6 px-4 text-center">
          <p className="font-sign text-lg text-maroon">
            {salon.name} • {salon.area}, {salon.city}
          </p>
          <p className="font-body text-xs text-ink/70 mt-1">
            Real time slot booking with authentic token slips. Verified by Indian Salon Booking.
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
