import React from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth-server';
import { listBookingsForCustomer } from '@/lib/booking-service';
import { formatIstDate, formatIstTime } from '@/lib/time';
import { SignboardHeader, BarberPoleDivider, TileBackground } from '@/components/ui';
import { clsx } from 'clsx';
import { getTranslations, getLocale } from 'next-intl/server';
import { getLocalizedName } from '@/i18n/config';

export default async function BookingsPage() {
  const user = await requireUser('/bookings');
  const { upcoming, past } = await listBookingsForCustomer(user.id);
  const locale = await getLocale();
  const t = await getTranslations('myBookings');
  const tToken = await getTranslations('token');

  const hasAnyBookings = upcoming.length > 0 || past.length > 0;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col pb-20">
      <SignboardHeader />

      <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-8">
        <div className="border-b-2 border-ink/20 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="font-sign text-2xl sm:text-4xl text-maroon">
              {t('title')}
            </h1>
            <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
              {t('subtitle')} ({user.phone})
            </p>
          </div>

          <Link
            href="/salons"
            className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs sm:text-sm px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron self-start sm:self-auto flex items-center gap-1.5 rounded-lg"
          >
            + {t('bookNewSlot')}
          </Link>
        </div>

        {/* Empty State */}
        {!hasAnyBookings && (
          <div className="border-4 border-dashed border-maroon bg-paper p-8 sm:p-12 text-center shadow-[4px_4px_0px_#7A1F2B] rounded-2xl">
            <div className="font-token text-5xl text-maroon mb-3">🎫</div>
            <h2 className="font-sign text-2xl text-maroon mb-2">
              {t('empty')}
            </h2>
            <Link
              href="/salons"
              className="inline-flex items-center justify-center min-h-[44px] bg-marigold text-ink font-label font-bold px-6 py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all rounded-lg mt-4"
            >
              {t('exploreButton')} →
            </Link>
          </div>
        )}

        {/* Section 1: Upcoming Appointments */}
        {upcoming.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-maroon pb-2">
              <h2 className="font-sign text-xl sm:text-2xl text-maroon flex items-center gap-2">
                <span>✦ {t('upcoming')}</span>
                <span className="font-token text-xs bg-marigold text-ink px-2 py-0.5 border border-ink rounded">
                  {t('activeCount', { count: upcoming.length })}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcoming.map((booking) => {
                const startsAtDate = new Date(booking.startsAt);
                const dateStr = formatIstDate(startsAtDate, locale, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                const timeStr = formatIstTime(startsAtDate);
                const salonName = getLocalizedName(booking.salon, locale);

                return (
                  <div
                    key={booking.id}
                    className="relative bg-paper border-3 border-ink p-5 shadow-[4px_4px_0px_#2B2118] flex flex-col justify-between transition-transform hover:-translate-y-0.5 rounded-xl"
                  >
                    {/* Top Token Badge */}
                    <div className="flex items-start justify-between border-b border-dashed border-ink/30 pb-3 mb-3">
                      <div>
                        <span className="font-token text-2xl font-bold text-maroon block">
                          {tToken('tokenNo')} {booking.token}
                        </span>
                        <h3 className="font-sign text-lg text-ink font-bold leading-tight mt-0.5">
                          {salonName}
                        </h3>
                        <p className="font-body text-xs text-steel">
                          {booking.salon.area}, {booking.salon.city}
                        </p>
                      </div>

                      <span
                        className={clsx(
                          'font-token text-[10px] uppercase font-bold px-2 py-1 border rounded',
                          booking.status === 'CONFIRMED' && 'bg-tile text-tealDeep border-tealDeep',
                          booking.status === 'CHECKED_IN' && 'bg-marigold text-ink border-ink',
                          booking.status === 'IN_PROGRESS' && 'bg-maroon text-chalk border-maroon animate-pulse',
                          booking.status === 'PENDING' && 'bg-marigold/30 text-ink border-ink'
                        )}
                      >
                        {booking.status === 'CONFIRMED'
                          ? `✓ ${tToken('confirmed')}`
                          : booking.status === 'CHECKED_IN'
                          ? `⚡ ${tToken('checkedIn')}`
                          : booking.status === 'IN_PROGRESS'
                          ? `✂️ ${tToken('inProgress')}`
                          : `⏳ ${tToken('pending')}`}
                      </span>
                    </div>

                    {/* Middle Details */}
                    <div className="space-y-1.5 font-body text-xs text-ink/90 mb-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">{tToken('barber')}:</span>
                        <span className="font-bold text-ink">{booking.barber.displayName}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">{tToken('date')} & {tToken('time')}:</span>
                        <span className="font-token font-bold text-maroon text-sm">
                          {dateStr} • {timeStr}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-steel">{tToken('services')}:</span>
                        <span className="font-medium text-right max-w-[200px] truncate">
                          {booking.items
                            .map((i: { service: { name: string; nameHi?: string | null } }) =>
                              getLocalizedName(i.service, locale)
                            )
                            .join(', ')}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between pt-1 border-t border-ink/10">
                        <span className="font-bold">{tToken('total')}:</span>
                        <span className="font-token font-bold text-base text-ink">
                          ₹{booking.totalRupees}
                        </span>
                      </div>
                    </div>

                    {/* Action link */}
                    <Link
                      href={`/bookings/${booking.id}`}
                      className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs uppercase px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron flex items-center justify-center transition-all rounded-lg"
                    >
                      {t('viewTokenSlip')} →
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
                {t('past')} ({past.length})
              </h2>
            </div>

            <div className="divide-y-2 divide-ink/10 border-2 border-ink bg-paper shadow-[3px_3px_0px_#2B2118] rounded-xl overflow-hidden">
              {past.map((booking) => {
                const startsAtDate = new Date(booking.startsAt);
                const dateStr = formatIstDate(startsAtDate, locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const timeStr = formatIstTime(startsAtDate);
                const salonName = getLocalizedName(booking.salon, locale);

                let statusBadge = (
                  <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-steel text-steel bg-paper rounded">
                    {booking.status}
                  </span>
                );

                if (booking.status === 'COMPLETED') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-tealDeep text-tealDeep bg-tile/40 rounded">
                      ✓ {tToken('completed')}
                    </span>
                  );
                } else if (booking.status === 'CANCELLED') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-poleRed text-poleRed bg-poleRed/10 rounded">
                      ✕ {tToken('cancelled')}
                    </span>
                  );
                } else if (booking.status === 'NO_SHOW') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-poleRed text-poleRed bg-poleRed/10 rounded">
                      ✕ {tToken('noShow')}
                    </span>
                  );
                } else if (booking.status === 'REJECTED') {
                  statusBadge = (
                    <span className="font-token text-[10px] uppercase font-bold px-2 py-0.5 border border-poleRed text-poleRed bg-poleRed/10 rounded">
                      ✕ {tToken('rejected')}
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
                          {tToken('tokenNo')} {booking.token}
                        </span>
                        {statusBadge}
                      </div>

                      <div className="font-body text-xs text-ink/80">
                        <span className="font-bold">{salonName}</span> &bull; {booking.barber.displayName} • ₹{booking.totalRupees}
                      </div>

                      <div className="font-token text-xs text-steel">
                        {dateStr} • {timeStr}
                      </div>

                      {booking.cancelReason && (
                        <div className="font-body text-xs text-poleRed">
                          {tToken('cancelledBySalon', { reason: booking.cancelReason })}
                        </div>
                      )}
                    </div>

                    <Link
                      href={`/bookings/${booking.id}`}
                      className="min-h-[44px] px-3 py-2 border border-ink text-xs font-label font-bold text-ink hover:bg-paper shadow-[1px_1px_0px_#2B2118] self-start sm:self-center flex items-center justify-center whitespace-nowrap rounded-md"
                    >
                      {t('viewReceipt')} →
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
            {tToken('footerNote')}
          </p>
        </TileBackground>
      </footer>
    </div>
  );
}
