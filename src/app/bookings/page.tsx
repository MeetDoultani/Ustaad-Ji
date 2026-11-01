import React from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth-server';
import { SignboardHeader, BarberPoleDivider } from '@/components/ui';

export default async function BookingsPage() {
  const user = await requireUser('/bookings');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        <div className="border-b-2 border-ink/20 pb-4">
          <h1 className="font-sign text-2xl sm:text-4xl text-maroon">
            Meri Bookings / मेरी बुकिंग्स
          </h1>
          <p className="font-body text-xs sm:text-sm text-steel">
            Your appointment history and digital token slips ({user.phone})
          </p>
        </div>

        {/* Empty State in Hinglish */}
        <div className="border-4 border-dashed border-maroon bg-paper p-8 sm:p-12 text-center shadow-[4px_4px_0px_#7A1F2B]">
          <div className="font-token text-5xl text-maroon mb-3">🎫</div>
          <h2 className="font-sign text-2xl text-maroon mb-1">
            Abhi koi booking nahi. Pehla slot book karein?
          </h2>
          <p className="font-body text-sm sm:text-base text-steel mb-6">
            अभी कोई बुकिंग नहीं। पहला स्लॉट बुक करें?
          </p>

          <Link
            href="/salons"
            className="inline-flex items-center justify-center min-h-[44px] bg-marigold text-ink font-label font-bold px-6 py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all"
          >
            Explore Salons / सैलून देखें →
          </Link>
        </div>
      </main>

      <footer className="mt-auto border-t-2 border-ink/20">
        <BarberPoleDivider />
      </footer>
    </div>
  );
}
