'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FullSalonDetails, calculateServicesSummary } from '@/lib/salons';
import {
  RateCardBoard,
  UstaadCard,
  RegisterDiarySlotPicker,
  LiveQueueBoard,
  BarberPoleDivider,
  TileBackground,
} from '@/components/ui';
import { clsx } from 'clsx';

interface SalonDetailsClientProps {
  salon: FullSalonDetails;
}

// Push-pin SVG accent for pinned paper slips
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
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(
    salon.barbers[0]?.id || null
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

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
                  'font-token text-xs font-bold px-2.5 py-1 border border-ink',
                  salon.isOpenNow ? 'bg-tile text-tealDeep' : 'bg-paper text-poleRed'
                )}
              >
                {salon.isOpenNow ? '● OPEN NOW / खुला है' : '○ CLOSED / बंद है'}
              </span>
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold">
                ★ {salon.averageRating} RATING
              </span>
              {salon.offersHomeVisit && (
                <span className="font-token text-xs bg-paper text-tealDeep px-2.5 py-1 border border-tealDeep font-bold">
                  ✓ Home Visits Available
                </span>
              )}
            </div>

            <div>
              <h1 className="font-sign text-3xl sm:text-5xl text-maroon leading-tight">
                {salon.name}
              </h1>
              {salon.nameHi && (
                <p className="font-sign text-xl sm:text-2xl text-tealDeep mt-1">
                  {salon.nameHi}
                </p>
              )}
            </div>

            <p className="font-body text-base text-ink/90 max-w-xl">
              {salon.description}
            </p>

            {/* Address & Contact Details */}
            <div className="bg-paper border-2 border-ink p-3.5 space-y-1.5 text-xs sm:text-sm font-body max-w-lg shadow-[3px_3px_0px_#2B2118]">
              <div>
                <span className="font-bold">📍 Shop Address: </span>
                {salon.addressLine}, {salon.area}, {salon.city} - {salon.pincode}
              </div>
              {salon.phone && (
                <div>
                  <span className="font-bold">📞 Phone: </span>
                  <a href={`tel:${salon.phone}`} className="font-token text-maroon underline">
                    {salon.phone}
                  </a>
                </div>
              )}
              {salon.offersHomeVisit && (
                <div className="text-tealDeep font-bold text-xs pt-1 border-t border-ink/10">
                  Home visit radius: {salon.homeVisitRadiusKm ?? 5} km (+₹{salon.homeVisitFeeRupees ?? 100} travel fee)
                </div>
              )}
            </div>
          </div>

          {/* Live Queue Board Counter */}
          <div className="w-full lg:w-2/5 flex justify-center">
            <LiveQueueBoard
              currentToken={14}
              peopleWaiting={3}
              approxWaitMin={20}
              salonName={salon.name}
              className="w-full max-w-sm"
            />
          </div>
        </div>
      </TileBackground>

      <BarberPoleDivider />

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 space-y-14">
        {/* 2. Interactive Rate Card Board */}
        <section id="rate-card-section" className="scroll-mt-20">
          <div className="mb-4">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              Dukaan Rate Card / दुकान का रेट कार्ड
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel">
              Tap any service to select it for your booking
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
              Our Ustaad Barbers / हमारे उस्ताद कारीगर
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel">
              Experienced neighbourhood craftsmen on duty
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

        {/* 4. Interactive Register Diary Slot Picker Preview */}
        <section id="diary-section" className="scroll-mt-20">
          <div className="mb-4">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
              Appointment Register Diary / दैनिक बहीखाता
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel">
              Test choosing a day tab and tapping an available slot line
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
              Customer Reviews / ग्राहकों की राय
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel">
              Hand-pinned testimonials from regular neighbourhood customers
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
                      'relative bg-paper border-2 border-ink p-5 shadow-[4px_4px_0px_#2B2118] transition-transform hover:rotate-0',
                      rotClass
                    )}
                  >
                    {/* Push Pin Accent at Top Center */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <PushPinIcon />
                    </div>

                    {/* Review Rating Stars */}
                    <div className="flex items-center justify-between border-b border-dashed border-ink/20 pb-2 mb-3 mt-1">
                      <span className="font-token text-base text-maroon font-bold">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                      {rev.barber && (
                        <span className="font-body text-xs text-steel">
                          Ustaad: {rev.barber.displayName}
                        </span>
                      )}
                    </div>

                    <p className="font-body text-sm text-ink mb-4 italic leading-relaxed">
                      &ldquo;{rev.comment || 'Bahut badhiya service. Ekdum traditional ustaad feel!'}&rdquo;
                    </p>

                    <div className="flex items-center justify-between text-xs font-token text-steel border-t border-ink/10 pt-2">
                      <span className="font-bold text-ink">
                        — {rev.customer?.name || 'Local Customer'}
                      </span>
                      <span>Verified Visit</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full border-2 border-dashed border-steel/60 p-6 text-center text-steel font-body">
                Abhi tak koi review pinned nahi hai. Pehli booking karke apna feedback chodiye!
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 6. Sticky Bottom Booking Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-maroon border-t-4 border-marigold p-3 sm:p-4 shadow-2xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex flex-col text-paper">
            <span className="font-label font-bold text-xs sm:text-sm text-marigold">
              {summary.serviceCount > 0
                ? `${summary.serviceCount} service${summary.serviceCount > 1 ? 's' : ''} selected (${summary.totalDurationMin} mins)`
                : 'Select services from the rate card above'}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-body text-xs text-paper/70">Estimated:</span>
              <span className="font-token text-xl sm:text-2xl font-bold text-chalk">
                ₹{summary.totalPriceRupees}
              </span>
              {selectedSlot && (
                <span className="font-token text-xs text-marigold ml-2 hidden sm:inline">
                  • Slot: {selectedSlot}
                </span>
              )}
            </div>
          </div>

          <Link
            href={bookingHref}
            className="min-h-[44px] bg-marigold text-ink font-label font-bold px-5 sm:px-8 py-2.5 sm:py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all flex items-center justify-center text-sm sm:text-base whitespace-nowrap"
          >
            Book Slot / स्लॉट बुक करें →
          </Link>
        </div>
      </div>
    </div>
  );
}
