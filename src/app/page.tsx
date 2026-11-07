import React from 'react';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  SignboardHeader,
  BarberPoleDivider,
  TileBackground,
  TokenSlip,
} from '@/components/ui';
import { db } from '@/lib/db';
import { getPublicSalons } from '@/lib/salons';
import { getLocalizedName } from '@/i18n/config';

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
        <circle cx="100" cy="15" r="7" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="100" cy="15" r="3" fill="#E8731A" />
        <circle cx="200" cy="15" r="9" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="200" cy="15" r="4" fill="#C8262F" />
        <circle cx="300" cy="15" r="7" fill="#F2A900" stroke="#7A1F2B" strokeWidth="1.5" />
        <circle cx="300" cy="15" r="3" fill="#E8731A" />
        <path d="M45 12 C45 8 55 8 55 12 Z" fill="#7A1F2B" />
        <path d="M145 12 C145 8 155 8 155 12 Z" fill="#7A1F2B" />
        <path d="M245 12 C245 8 255 8 255 12 Z" fill="#7A1F2B" />
        <path d="M345 12 C345 8 355 8 355 12 Z" fill="#7A1F2B" />
      </svg>
    </div>
  );
}

export default async function HomePage() {
  const [salons, verifiedSalonsCount, activeBarbersCount, tokensIssuedCount] = await Promise.all([
    getPublicSalons(),
    db.salon.count({ where: { status: 'VERIFIED' } }),
    db.barber.count({ where: { status: 'VERIFIED', isActive: true } }),
    db.booking.count(),
  ]);

  const locale = await getLocale();
  const t = await getTranslations('home');
  const tCommon = await getTranslations('common');
  const tSalons = await getTranslations('salons');

  const stats = [
    { label: t('statsSalons'), count: verifiedSalonsCount },
    { label: t('statsBarbers'), count: activeBarbersCount },
    { label: t('statsTokens'), count: tokensIssuedCount },
  ].filter((s) => s.count > 0);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <SignboardHeader />

      {/* Hero Section */}
      <TileBackground variant="tile" className="py-8 sm:py-16 px-4 border-b-4 border-ink">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
          {/* Hero Left Content */}
          <div className="w-full lg:w-3/5 text-center lg:text-left">
            <TruckArtFloralAccent />

            {/* Single Language Hero Headline */}
            <div className="space-y-1 mb-4">
              <h1 className="font-sign text-3xl sm:text-5xl lg:text-6xl text-maroon leading-tight">
                {t('heroTitle')}
              </h1>
            </div>

            <p className="font-body text-base sm:text-lg text-ink/90 max-w-xl mb-6">
              {t('heroSub')}
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
                  placeholder={t('searchPlaceholder')}
                  className="w-full min-h-[48px] px-4 py-3 bg-paper border-2 border-ink text-ink font-body placeholder:text-steel focus:border-marigold focus:outline-none shadow-[3px_3px_0px_#2B2118] rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="min-h-[48px] bg-marigold text-ink font-label font-bold px-6 py-3 border-2 border-ink shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5 hover:bg-saffron transition-all rounded-lg"
              >
                {t('searchAction')} →
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
              <Link
                href="/salons"
                className="bg-maroon text-paper font-label font-bold px-5 py-2.5 border-2 border-maroon hover:bg-maroon/90 shadow-[3px_3px_0px_#2B2118] min-h-[44px] flex items-center rounded-lg"
              >
                {tCommon('exploreSalons')}
              </Link>
            </div>

            {/* Real Numbers Stats Strip (hidden if count is 0) */}
            {stats.length > 0 && (
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mt-6 pt-4 border-t border-ink/20">
                {stats.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-paper border-2 border-ink px-3 py-1.5 shadow-[2px_2px_0px_#2B2118] rounded flex items-center gap-2"
                  >
                    <span className="font-token font-black text-maroon text-base">
                      {item.count}
                    </span>
                    <span className="font-label text-xs uppercase tracking-normal text-ink/80 font-bold">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hero Right: Live Token Slip Preview */}
          <div className="w-full lg:w-2/5 flex justify-center py-4">
            <TokenSlip
              tokenNumber={14}
              salonName="Sharma Ji Gents Parlour"
              salonNameHi={t('previewSalonNameHi')}
              barberName="Rakesh Sharma"
              customerName="Amit Verma"
              services={[t('previewService1'), t('previewService2')]}
              date={tCommon('today')}
              time="11:30 AM"
              totalPriceRupees={220}
              showActions={false}
            />
          </div>
        </div>
      </TileBackground>

      <BarberPoleDivider />

      {/* 3-Step Visual Strip */}
      <section className="bg-paper py-12 px-4 border-b-4 border-ink">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-sign text-2xl sm:text-4xl text-maroon">
              {t('howItWorksTitle')}
            </h2>
            <p className="font-body text-sm sm:text-base text-steel mt-1">
              {t('howItWorksSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Step 1 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                01
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                {t('step1Title')}
              </h3>
              <p className="font-body text-sm text-ink/80">
                {t('step1Desc')}
              </p>
            </div>

            {/* Step 2 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                02
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                {t('step2Title')}
              </h3>
              <p className="font-body text-sm text-ink/80">
                {t('step2Desc')}
              </p>
            </div>

            {/* Step 3 */}
            <div className="border-4 border-maroon bg-paper p-6 relative shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
              <span className="font-token text-4xl text-marigold font-black block mb-2">
                03
              </span>
              <h3 className="font-sign text-xl text-maroon mb-1">
                {t('step3Title')}
              </h3>
              <p className="font-body text-sm text-ink/80">
                {t('step3Desc')}
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
                {t('featuredTitle')}
              </h2>
              <p className="font-body text-sm text-steel mt-0.5">
                {tSalons('subtitle')}
              </p>
            </div>
            <Link
              href="/salons"
              className="font-label font-bold text-sm text-maroon hover:text-marigold transition-colors min-h-[44px] flex items-center"
            >
              {tCommon('exploreSalons')} →
            </Link>
          </div>

          {/* Salons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {salons.map((salon) => {
              const localizedSalonName = getLocalizedName(salon, locale);

              return (
                <div
                  key={salon.id}
                  className="bg-paper border-4 border-maroon rounded-t-[32px] rounded-b-md p-4 shadow-[4px_4px_0px_#7A1F2B] flex flex-col justify-between"
                >
                  <div>
                    {/* Mirror Arch Trim */}
                    <div className="border-b-2 border-dashed border-marigold/70 pb-3 mb-3 text-center">
                      <span className="font-token text-[11px] uppercase tracking-wider text-tealDeep bg-tile/40 px-2 py-0.5 border border-tealDeep/30">
                        ★ {t('verifiedSalonBadge')} ★
                      </span>
                      <h3 className="font-sign text-2xl text-maroon mt-2 leading-tight">
                        {localizedSalonName}
                      </h3>
                    </div>

                    <p className="font-body text-sm text-ink/80 mb-4 line-clamp-2">
                      {salon.description}
                    </p>

                    <div className="space-y-1.5 font-body text-xs text-ink/70 mb-4 bg-tile/20 p-2.5 border border-ink/20">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">📍 {tCommon('address')}:</span>
                        <span>{salon.area}, {salon.city}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>
                          <span className="font-bold">{t('barbersCountLabel')}:</span> {salon.barbers.length}
                        </span>
                        <span className="font-token font-bold text-tealDeep">
                          ★ {salon.averageRating}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-ink/20 flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="font-body text-[11px] text-steel">
                        {t('startsFrom')}
                      </span>
                      <span className="font-token text-xl font-bold text-maroon">
                        ₹{salon.minPrice}
                      </span>
                    </div>

                    <Link
                      href={`/salons/${salon.slug}`}
                      className="min-h-[44px] bg-marigold text-ink font-label font-bold text-xs uppercase px-4 py-2 border-2 border-ink shadow-[2px_2px_0px_#2B2118] flex items-center justify-center hover:bg-saffron transition-all rounded-md"
                    >
                      {tSalons('viewRateCard')} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer on Tile Background */}
      <footer className="mt-auto border-t-4 border-ink">
        <BarberPoleDivider />
        <TileBackground variant="tile" className="py-8 px-4 text-center">
          <div className="max-w-4xl mx-auto space-y-2">
            <h4 className="font-sign text-2xl text-maroon">
              {t('footerText')}
            </h4>
            <p className="font-body text-xs text-ink/80">
              {t('footerDedication')}
            </p>
            <p className="font-token text-xs text-ink/60 pt-2">
              {t('allRightsReserved')}
            </p>
          </div>
        </TileBackground>
      </footer>
    </div>
  );
}
