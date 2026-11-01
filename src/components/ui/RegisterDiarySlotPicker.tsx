'use client';

import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface DiarySlot {
  time: string; // e.g. "10:00 AM"
  isBooked: boolean;
}

interface RegisterDiarySlotPickerProps {
  selectedDay?: number; // 0 = Aaj, 1 = Kal, etc.
  onSelectDay?: (dayIndex: number) => void;
  selectedSlot?: string;
  onSelectSlot?: (time: string) => void;
  slotsByDay?: Record<number, DiarySlot[]>;
  className?: string;
}

// Generate realistic mock preview slots for the 7 days if not provided
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
      // Create some booked slots for realistic diary look
      isBooked: (idx + day * 2) % 3 === 0,
    }));
  }
  return map;
};

const DAY_LABELS = [
  { en: 'Aaj', hi: 'आज' },
  { en: 'Kal', hi: 'कल' },
  { en: 'Day 3', hi: 'परसों' },
  { en: 'Day 4', hi: 'दिन 4' },
  { en: 'Day 5', hi: 'दिन 5' },
  { en: 'Day 6', hi: 'दिन 6' },
  { en: 'Day 7', hi: 'दिन 7' },
];

export default function RegisterDiarySlotPicker({
  selectedDay: externalDay,
  onSelectDay,
  selectedSlot: externalSlot,
  onSelectSlot,
  slotsByDay,
  className,
}: RegisterDiarySlotPickerProps) {
  const [internalDay, setInternalDay] = useState(0);
  const [internalSlot, setInternalSlot] = useState<string | null>(null);

  const activeDay = externalDay !== undefined ? externalDay : internalDay;
  const activeSlot = externalSlot !== undefined ? externalSlot : internalSlot;

  const handleDayClick = (dayIdx: number) => {
    if (onSelectDay) onSelectDay(dayIdx);
    setInternalDay(dayIdx);
  };

  const handleSlotClick = (time: string, isBooked: boolean) => {
    if (isBooked) return;
    if (onSelectSlot) onSelectSlot(time);
    setInternalSlot(time);
  };

  const allSlots = slotsByDay || generateDefaultSlots();
  const currentSlots = allSlots[activeDay] || [];

  return (
    <div className={clsx('relative flex flex-col', className)}>
      {/* Diary Page Tabs (Top sticky bookmarks) */}
      <div className="flex overflow-x-auto gap-1 pb-1 pt-2 px-4 scrollbar-none">
        {DAY_LABELS.map((day, idx) => {
          const isActive = idx === activeDay;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleDayClick(idx)}
              className={clsx(
                'min-h-[44px] px-3.5 py-1.5 font-label font-bold text-xs sm:text-sm border-t-2 border-x-2 rounded-t-md transition-all whitespace-nowrap',
                isActive
                  ? 'bg-paper text-maroon border-maroon shadow-[-1px_-2px_0px_#2B2118] translate-y-0.5 z-10'
                  : 'bg-steel/20 text-steel border-steel/60 hover:bg-paper/60 hover:text-ink'
              )}
            >
              <span>{day.en}</span>{' '}
              <span className="font-body text-xs opacity-75">/ {day.hi}</span>
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
                Page #{activeDay + 1}
              </span>
            </div>
            <p className="font-body text-xs text-ink/70">
              Pen line across a slot indicates it is booked. Tap any available time line.
            </p>
          </div>

          {/* Ruled Slots Grid */}
          <div className="ml-5 sm:ml-9 divide-y-2 divide-tile/40">
            {currentSlots.map((slot, index) => {
              const isSelected = activeSlot === slot.time;
              return (
                <div
                  key={index}
                  onClick={() => handleSlotClick(slot.time, slot.isBooked)}
                  role="button"
                  tabIndex={slot.isBooked ? -1 : 0}
                  aria-disabled={slot.isBooked}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleSlotClick(slot.time, slot.isBooked);
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
                      <span className="font-label text-xs uppercase px-2 py-0.5 border border-poleRed/40 text-poleRed bg-paper font-bold select-none">
                        Booked / भरा हुआ
                      </span>
                    )}
                  </div>

                  {/* Available indicator / Selection Circle */}
                  <div>
                    {slot.isBooked ? (
                      <span className="text-steel font-token text-xs select-none">
                        ✕ Taken
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
        </div>
      </div>
    </div>
  );
}
