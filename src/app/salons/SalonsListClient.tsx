'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { PublicSalonListItem } from '@/lib/salons';
import { FilterChip } from '@/components/ui';
import { ServiceCategory } from '@prisma/client';
import { clsx } from 'clsx';

interface SalonsListClientProps {
  initialSalons: PublicSalonListItem[];
  initialQuery?: string;
  initialCat?: ServiceCategory;
  initialHomeVisit?: boolean;
  initialOpenNow?: boolean;
}

export default function SalonsListClient({
  initialSalons,
  initialQuery = '',
  initialCat,
  initialHomeVisit = false,
  initialOpenNow = false,
}: SalonsListClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCat, setSelectedCat] = useState<ServiceCategory | null>(
    initialCat || null
  );
  const [homeVisitOnly, setHomeVisitOnly] = useState(initialHomeVisit);
  const [openNowOnly, setOpenNowOnly] = useState(initialOpenNow);

  // Client-side instant filter over verified salons
  const filteredSalons = useMemo(() => {
    return initialSalons.filter((salon) => {
      // Query filter
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const matchesName = salon.name.toLowerCase().includes(q);
        const matchesNameHi = salon.nameHi?.toLowerCase().includes(q) ?? false;
        const matchesArea = salon.area.toLowerCase().includes(q);
        const matchesCity = salon.city.toLowerCase().includes(q);
        const matchesDesc = salon.description?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesNameHi && !matchesArea && !matchesCity && !matchesDesc) {
          return false;
        }
      }

      // Category filter
      if (selectedCat) {
        const hasCat = salon.services.some(
          (s) => s.category === selectedCat && s.isActive
        );
        if (!hasCat) return false;
      }

      // Home visit filter
      if (homeVisitOnly && !salon.offersHomeVisit) {
        return false;
      }

      // Open now filter
      if (openNowOnly && !salon.isOpenNow) {
        return false;
      }

      return true;
    });
  }, [initialSalons, query, selectedCat, homeVisitOnly, openNowOnly]);

  const clearAllFilters = () => {
    setQuery('');
    setSelectedCat(null);
    setHomeVisitOnly(false);
    setOpenNowOnly(false);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar + Filter Chips Strip */}
      <div className="bg-paper border-4 border-maroon p-4 sm:p-5 shadow-[4px_4px_0px_#7A1F2B]">
        {/* Search Input */}
        <div className="mb-4">
          <label htmlFor="salon-search" className="block font-label font-bold text-sm text-ink mb-1">
            Search Parlour or Area / नाम या इलाका खोजें:
          </label>
          <div className="relative">
            <input
              id="salon-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Sharma Ji, Indiranagar, Bengaluru..."
              className="w-full min-h-[44px] px-4 py-2.5 bg-paper border-2 border-ink text-ink font-body placeholder:text-steel focus:border-marigold focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 font-token text-xs text-steel hover:text-ink px-2 py-1"
                aria-label="Clear search text"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div>
          <span className="block font-label text-xs uppercase tracking-wider text-steel mb-2">
            Filter by Service / सेवाएं चुनें:
          </span>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              label="All"
              labelHi="सभी"
              active={selectedCat === null && !homeVisitOnly && !openNowOnly}
              onClick={clearAllFilters}
            />
            <FilterChip
              label="Hair"
              labelHi="बाल"
              active={selectedCat === ServiceCategory.HAIR}
              onClick={() =>
                setSelectedCat(
                  selectedCat === ServiceCategory.HAIR ? null : ServiceCategory.HAIR
                )
              }
            />
            <FilterChip
              label="Beard"
              labelHi="दाढ़ी"
              active={selectedCat === ServiceCategory.BEARD}
              onClick={() =>
                setSelectedCat(
                  selectedCat === ServiceCategory.BEARD ? null : ServiceCategory.BEARD
                )
              }
            />
            <FilterChip
              label="Home Visit"
              labelHi="घर पर"
              active={homeVisitOnly}
              onClick={() => setHomeVisitOnly(!homeVisitOnly)}
            />
            <FilterChip
              label="Open Now"
              labelHi="अभी खुला है"
              active={openNowOnly}
              onClick={() => setOpenNowOnly(!openNowOnly)}
            />
          </div>
        </div>
      </div>

      {/* Salons List */}
      {filteredSalons.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSalons.map((salon) => (
            <div
              key={salon.id}
              className="bg-paper border-4 border-maroon rounded-t-[32px] rounded-b-md p-5 shadow-[4px_4px_0px_#7A1F2B] flex flex-col justify-between"
            >
              <div>
                {/* Mirror Top Badge & Salon Title */}
                <div className="border-b-2 border-dashed border-marigold/70 pb-3 mb-3 text-center">
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={clsx(
                        'font-token text-[10px] font-bold px-2 py-0.5 border border-ink',
                        salon.isOpenNow
                          ? 'bg-tile text-tealDeep'
                          : 'bg-paper text-poleRed'
                      )}
                    >
                      {salon.isOpenNow ? '● OPEN NOW' : '○ CLOSED'}
                    </span>

                    {/* Waiting Badge */}
                    <span className="font-token text-[10px] font-bold bg-ink text-marigold px-2 py-0.5">
                      Waiting: ~25 min
                    </span>
                  </div>

                  <h2 className="font-sign text-2xl text-maroon mt-1 leading-tight">
                    {salon.name}
                  </h2>
                  {salon.nameHi && (
                    <p className="font-body text-xs text-steel">
                      ({salon.nameHi})
                    </p>
                  )}
                </div>

                <p className="font-body text-xs sm:text-sm text-ink/80 mb-4 line-clamp-2">
                  {salon.description}
                </p>

                {/* Info strip */}
                <div className="space-y-1.5 font-body text-xs text-ink/80 mb-4 bg-tile/15 p-3 border border-ink/20">
                  <div className="flex items-start gap-1">
                    <span className="font-bold">📍 Address:</span>
                    <span>
                      {salon.addressLine}, {salon.area}, {salon.city}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-ink/10">
                    <span>
                      <span className="font-bold">Ustaads:</span> {salon.barbers.length} verified
                    </span>
                    <span className="font-token font-bold text-tealDeep">
                      ★ {salon.averageRating}
                    </span>
                  </div>
                  {salon.offersHomeVisit && (
                    <div className="text-tealDeep font-bold text-[11px] pt-0.5">
                      ✓ Home visits available in {salon.homeVisitRadiusKm ?? 5} km
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Price & Action */}
              <div className="pt-3 border-t border-ink/20 flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-body text-[11px] text-steel">From / शुरुआत</span>
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
      ) : (
        /* Hinglish Empty State */
        <div className="border-4 border-dashed border-maroon bg-paper p-8 sm:p-12 text-center max-w-xl mx-auto shadow-[4px_4px_0px_#7A1F2B]">
          <div className="font-token text-5xl text-maroon mb-3">✂</div>
          <h3 className="font-sign text-2xl text-maroon mb-1">
            Koi salon nahi mila. Doosra search try karein?
          </h3>
          <p className="font-body text-base text-steel mb-6">
            कोई सैलून नहीं मिला। दूसरा शब्द खोजकर देखें।
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="border-2 border-ink bg-marigold px-6 py-3 font-label font-bold text-ink min-h-[44px] shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5"
          >
            Sare Filter Hatayein / Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
