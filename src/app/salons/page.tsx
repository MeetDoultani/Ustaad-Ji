import React from 'react';
import {
  SignboardHeader,
  BarberPoleDivider,
  TileBackground,
} from '@/components/ui';
import { getPublicSalons } from '@/lib/salons';
import { ServiceCategory } from '@prisma/client';
import SalonsListClient from './SalonsListClient';

interface SalonsPageProps {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    homeVisit?: string;
    openNow?: string;
  }>;
}

export default async function SalonsPage({ searchParams }: SalonsPageProps) {
  const resolvedParams = await searchParams;
  const initialQuery = resolvedParams.q || '';
  const initialCat = resolvedParams.cat as ServiceCategory | undefined;
  const initialHomeVisit = resolvedParams.homeVisit === '1';
  const initialOpenNow = resolvedParams.openNow === '1';

  // Fetch verified salons from database
  const salons = await getPublicSalons({
    query: initialQuery,
    category: initialCat,
    homeVisitOnly: initialHomeVisit,
    openNowOnly: initialOpenNow,
  });

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      {/* Page Title Board Header */}
      <div className="bg-tealDeep text-chalk py-6 px-4 border-b-4 border-maroon">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="font-sign text-2xl sm:text-4xl text-marigold tracking-wide">
              Neighbourhood Salons / आस-पास के सैलून
            </h1>
            <p className="font-body text-xs sm:text-sm text-chalk/80">
              Verified traditional parlours with authentic price boards and experienced ustaads.
            </p>
          </div>
          <span className="font-token text-xs text-marigold bg-ink/60 border border-marigold/40 px-3 py-1 self-start sm:self-auto">
            {salons.length} {salons.length === 1 ? 'PARLOUR' : 'PARLOURS'} AVAILABLE
          </span>
        </div>
      </div>

      <BarberPoleDivider />

      {/* Main Filterable Content */}
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1">
        <SalonsListClient
          initialSalons={salons}
          initialQuery={initialQuery}
          initialCat={initialCat}
          initialHomeVisit={initialHomeVisit}
          initialOpenNow={initialOpenNow}
        />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-6 px-4 text-center">
          <p className="font-sign text-xl text-maroon">
            Indian Salon Booking • गली-मोहल्ले का भरोसेमंद नाई
          </p>
          <p className="font-body text-xs text-ink/70 mt-1">
            Looking for your local parlour? Ask your salon owner to register on Indian Salon Booking.
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
