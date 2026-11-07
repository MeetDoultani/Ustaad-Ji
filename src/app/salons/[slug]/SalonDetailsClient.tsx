'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FullSalonDetails, calculateServicesSummary } from '@/lib/salons';
import {
  RateCardBoard,
  UstaadCard,
  RegisterDiarySlotPicker,
  BarberPoleDivider,
  TileBackground,
} from '@/components/ui';
import { clsx } from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { getLocalizedName } from '@/i18n/config';

interface SalonDetailsClientProps {
  salon: FullSalonDetails;
}

function PushPinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={clsx('w-5 h-5 text-maroon drop-shadow-sm', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="7" r="5" fill="#7A1F2B" stroke="#2B2118" strokeWidth="1.5" />
      <path d="M12 12V22" stroke="#2B2118" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="5" r="1.5" fill="#F2A900" />
    </svg>
  );
}

export default function SalonDetailsClient({ salon }: SalonDetailsClientProps) {
  const locale = useLocale();
  const t = useTranslations('salonDetails');
  const tCommon = useTranslations('common');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(
    salon.barbers[0]?.id || null
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const localizedSalonName = getLocalizedName(salon, locale);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const summary = calculateServicesSummary(salon.services, selectedServiceIds);

  const bookingHref = `/book/${salon.slug}${
    selectedServiceIds.length > 0 ? `?services=${selectedServiceIds.join(',')}` : ''
  }`;

  return (
    <div className="flex flex-col space-y-12">
      {/* 1. Salon Metadata Hero + LiveQueueBoard */}
      <TileBackground variant="tile" className="py-8 px-4 border-b-4 border-ink">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Metadata Card */}
          <div className="w-full lg:w-3/5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  'font-token text-xs font-bold px-2.5 py-1 border border-ink rounded',
                  salon.isOpenNow ? 'bg-tile text-tealDeep' : 'bg-paper text-poleRed'
                )}
              >
                {salon.isOpenNow ? `● ${t('openNow')}` : `○ ${t('closedNow')}`}
              </span>
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold rounded">
                ★ {salon.averageRating}
              </span>
              {salon.offersHomeVisit && (
                <span className="font-token text-xs bg-paper text-tealDeep px-2.5 py-1 border border-tealDeep font-bold rounded">
                  ✓ {t('homeVisitsAvailable')}
                </span>
              )}
            </div>

            <div>
              <h1 className="font-sign text-3xl sm:text-5xl text-maroon leading-tight">
                {localizedSalonName}
              </h1>
            </div>

            <p className="font-body text-base text-ink/90 max-w-xl">
              {salon.description}
            </p>

            {/* Address & Contact Details */}
            <div className="bg-paper border-2 border-ink p-3.5 space-y-1.5 text-xs sm:text-sm font-body max-w-lg shadow-[3px_3px_0px_#2B2118] rounded-xl">
              <div>
                <span className="font-bold">📍 {tCommon('address')}: </span>
                {salon.addressLine}, {salon.area}, {salon.city} - {salon.pincode}
              </div>
              {salon.phone && (
                <div>
                  <span className="font-bold">📞 {tCommon('phone')}: </span>
                  <a href={`tel:${salon.phone}`} className="font-token text-maroon underline">
                    {salon.phone}
                  </a>
                </div>
              )}
              {salon.offersHomeVisit && (
                <div className="text-tealDeep font-bold text-xs pt-1 border-t border-ink/10">
                  {t('homeVisitAvailable', {
                    radius: salon.homeVisitRadiusKm ?? 5,
                    fee: salon.homeVisitFeeRupees ?? 100,
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </TileBackground>

      <BarberPoleDivider />

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 space-y-14">
        {/* 2. Interactive Rate Card */}
        <section id="rate-card-section" className="scroll-mt-20">
          <div className="mb-4">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              {t('rateCardTitle')}
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
              {t('tapServiceToSelect')}
            </p>
          </div>

          <RateCardBoard
            services={salon.services}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
            onBookNow={() => {
              const el = document.getElementById('diary-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </section>

        {/* 3. Ustaad (Barber) Cards Grid */}
        <section id="ustaads-section" className="scroll-mt-20">
          <div className="mb-6">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              {t('ustaadTitle')}
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
              {t('craftsmenOnDuty')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 justify-items-center">
            {salon.barbers.map((barber) => (
              <UstaadCard
                key={barber.id}
                barber={barber}
                isSelected={selectedBarberId === barber.id}
                onSelect={(id) => setSelectedBarberId(id)}
                isAvailableNow={true}
                rating={4.9}
              />
            ))}
          </div>
        </section>

        {/* 4. Pick a time Preview */}
        <section id="diary-section" className="scroll-mt-20">
          <div className="mb-4">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              {t('diaryTitle')}
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
              {t('chooseSlotHint')}
            </p>
          </div>

          <RegisterDiarySlotPicker
            selectedDay={selectedDay}
            onSelectDay={(day) => setSelectedDay(day)}
            selectedSlot={selectedSlot || undefined}
            onSelectSlot={(slot) => setSelectedSlot(slot)}
          />
        </section>

        {/* 5. Customer Reviews as Pinned Slips */}
        <section id="reviews-section" className="scroll-mt-20">
          <div className="mb-6">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              {t('reviewsTitle')}
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
              {t('customerTestimonials')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {salon.reviews.length > 0 ? (
              salon.reviews.map((rev, index) => {
                const rotations = ['-rotate-1', 'rotate-1.5', '-rotate-2', 'rotate-1'];
                const rotClass = rotations[index % rotations.length];

                return (
                  <div
                    key={rev.id}
                    className={clsx(
                      'relative bg-paper border-2 border-ink p-5 shadow-[4px_4px_0px_#2B2118] transition-transform hover:rotate-0 rounded-sm',
                      rotClass
                    )}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <PushPinIcon />
                    </div>

                    <div className="flex items-center justify-between border-b border-dashed border-ink/20 pb-2 mb-3 mt-1">
                      <span className="font-token text-base text-maroon font-bold">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                      {rev.barber && (
                        <span className="font-body text-xs text-steel">
                          {t('barberLabel')} {rev.barber.displayName}
                        </span>
                      )}
                    </div>

                    {rev.comment && (
                      <p className="font-body text-sm text-ink italic mb-3">
                        &ldquo;{rev.comment}&rdquo;
                      </p>
                    )}

                    <div className="text-right">
                      <span className="font-sign text-xs text-maroon font-bold">
                        — {rev.customer?.name || t('verifiedCustomer')}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full border-2 border-dashed border-ink/30 p-8 text-center bg-paper rounded-xl">
                <p className="font-body text-sm text-steel">
                  {t('noReviewsYet')}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky Bottom Booking Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-maroon border-t-2 border-marigold p-3 sm:p-4 shadow-2xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="font-label text-xs uppercase text-paper/80">
              {summary.serviceCount > 0
                ? t('servicesSelected', { count: summary.serviceCount })
                : t('noServicesSelected')}
            </span>
            <span className="font-token text-xl sm:text-2xl font-bold text-marigold">
              ₹{summary.totalPriceRupees}{' '}
              {summary.totalDurationMin > 0 && (
                <span className="text-xs font-body text-paper/70 font-normal">
                  ({summary.totalDurationMin} {tCommon('mins')})
                </span>
              )}
            </span>
          </div>

          <Link
            href={bookingHref}
            className="min-h-[48px] bg-marigold text-ink font-label font-bold text-sm sm:text-base px-6 py-2.5 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all flex items-center gap-2 rounded-lg"
          >
            <span>{tCommon('bookSlot')}</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
