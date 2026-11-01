import React from 'react';
import { notFound } from 'next/navigation';
import { getSalonBySlug } from '@/lib/salons';
import { SignboardHeader, BarberPoleDivider, TileBackground } from '@/components/ui';
import SalonDetailsClient from './SalonDetailsClient';

interface SalonPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function SalonDetailPage({ params }: SalonPageProps) {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);

  if (!salon) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col pb-20 sm:pb-24">
      {/* Signboard Header with this Salon's Name */}
      <SignboardHeader
        salonName={salon.name}
        salonNameHi={salon.nameHi || undefined}
      />

      <SalonDetailsClient salon={salon} />

      {/* Footer */}
      <footer className="mt-16 border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-8 px-4 text-center">
          <p className="font-sign text-xl text-maroon">
            {salon.name} • {salon.area}, {salon.city}
          </p>
          <p className="font-body text-xs text-ink/70 mt-1">
            Genuine neighbourhood grooming since 1994. Verified by Indian Salon Booking.
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
