'use client';

import React from 'react';
import { Barber } from '@prisma/client';
import { clsx } from 'clsx';

interface UstaadCardProps {
  barber: Barber & {
    services?: { service: { name: string } }[];
  };
  isSelected?: boolean;
  onSelect?: (barberId: string) => void;
  isAvailableNow?: boolean;
  nextFreeTime?: string;
  rating?: number;
  className?: string;
}

export default function UstaadCard({
  barber,
  isSelected = false,
  onSelect,
  isAvailableNow = true,
  nextFreeTime,
  rating = 4.9,
  className,
}: UstaadCardProps) {
  // Extract specialties from services if available
  const specialities =
    barber.services && barber.services.length > 0
      ? barber.services.slice(0, 3).map((s) => s.service.name)
      : ['Hair Art', 'Hot Towel Shave', 'Head Massage'];

  return (
    <div
      onClick={onSelect ? () => onSelect(barber.id) : undefined}
      className={clsx(
        'relative flex flex-col items-center text-center transition-all',
        onSelect && 'cursor-pointer active:translate-y-0.5',
        className
      )}
    >
      {/* Ornate Indian Salon Mirror Frame */}
      <div
        className={clsx(
          'w-full max-w-[280px] rounded-t-[40px] rounded-b-md border-4 p-2 transition-all',
          isSelected
            ? 'border-marigold bg-marigold/10 shadow-[4px_4px_0px_#2B2118]'
            : 'border-maroon bg-paper shadow-[3px_3px_0px_#7A1F2B]'
        )}
      >
        {/* Inner Gold Foil Trim */}
        <div className="rounded-t-[32px] rounded-b-sm border-2 border-marigold/80 p-3 bg-paper flex flex-col items-center">
          {/* Mirror Crown Accent */}
          <div className="mb-2 text-maroon font-sign text-xs tracking-widest uppercase">
            ✦ Ustaad / उस्ताद ✦
          </div>

          {/* Photo / Avatar with Arch Border */}
          <div className="relative w-28 h-28 mb-3 rounded-t-full rounded-b-lg overflow-hidden border-2 border-maroon bg-tile/40 shadow-inner">
            {barber.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={barber.photoUrl}
                alt={barber.displayName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-tealDeep text-marigold font-sign text-3xl">
                {barber.displayName.charAt(0)}
              </div>
            )}

            {/* Status indicator badge */}
            <span
              className={clsx(
                'absolute bottom-1 right-1 px-1.5 py-0.5 font-token text-[10px] font-bold border border-ink',
                isAvailableNow
                  ? 'bg-tile text-tealDeep'
                  : 'bg-marigold text-ink'
              )}
            >
              {isAvailableNow ? 'FREE' : 'BUSY'}
            </span>
          </div>

          {/* Barber Info */}
          <h4 className="font-sign text-xl text-maroon leading-tight">
            {barber.displayName}
          </h4>

          <div className="flex items-center gap-2 mt-1 text-xs font-body text-steel">
            <span>{barber.experienceYears}+ years exp.</span>
            <span>•</span>
            <span className="font-token text-ink font-bold">★ {rating.toFixed(1)}</span>
          </div>

          {/* Specialties tag strip */}
          <div className="flex flex-wrap justify-center gap-1 my-3">
            {specialities.map((item, idx) => (
              <span
                key={idx}
                className="font-label text-[11px] bg-paper border border-steel/60 px-2 py-0.5 text-ink/80 rounded-none"
              >
                {item}
              </span>
            ))}
          </div>

          {/* Availability / Next Free Label */}
          <div
            className={clsx(
              'w-full py-1.5 px-2 border border-ink/40 font-token text-xs font-bold mb-2',
              isAvailableNow
                ? 'bg-tile/40 text-tealDeep'
                : 'bg-paper text-poleRed'
            )}
          >
            {isAvailableNow
              ? '● Available Now / अभी खाली'
              : nextFreeTime
              ? `Next free: ${nextFreeTime}`
              : 'Next free in ~25 min'}
          </div>

          {/* Action / Select Button */}
          {onSelect && (
            <button
              type="button"
              className={clsx(
                'w-full min-h-[40px] font-label font-bold text-xs uppercase tracking-wider border-2 transition-all',
                isSelected
                  ? 'bg-marigold text-ink border-ink shadow-[2px_2px_0px_#2B2118]'
                  : 'bg-paper text-maroon border-maroon hover:bg-marigold hover:text-ink'
              )}
            >
              {isSelected ? '✓ Selected / चुना' : 'Select / चुनें'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
