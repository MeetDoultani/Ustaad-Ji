'use client';

import React, { useState, useTransition } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatMinutesToTime } from '@/lib/time';
import { updateBarberAvailabilityAction } from '../actions';
import { AvailabilityWindowInput, SalonHoursDayInput, ScheduleConflictItem } from '@/lib/staff-config-service';

interface AvailabilityClientProps {
  userRole: 'OWNER' | 'BARBER';
  salonId: string;
  barbers: Array<{ id: string; displayName: string; isActive: boolean }>;
  selectedBarberId: string;
  initialWindows: AvailabilityWindowInput[];
  salonHours: SalonHoursDayInput[];
}

const WEEKDAYS_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon to Sun

const WEEKDAY_KEYS: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

const TIME_GRID_OPTIONS: number[] = [];
for (let m = 0; m <= 1440; m += 15) {
  TIME_GRID_OPTIONS.push(m);
}

export default function AvailabilityClient({
  userRole,
  salonId,
  barbers,
  selectedBarberId,
  initialWindows,
  salonHours,
}: AvailabilityClientProps) {
  const router = useRouter();
  const t = useTranslations('dashboard');
  const tErrors = useTranslations('errors');

  const [windows, setWindows] = useState<AvailabilityWindowInput[]>(initialWindows);
  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleBarberSwitch = (barberId: string) => {
    router.push(`/dashboard/availability?salonId=${encodeURIComponent(salonId)}&barberId=${encodeURIComponent(barberId)}`);
  };

  const handleAddShift = (weekday: number) => {
    setSuccessMessage(false);
    setErrorMessage(null);

    const dayWindows = windows.filter((w) => w.weekday === weekday);
    if (dayWindows.length >= 4) {
      setErrorMessage(tErrors('LIMIT_EXCEEDED'));
      return;
    }

    // Default shift: 540 (9:00 AM) to 1260 (9:00 PM) or after the latest window
    let startMin = 540;
    let endMin = 780; // 1:00 PM
    if (dayWindows.length > 0) {
      const maxEnd = Math.max(...dayWindows.map((w) => w.endMin));
      if (maxEnd < 1380) {
        startMin = Math.min(1380, maxEnd + 60);
        endMin = Math.min(1440, startMin + 240);
      }
    }

    setWindows((prev) => [...prev, { weekday, startMin, endMin }]);
  };

  const handleRemoveShift = (indexToRemove: number) => {
    setSuccessMessage(false);
    setErrorMessage(null);
    setWindows((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleShiftChange = (
    index: number,
    field: 'startMin' | 'endMin',
    value: number
  ) => {
    setSuccessMessage(false);
    setErrorMessage(null);
    setWindows((prev) =>
      prev.map((w, idx) => (idx === index ? { ...w, [field]: value } : w))
    );
  };

  const handleCopyDayToAll = (sourceWeekday: number) => {
    setSuccessMessage(false);
    setErrorMessage(null);

    const sourceDayWindows = windows.filter((w) => w.weekday === sourceWeekday);
    const newWindows: AvailabilityWindowInput[] = [];

    for (const w of WEEKDAYS_DISPLAY_ORDER) {
      if (w === sourceWeekday) {
        newWindows.push(...sourceDayWindows);
      } else {
        newWindows.push(
          ...sourceDayWindows.map((win) => ({
            weekday: w,
            startMin: win.startMin,
            endMin: win.endMin,
          }))
        );
      }
    }

    setWindows(newWindows);
  };

  const handleSave = () => {
    setErrorMessage(null);
    setSuccessMessage(false);
    setConflicts([]);

    // Validate no overlaps and end > start
    const windowsByDay = new Map<number, AvailabilityWindowInput[]>();
    for (const w of windows) {
      if (w.endMin <= w.startMin) {
        setErrorMessage(tErrors('INVALID_INPUT'));
        return;
      }
      const list = windowsByDay.get(w.weekday) || [];
      for (const existing of list) {
        if (w.startMin < existing.endMin && w.endMin > existing.startMin) {
          setErrorMessage(tErrors('OVERLAPPING_WINDOWS'));
          return;
        }
      }
      list.push(w);
      windowsByDay.set(w.weekday, list);
    }

    startTransition(async () => {
      const res = await updateBarberAvailabilityAction({
        barberId: selectedBarberId,
        windows,
      });

      if (!res.ok) {
        const errKey =
          res.code && tErrors.has(res.code)
            ? tErrors(res.code as never)
            : res.error || tErrors('generic');
        setErrorMessage(errKey);
        return;
      }

      setSuccessMessage(true);
      if (res.data?.conflicts && res.data.conflicts.length > 0) {
        setConflicts(res.data.conflicts);
      }
    });
  };

  // Check if any window extends beyond configured salon hours
  const hoursMap = new Map<number, SalonHoursDayInput>();
  for (const h of salonHours) {
    hoursMap.set(h.weekday, h);
  }

  const hasExceedingHours = windows.some((w) => {
    const sHour = hoursMap.get(w.weekday);
    if (!sHour || sHour.isClosed) return true;
    return w.startMin < sHour.openMin || w.endMin > sHour.closeMin;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-paper border-4 border-maroon p-5 shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
        <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
          {t('availabilityTitle')}
        </h1>
        <p className="font-body text-sm text-steel mt-0.5">
          {t('availabilitySubtitle')}
        </p>

        {/* Barber Filter Chips for Salon Owner */}
        {userRole === 'OWNER' && barbers.length > 1 && (
          <div className="mt-4 pt-3 border-t border-charcoal/15 space-y-2">
            <span className="block font-label text-xs uppercase font-bold text-steel">
              {t('selectBarber')}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {barbers.map((barber) => {
                const isSelected = barber.id === selectedBarberId;
                return (
                  <button
                    key={barber.id}
                    type="button"
                    onClick={() => handleBarberSwitch(barber.id)}
                    aria-pressed={isSelected}
                    className={clsx(
                      'min-h-[48px] px-4 py-2 rounded-lg font-token text-xs sm:text-sm font-bold border-2 transition-all select-none',
                      isSelected
                        ? 'bg-maroon text-chalk border-marigold shadow-[2px_2px_0px_#2B2118]'
                        : 'bg-chalk text-ink border-charcoal/20 hover:border-maroon/50'
                    )}
                  >
                    {barber.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Advisory Note if Window Exceeds Salon Hours */}
      {hasExceedingHours && (
        <div className="p-4 bg-amber-50 border-2 border-amber-500 text-amber-900 rounded-xl text-xs sm:text-sm font-body">
          {t('shiftExceedsSalonHoursNote')}
        </div>
      )}

      {/* Non-blocking Conflict Banner */}
      {conflicts.length > 0 && (
        <div className="p-4 sm:p-5 bg-amber-50 border-4 border-amber-600 rounded-xl shadow-[4px_4px_0px_#92400E] space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-token text-xl">⚠️</span>
            <h3 className="font-sign text-lg font-bold text-amber-900">
              {t('scheduleConflictBanner')}
            </h3>
          </div>
          <p className="font-body text-sm text-amber-900">
            {t('scheduleConflictDesc', { count: conflicts.length })}
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {conflicts.map((c) => (
              <div
                key={c.bookingId}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-chalk border border-amber-300 text-xs font-body"
              >
                <div>
                  <span className="font-token font-bold text-maroon mr-2">
                    {t('tokenNumber', { token: c.tokenNumber })}
                  </span>
                  {c.customerName && (
                    <span className="font-medium text-ink mr-2">{c.customerName}</span>
                  )}
                  <span className="text-steel">
                    {new Date(c.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <Link
                  href={`/dashboard/bookings/${c.bookingId}`}
                  className="font-token font-bold text-maroon underline hover:text-maroon/80 select-none min-h-[44px] flex items-center"
                >
                  {t('viewBooking')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 bg-rose-100 border-2 border-rose-400 text-rose-900 text-sm rounded-xl font-body">
          {errorMessage}
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 bg-emerald-100 border-2 border-emerald-500 text-emerald-900 text-sm rounded-xl font-body font-medium">
          {t('saveAvailability')} ✓
        </div>
      )}

      {/* Weekly Availability Schedule */}
      <div className="bg-paper border-4 border-maroon p-4 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] rounded-xl space-y-5">
        <div className="space-y-4">
          {WEEKDAYS_DISPLAY_ORDER.map((weekday) => {
            const weekdayName = t(WEEKDAY_KEYS[weekday]);
            const dayWindows = windows
              .map((w, originalIndex) => ({ ...w, originalIndex }))
              .filter((w) => w.weekday === weekday);

            return (
              <div
                key={weekday}
                className="p-4 rounded-xl border-2 border-charcoal/15 bg-chalk space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-charcoal/10 pb-2">
                  <span className="font-sign text-lg font-bold text-ink">
                    {weekdayName}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyDayToAll(weekday)}
                      className="min-h-[44px] px-3 py-1.5 bg-paper text-ink border border-charcoal/20 rounded-lg font-token text-xs hover:border-maroon hover:text-maroon select-none transition-colors"
                    >
                      {t('copyDayToAll')}
                    </button>
                    <button
                      type="button"
                      disabled={dayWindows.length >= 4}
                      onClick={() => handleAddShift(weekday)}
                      className="min-h-[44px] px-3 py-1.5 bg-marigold text-ink font-bold font-token text-xs border border-ink rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-marigold/90 select-none transition-colors"
                    >
                      {t('addShift')}
                    </button>
                  </div>
                </div>

                {dayWindows.length === 0 ? (
                  <div className="py-2 text-xs font-body text-steel italic">
                    {t('noShifts')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayWindows.map((win) => (
                      <div
                        key={win.originalIndex}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-2.5 rounded-lg bg-paper border border-charcoal/20"
                      >
                        <div className="flex items-center gap-2">
                          <label className="font-label text-xs uppercase font-bold text-steel">
                            {t('openTime')}
                          </label>
                          <select
                            value={win.startMin}
                            onChange={(e) =>
                              handleShiftChange(win.originalIndex, 'startMin', Number(e.target.value))
                            }
                            className="min-h-[48px] px-2.5 py-1.5 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-xs sm:text-sm focus:outline-none focus:border-maroon"
                          >
                            {TIME_GRID_OPTIONS.filter((m) => m < 1440).map((m) => (
                              <option key={m} value={m}>
                                {formatMinutesToTime(m)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="font-label text-xs uppercase font-bold text-steel">
                            {t('closeTime')}
                          </label>
                          <select
                            value={win.endMin}
                            onChange={(e) =>
                              handleShiftChange(win.originalIndex, 'endMin', Number(e.target.value))
                            }
                            className="min-h-[48px] px-2.5 py-1.5 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-xs sm:text-sm focus:outline-none focus:border-maroon"
                          >
                            {TIME_GRID_OPTIONS.filter((m) => m > 0).map((m) => (
                              <option key={m} value={m}>
                                {formatMinutesToTime(m)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveShift(win.originalIndex)}
                          aria-label={t('removeShift')}
                          className="min-h-[48px] px-3 py-1.5 bg-rose-50 text-rose-800 border border-rose-300 rounded-lg font-token text-xs font-bold hover:bg-rose-100 select-none sm:ml-auto"
                        >
                          {t('removeShift')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t-2 border-charcoal/20">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="min-h-[48px] px-8 py-3 bg-maroon text-chalk rounded-xl font-label font-bold text-base border-2 border-marigold shadow-[4px_4px_0px_#2B2118] hover:bg-maroon/90 active:translate-x-0.5 active:translate-y-0.5 transition-all select-none disabled:opacity-50"
          >
            {isPending ? t('saving') : t('saveAvailability')}
          </button>
        </div>
      </div>
    </div>
  );
}
