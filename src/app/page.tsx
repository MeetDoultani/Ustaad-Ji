import React from 'react';
import Link from 'next/link';
import {
  SignboardHeader,
  BarberPoleDivider,
  TileBackground,
  TokenSlip,
} from '@/components/ui';
import { getPublicSalons } from '@/lib/salons';

// Truck-art inspired floral SVG border accent
function TruckArtFloralAccent() {
  return (
    <div className="w-full max-w-xl mx-auto my-3 overflow-hidden text-maroon opacity-80" aria-hidden="true">
      <svg viewBox="0 0 400 30" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-8">
        <path
          d="M0 15 Q50 0 100 15 T200 15 T300 15 T400 15"
          stroke="#7A1F2B"
          strokeWidth="2"
          fill="none"
        />
        {/* Lotus & Marigold petals */}
        <circle cx="100" cy="15" r="7" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="100" cy="15" r="3" fill="#E8731A" />
        <circle cx="200" cy="15" r="9" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="200" cy="15" r="4" fill="#C8262F" />
        <circle cx="300" cy="15" r="7" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="300" cy="15" r="3" fill="#E8731A" />
        {/* Decorative buds */}
        <path d="M45 12 C45 8 55 8 55 12 Z" fill="#7A1F2B" />
        <path d="M145 12 C145 8 155 8 155 12 Z" fill="#7A1F2B" />
        <path d="M245 12 C245 8 255 8 255 12 Z" fill="#7A1F2B" />
        <path d="M345 12 C345 8 355 8 355 12 Z" fill="#7A1F2B" />
      </svg>
    </div>
  );
}

export default async function HomePage() {
  const salons = await getPublicSalons();

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* 11.4.1 Signboard Header */}
      <SignboardHeader />

      {/* Hero Section on Tile Background with Truck-Art Border Accent */}
      <TileBackground variant="tile" className="py-8 sm:py-16 px-4 border-b-4 border-ink">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
          {/* Hero Left Content */}
          <div className="w-full lg:w-3/5 text-center lg:text-left">
            {/* Truck Art Accent */}
            <TruckArtFloralAccent />

            {/* Bilingual Hero Headline */}
            <div className="space-y-1 mb-4">
              <h1 className="font-sign text-3xl sm:text-5xl lg:text-6xl text-maroon leading-tight">
                Ab line mein nahi, slot mein
              </h1>
              <p className="font-sign text-2xl sm:text-4xl text-tealDeep leading-tight">
                अब लाइन में नहीं, स्लॉट में
              </p>
            </div>

            <p className="font-body text-base sm:text-lg text-ink/90 max-w-xl mb-6">
              Find verified neighbourhood parlours, check authentic painted rate cards,
              and book your diary slot without queue hassles. No fancy SaaS fluff—just
              pure neighbourhood trust.
            </p>

            {/* Search Bar routing to /salons?q=... */}
            <form
              action="/salons"
              method="GET"
              className="flex flex-col sm:flex-row gap-2 max-w-lg mb-6"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  name="q"
                  placeholder="Search parlour, area (e.g. Indiranagar)..."
                  className="w-full min-h-[48px] px-4 py-3 bg-paper border-2 border-ink text-ink font-body placeholder:text-steel focus:border-marigold focus:outline-none shadow-[3px_3px_0px_#2B2118]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[48px] bg-marigold text-ink font-label font-bold px-6 py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all"
              >
                Search / खोजें →
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
              <Link
                href="/salons"
                className="bg-maroon text-paper font-label font-bold px-5 py-2.5 border-2 border-maroon hover:bg-maroon/90 shadow-[3px_3px_0px_#2B2118] min-h-[44px] flex items-center"
              >
                Explore All Salons / सभी सैलून देखें
              </Link>
              <span className="font-token text-xs text-tealDeep font-bold bg-tile/70 px-2.5 py-1 border border-tealDeep/30">
                100% Verified Ustaads
              </span>
            </div>
          </div>

          {/* Hero Right: Live Token Slip Preview */}
          <div className="w-full lg:w-2/5 flex justify-center py-4">
            <TokenSlip
              tokenNumber={14}
              salonName="Sharma Ji Gents Parlour"
              salonNameHi="शर्मा जी जेंट्स पार्लर"
              barberName="Rakesh Sharma"
              customerName="Amit Verma"
              services={['Classic Haircut', 'Navratna Head Massage']}
              date="Today / आज"
              time="11:30 AM"
              totalPriceRupees={220}
            />
          </div>
        </div>
      </TileBackground>

      {/* Barber Pole Divider */}
      <BarberPoleDivider />

      {/* 3-Step Visual Strip */}
      <section className="bg-paper py-12 px-4 border-b-4 border-ink">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-sign text-2xl sm:text-4xl text-maroon">
              Kaise Kaam Karta Hai? / How It Works
            </h2>
            <p className="font-body text-sm sm:text-base text-steel">
              Teen aasan kadam aur aapki kursi taiyaar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Step 1 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B]">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                01
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                Choose Salon / सैलून चुनें
              </h3>
              <p className="font-body text-sm text-ink/80">
                Browse genuine neighbourhood parlours with transparent rate cards and real barber profiles.
              </p>
            </div>

            {/* Step 2 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B]">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                02
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                Pick Diary Slot / डायरी स्लॉट
              </h3>
              <p className="font-body text-sm text-ink/80">
                Pick an available time slot written directly in your ustaad&apos;s appointment register diary.
              </p>
            </div>

            {/* Step 3 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B]">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                03
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                Get Pakka Token / पक्का टोकन
              </h3>
              <p className="font-body text-sm text-ink/80">
                Receive an official digital token slip with confirmed stamp. Just walk in right on time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Verified Salons Section */}
      <section className="bg-paper py-12 px-4 flex-1">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 border-b-2 border-ink/20 pb-4">
            <div>
              <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
                Featured Neighbourhood Salons / प्रसिद्ध सैलून
              </h2>
              <p className="font-body text-sm text-steel">
                Verified traditional barbershops in your locality
              </p>
            </div>
            <Link
              href="/salons"
              className="font-label font-bold text-sm text-maroon hover:text-marigold transition-colors min-h-[44px] flex items-center"
            >
              View All Salons (सभी देखें) →
            </Link>
          </div>

          {/* Salons Grid (Mirror-frame inspired cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {salons.map((salon) => (
              <div
                key={salon.id}
                className="bg-paper border-4 border-maroon rounded-t-[32px] rounded-b-md p-4 shadow-[4px_4px_0px_#7A1F2B] flex flex-col justify-between"
              >
                <div>
                  {/* Mirror Arch Trim */}
                  <div className="border-b-2 border-dashed border-marigold/70 pb-3 mb-3 text-center">
                    <span className="font-token text-[11px] uppercase tracking-wider text-tealDeep bg-tile/40 px-2 py-0.5 border border-tealDeep/30">
                      ★ VERIFIED PARLOUR ★
                    </span>
                    <h3 className="font-sign text-2xl text-maroon mt-2 leading-tight">
                      {salon.name}
                    </h3>
                    {salon.nameHi && (
                      <p className="font-body text-sm text-steel">
                        ({salon.nameHi})
                      </p>
                    )}
                  </div>

                  <p className="font-body text-sm text-ink/80 mb-4 line-clamp-2">
                    {salon.description}
                  </p>

                  <div className="space-y-1.5 font-body text-xs text-ink/70 mb-4 bg-tile/20 p-2.5 border border-ink/20">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">📍 Area:</span>
                      <span>{salon.area}, {salon.city}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>
                        <span className="font-bold">Ustaads:</span> {salon.barbers.length} verified
                      </span>
                      <span className="font-token font-bold text-tealDeep">
                        ★ {salon.averageRating}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-ink/20 flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-body text-[11px] text-steel">Starts from</span>
                    <span className="font-token text-xl font-bold text-maroon">
                      ₹{salon.minPrice}
                    </span>
                  </div>

                  <Link
                    href={`/salons/${salon.slug}`}
                    className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs uppercase px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] flex items-center justify-center hover:bg-saffron transition-all"
                  >
                    View Rate Card / रेट देखें →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer on Tile Background */}
      <footer className="mt-auto border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-8 px-4 text-center">
          <div className="max-w-4xl mx-auto space-y-2">
            <h4 className="font-sign text-2xl text-maroon">
              Indian Salon Booking • देसी सैलून, डिजिटल टोकन
            </h4>
            <p className="font-body text-xs text-ink/80">
              Respecting the heritage of neighbourhood ustaads across India.
            </p>
            <p className="font-token text-xs text-ink/60 pt-2">
              All rights reserved © 2026 • Designed for mobile & low-bandwidth connectivity
            </p>
          </div>
        </TileBackground>
      </footer>
    </div>
  );
}
