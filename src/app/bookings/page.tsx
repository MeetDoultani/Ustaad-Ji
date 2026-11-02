import React from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth-server';
import { listBookingsForCustomer } from '@/lib/booking-service';
import { formatIstDate, formatIstTime } from '@/lib/time';
import { SignboardHeader, BarberPoleDivider, TileBackground } from '@/components/ui';
import { clsx } from 'clsx';

export default async function BookingsPage() {
  const user = await requireUser('/bookings');
  const { upcoming, past } = await listBookingsForCustomer(user.id);

  const hasAnyBookings = upcoming.length > 0 || past.length > 0;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col pb-20">
      <SignboardHeader
        salonName="Meri Bookings / मेरी बुकिंग्स"
        salonNameHi="डिजिटल टोकन बहीखाता"
      />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-8">
        <div className="border-b-2 border-ink/20 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="font-sign text-2xl sm:text-4xl text-maroon">
              Meri Bookings / मेरी बुकिंग्स
            </h1>
            <p className="font-body text-xs sm:text-sm text-steel">
              Your appointment history and digital token slips ({user.phone})
            </p>
          </div>

          <Link
            href="/salons"
            className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs sm:text-sm px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron self-start sm:self-auto flex items-center gap-1.5"
          >
            + Naya Slot Book Karein
          </Link>
        </div>

        {/* Empty State */}
        {!hasAnyBookings && (
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
        )}

        {/* Section 1: Upcoming Appointments */}
        {upcoming.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-maroon pb-2">
              <h2 className="font-sign text-xl sm:text-2xl text-maroon flex items-center gap-2">
                <span>✦ Upcoming Appointments / आगामी टोकन</span>
                <span className="font-token text-xs bg-marigold text-ink px-2 py-0.5 border border-ink">
                  {upcoming.length} Active
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcoming.map((booking) => {
                const startsAtDate = new Date(booking.startsAt);
                const dateStr = formatIstDate(startsAtDate, 'en', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                const timeStr = formatIstTime(startsAtDate);

                return (
                  <div
                    key={booking.id}
                    className="relative bg-paper border-3 border-ink p-5 shadow-[4px_4px_0px_#2B2118] flex flex-col justify-between transition-transform hover:-translate-y-0.5"
                  >
                    {/* Top Token Badge */}
                    <div className="flex items-start justify-between border-b border-dashed border-ink/30 pb-3 mb-3">
                      <div>
                        <span className="font-token text-2xl font-bold text-maroon block">
                          Token #{booking.token}
                        </span>
                        <h3 className="font-sign text-lg text-ink font-bold leading-tight">
                          {booking.salon.name}
                        </h3>
                        <p className="font-body text-xs text-steel">
                          {booking.salon.area}, {booking.salon.city}
                        </p>
                      </div>

                      <span
                        className={clsx(
                          'font-token text-[10px] uppercase font-bold px-2 py-1 border',
                          booking.status === 'CONFIRMED'
                            ? 'bg-tile text-tealDeep border-tealDeep'
                            : 'bg-marigold/30 text-ink border-ink'
                        )}
                      >
                        {booking.status === 'CONFIRMED' ? '✓ CONFIRMED' : '⏳ PENDING'}
                      </span>
                    </div>

                    {/* Middle Details */}
                    <div className="space-y-1.5 font-body text-xs text-ink/90 mb-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">Ustaad / कारीगर:</span>
                        <span className="font-bold text-ink">{booking.barber.displayName}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">Date & Time:</span>
                        <span className="font-token font-bold text-maroon text-sm">
                          {dateStr} • {timeStr}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">Services:</span>
                        <span className="font-medium text-right max-w-[200px] truncate">
                          {booking.items.map((i: { service: { name: string } }) => i.service.name).join(', ')}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-ink/10">
                        <span className="font-bold">Total:</span>
                        <span className="font-token font-bold text-base text-ink">
                          ₹{booking.totalRupees}
                        </span>
                      </div>
                    </div>

                    {/* Action link */}
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs uppercase px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron flex items-center justify-center transition-all"
                    >
                      View Slip / पर्ची देखें →
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 2: Past & Cancelled Bookings */}
        {past.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="border-b-2 border-ink/20 pb-2">
              <h2 className="font-sign text-xl text-steel">
                Past & Cancelled / पुरानी बुकिंग्स ({past.length})
              </h2>
            </div>

            <div className="divide-y-2 divide-ink/10 border-2 border-ink bg-paper shadow-[3px_3px_0px_#2B2118]">
              {past.map((booking) => {
                const startsAtDate = new Date(booking.startsAt);
                const dateStr = formatIstDate(startsAtDate, 'en', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const timeStr = formatIstTime(startsAtDate);

                let statusBadge = (
                  <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-steel text-steel bg-paper">
                    {booking.status}
                  </span>
                );

                if (booking.status === 'COMPLETED') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-tealDeep text-tealDeep bg-tile/40">
                      ✓ Completed
                    </span>
                  );
                } else if (booking.status === 'CANCELLED') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-poleRed text-poleRed bg-poleRed/10">
                      ✕ Cancelled
                    </span>
                  );
                }

                return (
                  <div
                    key={booking.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-tile/10 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-token text-base font-bold text-ink">
                          Token #{booking.token}
                        </span>
                        {statusBadge}
                      </div>

                      <div className="font-body text-xs text-ink/80">
                        <span className="font-bold">{booking.salon.name}</span> with Ustaad{' '}
                        {booking.barber.displayName} • ₹{booking.totalRupees}
                      </div>

                      <div className="font-token text-xs text-steel">
                        {dateStr} at {timeStr}
                      </div>
                    </div>

                    <Link
                      href={`/bookings/${booking.id}`}
                      className="min-h-[44px] px-3 py-2 border border-ink text-xs font-label font-bold text-ink hover:bg-paper shadow-[1px_1px_0px_#2B2118] self-start sm:self-center flex items-center justify-center whitespace-nowrap"
                    >
                      Receipt / पर्ची →
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-16 border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-6 px-4 text-center">
          <p className="font-sign text-lg text-maroon">
            Indian Salon Booking • Digital Token System
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
