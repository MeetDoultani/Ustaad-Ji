'use client';

import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface DiarySlot {
  time: string; // e.g. "10:00 AM"
  isBooked: boolean;
  startsAt?: string;
  reason?: 'past' | 'booked' | 'time_off' | 'too_short';
}

export interface DiaryDateTab {
  dateIst: string;
  labelEn: string;
  labelHi: string;
}

interface RegisterDiarySlotPickerProps {
  // Date tabs
  dates?: DiaryDateTab[];
  selectedDateIst?: string;
  onSelectDateIst?: (dateIst: string) => void;

  // Legacy index-based tabs for backwards compatibility
  selectedDay?: number;
  onSelectDay?: (dayIndex: number) => void;

  // Selected slot state
  selectedSlot?: string; // startsAt ISO string or time string
  onSelectSlot?: (time: string, startsAt?: string) => void;

  // Slots data
  slots?: Array<{
    startsAt: string;
    endsAt?: string;
    timeStr: string;
    available: boolean;
    reason?: 'past' | 'booked' | 'time_off' | 'too_short';
  }>;
  slotsByDay?: Record<number, DiarySlot[]>;

  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

const DEFAULT_DAY_LABELS: DiaryDateTab[] = [
  { dateIst: '0', labelEn: 'Aaj', labelHi: 'आज' },
  { dateIst: '1', labelEn: 'Kal', labelHi: 'कल' },
  { dateIst: '2', labelEn: 'Day 3', labelHi: 'परसों' },
  { dateIst: '3', labelEn: 'Day 4', labelHi: 'दिन 4' },
  { dateIst: '4', labelEn: 'Day 5', labelHi: 'दिन 5' },
  { dateIst: '5', labelEn: 'Day 6', labelHi: 'दिन 6' },
  { dateIst: '6', labelEn: 'Day 7', labelHi: 'दिन 7' },
];

const generateDefaultSlots = (): Record<number, DiarySlot[]> => {
  const times = [
    '09:30 AM',
    '10:15 AM',
    '11:00 AM',
    '11:45 AM',
    '12:30 PM',
    '02:00 PM',
    '02:45 PM',
    '03:30 PM',
    '04:15 PM',
    '05:00 PM',
    '06:00 PM',
    '07:00 PM',
  ];

  const map: Record<number, DiarySlot[]> = {};
  for (let day = 0; day < 7; day++) {
    map[day] = times.map((t, idx) => ({
      time: t,
      isBooked: (idx + day * 2) % 3 === 0,
    }));
  }
  return map;
};

export default function RegisterDiarySlotPicker({
  dates,
  selectedDateIst,
  onSelectDateIst,
  selectedDay: externalDay,
  onSelectDay,
  selectedSlot: externalSlot,
  onSelectSlot,
  slots: directSlots,
  slotsByDay,
  isLoading = false,
  emptyMessage = 'Is din koi slot uplabdh nahi hai.',
  className,
}: RegisterDiarySlotPickerProps) {
  const [internalDay, setInternalDay] = useState(0);
  const [internalSlot, setInternalSlot] = useState<string | null>(null);

  const activeDay = externalDay !== undefined ? externalDay : internalDay;
  const activeSlot = externalSlot !== undefined ? externalSlot : internalSlot;

  // Determine active tabs
  const tabs: DiaryDateTab[] =
    dates && dates.length > 0
      ? dates
      : DEFAULT_DAY_LABELS;

  const handleTabClick = (tab: DiaryDateTab, idx: number) => {
    if (onSelectDateIst) {
      onSelectDateIst(tab.dateIst);
    }
    if (onSelectDay) {
      onSelectDay(idx);
    }
    setInternalDay(idx);
  };

  const handleSlotClick = (time: string, isBooked: boolean, startsAt?: string) => {
    if (isBooked) return;
    if (onSelectSlot) {
      onSelectSlot(time, startsAt);
    }
    setInternalSlot(startsAt || time);
  };

  // Compute slot items to display
  let itemsToRender: DiarySlot[] = [];
  if (directSlots) {
    itemsToRender = directSlots.map((s) => ({
      time: s.timeStr,
      isBooked: !s.available,
      startsAt: s.startsAt,
      reason: s.reason,
    }));
  } else if (slotsByDay) {
    itemsToRender = slotsByDay[activeDay] || [];
  } else {
    itemsToRender = generateDefaultSlots()[activeDay] || [];
  }

  return (
    <div className={clsx('relative flex flex-col', className)}>
      {/* Diary Page Tabs (Top sticky bookmarks) */}
      <div className="flex overflow-x-auto gap-1 pb-1 pt-2 px-2 sm:px-4 scrollbar-none">
        {tabs.map((tab, idx) => {
          const isActive = selectedDateIst
            ? tab.dateIst === selectedDateIst
            : idx === activeDay;

          return (
            <button
              key={tab.dateIst || idx}
              type="button"
              onClick={() => handleTabClick(tab, idx)}
              className={clsx(
                'min-h-[44px] px-3 sm:px-3.5 py-1.5 font-label font-bold text-xs sm:text-sm border-t-2 border-x-2 rounded-t-md transition-all whitespace-nowrap',
                isActive
                  ? 'bg-paper text-maroon border-maroon shadow-[-1px_-2px_0px_#2B2118] translate-y-0.5 z-10'
                  : 'bg-steel/20 text-steel border-steel/60 hover:bg-paper/60 hover:text-ink'
              )}
            >
              <span>{tab.labelEn}</span>{' '}
              <span className="font-body text-xs opacity-75">/ {tab.labelHi}</span>
            </button>
          );
        })}
      </div>

      {/* Notebook Register Page */}
      <div className="relative bg-paper border-4 border-maroon shadow-[5px_5px_0px_#2B2118] flex min-h-[380px]">
        {/* Left Edge: Spiral / Stitched Binding */}
        <div className="w-8 sm:w-10 bg-maroon/15 border-r border-maroon/30 flex flex-col justify-around py-4 flex-shrink-0">
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full bg-paper border-2 border-ink shadow-inner mx-auto my-1.5 flex items-center justify-center"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-maroon/40" />
            </div>
          ))}
        </div>

        {/* Ruled Notebook Sheet Content */}
        <div className="flex-1 p-3 sm:p-5 relative">
          {/* Vertical Red Margin Line */}
          <div
            className="absolute top-0 bottom-0 left-6 sm:left-10 w-0.5 bg-poleRed/40 pointer-events-none"
            aria-hidden="true"
          />

          {/* Diary Header */}
          <div className="ml-5 sm:ml-9 mb-4 border-b-2 border-ink/20 pb-2">
            <div className="flex items-baseline justify-between">
              <span className="font-sign text-lg sm:text-xl text-maroon">
                Appointment Diary / बहीखाता
              </span>
              <span className="font-token text-xs text-steel">
                {selectedDateIst ? `Date: ${selectedDateIst}` : `Page #${activeDay + 1}`}
              </span>
            </div>
            <p className="font-body text-xs text-ink/70">
              Pen line across a slot indicates it is booked. Tap any available time line.
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="ml-5 sm:ml-9 py-12 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-4 border-maroon border-t-transparent rounded-full animate-spin mb-3" />
              <p className="font-label font-bold text-sm text-maroon">
                Diary panna khul raha hai... / डायरी लोड हो रही है...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && itemsToRender.length === 0 && (
            <div className="ml-5 sm:ml-9 py-12 text-center text-steel font-body border-2 border-dashed border-steel/40 p-4">
              <p className="font-label text-base font-bold text-ink/80 mb-1">
                Koi slot uplabdh nahi / कोई स्लॉट खाली नहीं
              </p>
              <p className="text-xs">{emptyMessage}</p>
            </div>
          )}

          {/* Ruled Slots Grid */}
          {!isLoading && itemsToRender.length > 0 && (
            <div className="ml-5 sm:ml-9 divide-y-2 divide-tile/40 max-h-[480px] overflow-y-auto pr-1">
              {itemsToRender.map((slot, index) => {
                const isSelected =
                  activeSlot === slot.startsAt || activeSlot === slot.time;

                let reasonBadge = 'Booked / भरा हुआ';
                if (slot.reason === 'past') {
                  reasonBadge = 'Past / समय समाप्त';
                } else if (slot.reason === 'time_off') {
                  reasonBadge = 'Break / छुट्टी';
                } else if (slot.reason === 'too_short') {
                  reasonBadge = 'Too Short / समय कम';
                }

                return (
                  <div
                    key={slot.startsAt || index}
                    onClick={() =>
                      handleSlotClick(slot.time, slot.isBooked, slot.startsAt)
                    }
                    role="button"
                    tabIndex={slot.isBooked ? -1 : 0}
                    aria-disabled={slot.isBooked}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        handleSlotClick(slot.time, slot.isBooked, slot.startsAt);
                      }
                    }}
                    className={clsx(
                      'flex items-center justify-between py-2.5 px-2 transition-all min-h-[44px]',
                      slot.isBooked
                        ? 'cursor-not-allowed bg-steel/10'
                        : 'cursor-pointer hover:bg-tile/20'
                    )}
                  >
                    {/* Time written on notebook line */}
                    <div className="flex items-center gap-3">
                      <span
                        className={clsx(
                          'font-token text-base sm:text-lg tracking-wide',
                          slot.isBooked
                            ? 'line-through decoration-poleRed decoration-2 text-steel select-none'
                            : 'text-ink font-bold'
                        )}
                      >
                        {slot.time}
                      </span>

                      {/* Booked label for accessibility */}
                      {slot.isBooked && (
                        <span className="font-label text-[11px] uppercase px-2 py-0.5 border border-poleRed/40 text-poleRed bg-paper font-bold select-none">
                          {reasonBadge}
                        </span>
                      )}
                    </div>

                    {/* Available indicator / Selection Circle */}
                    <div>
                      {slot.isBooked ? (
                        <span className="text-steel font-token text-xs select-none">
                          ✕
                        </span>
                      ) : isSelected ? (
                        <span className="font-label font-bold text-xs sm:text-sm text-ink border-2 border-marigold bg-marigold px-3 py-1 shadow-[2px_2px_0px_#2B2118]">
                          ✓ Selected / चुना गया
                        </span>
                      ) : (
                        <span className="font-label font-bold text-xs text-maroon border border-maroon/60 bg-paper px-2.5 py-1 hover:bg-marigold hover:text-ink hover:border-ink transition-colors">
                          Available / चुनें
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
