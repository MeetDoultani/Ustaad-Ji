'use client';

import React, { useState } from 'react';
import { clsx } from 'clsx';
import { useLocale, useTranslations } from 'next-intl';

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
  dates?: DiaryDateTab[];
  selectedDateIst?: string;
  onSelectDateIst?: (dateIst: string) => void;

  selectedDay?: number;
  onSelectDay?: (dayIndex: number) => void;

  selectedSlot?: string;
  onSelectSlot?: (time: string, startsAt?: string) => void;

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
  emptyMessage,
  className,
}: RegisterDiarySlotPickerProps) {
  const locale = useLocale();
  const t = useTranslations('diary');
  const tCommon = useTranslations('common');
  const [internalDay, setInternalDay] = useState(0);
  const [internalSlot, setInternalSlot] = useState<string | null>(null);

  const defaultTabs: DiaryDateTab[] = [
    { dateIst: '0', labelEn: t('today'), labelHi: t('today') },
    { dateIst: '1', labelEn: t('tomorrow'), labelHi: t('tomorrow') },
    { dateIst: '2', labelEn: t('day3'), labelHi: t('day3') },
    { dateIst: '3', labelEn: t('day4'), labelHi: t('day4') },
    { dateIst: '4', labelEn: t('day5'), labelHi: t('day5') },
    { dateIst: '5', labelEn: t('day6'), labelHi: t('day6') },
    { dateIst: '6', labelEn: t('day7'), labelHi: t('day7') },
  ];

  const activeDay = externalDay !== undefined ? externalDay : internalDay;
  const activeSlot = externalSlot !== undefined ? externalSlot : internalSlot;

  const tabs: DiaryDateTab[] =
    dates && dates.length > 0
      ? dates
      : defaultTabs;

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
  }

  return (
    <div className={clsx('relative flex flex-col', className)}>
      {/* Diary Page Tabs (Top sticky bookmarks) */}
      <div className="flex overflow-x-auto gap-1 pb-1 pt-2 px-2 sm:px-4 scrollbar-none">
        {tabs.map((tab, idx) => {
          const isActive = selectedDateIst
            ? tab.dateIst === selectedDateIst
            : idx === activeDay;

          const tabLabel = locale === 'hi' ? tab.labelHi : tab.labelEn;

          return (
            <button
              key={tab.dateIst || idx}
              type="button"
              onClick={() => handleTabClick(tab, idx)}
              className={clsx(
                'min-h-[44px] px-3 sm:px-4 py-2 font-label font-bold text-xs sm:text-sm border-t-2 border-x-2 rounded-t-md transition-all whitespace-nowrap',
                isActive
                  ? 'bg-paper text-maroon border-maroon shadow-[-1px_-2px_0px_#2B2118] translate-y-0.5 z-10'
                  : 'bg-steel/20 text-steel border-steel/60 hover:bg-paper/60 hover:text-ink'
              )}
            >
              <span>{tabLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Notebook Register Page */}
      <div className="relative bg-paper border-4 border-maroon shadow-[5px_5px_0px_#2B2118] flex min-h-[380px] rounded-b-xl rounded-tr-xl">
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
                {t('appointmentDiary')}
              </span>
              <span className="font-token text-xs text-steel">
                {selectedDateIst ? `${selectedDateIst}` : `Page #${activeDay + 1}`}
              </span>
            </div>
            <p className="font-body text-xs text-ink/70 mt-0.5">
              {t('pickerHint')}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="ml-5 sm:ml-9 py-12 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-4 border-maroon border-t-transparent rounded-full animate-spin mb-3" />
              <p className="font-label font-bold text-sm text-maroon">
                {tCommon('loading')}
              </p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && itemsToRender.length === 0 && (
            <div className="ml-5 sm:ml-9 py-12 text-center text-steel font-body border-2 border-dashed border-steel/40 p-4 rounded-lg">
              <p className="font-label text-base font-bold text-ink/80 mb-1">
                {t('noSlots')}
              </p>
              {emptyMessage && <p className="text-xs">{emptyMessage}</p>}
            </div>
          )}

          {/* Ruled Slots Grid */}
          {!isLoading && itemsToRender.length > 0 && (
            <div className="ml-5 sm:ml-9 divide-y-2 divide-tile/40 max-h-[480px] overflow-y-auto pr-1">
              {itemsToRender.map((slot, index) => {
                const isSelected =
                  activeSlot === slot.startsAt || activeSlot === slot.time;

                let reasonBadge = t('booked');
                if (slot.reason === 'past') {
                  reasonBadge = t('reasonPast');
                } else if (slot.reason === 'time_off') {
                  reasonBadge = t('reasonBreak');
                } else if (slot.reason === 'too_short') {
                  reasonBadge = t('reasonTooShort');
                }

                return (
                  <div
                    key={slot.startsAt || index}
                    onClick={() => handleSlotClick(slot.time, slot.isBooked, slot.startsAt)}
                    role="button"
                    tabIndex={slot.isBooked ? -1 : 0}
                    aria-disabled={slot.isBooked}
                    aria-pressed={isSelected}
                    onKeyDown={(e) => {
                      if (!slot.isBooked && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault();
                        handleSlotClick(slot.time, slot.isBooked, slot.startsAt);
                      }
                    }}
                    className={clsx(
                      'group flex items-center justify-between py-2 sm:py-2.5 px-2 transition-all relative min-h-[44px]',
                      slot.isBooked
                        ? 'cursor-not-allowed opacity-60 bg-steel/10'
                        : 'cursor-pointer hover:bg-tile/20',
                      isSelected &&
                        'bg-marigold/30 font-bold border-l-4 border-maroon'
                    )}
                  >
                    {/* Time Slot on Ruled Line */}
                    <div className="flex items-center gap-3">
                      <span className="font-token text-xs text-steel w-5">
                        {String(index + 1).padStart(2, '0')}.
                      </span>
                      <span
                        className={clsx(
                          'font-token text-base sm:text-lg tracking-tight',
                          slot.isBooked
                            ? 'line-through text-steel decoration-poleRed decoration-2'
                            : isSelected
                            ? 'text-maroon font-bold'
                            : 'text-ink'
                        )}
                      >
                        {slot.time}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <span className="font-label font-bold text-xs uppercase px-2 py-0.5 bg-maroon text-chalk border border-ink shadow-sm">
                          {t('selected')}
                        </span>
                      ) : slot.isBooked ? (
                        <span className="font-label font-bold text-[11px] uppercase px-1.5 py-0.5 bg-steel/20 text-steel border border-steel/40">
                          {reasonBadge}
                        </span>
                      ) : (
                        <span className="font-label font-bold text-[11px] uppercase px-2 py-0.5 bg-tile/40 text-tealDeep border border-tealDeep/40 group-hover:bg-marigold group-hover:text-ink group-hover:border-ink transition-colors">
                          {t('available')}
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
