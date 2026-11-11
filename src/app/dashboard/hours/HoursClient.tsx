'use client';

import React, { useState, useTransition } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatMinutesToTime } from '@/lib/time';
import { updateSalonHoursAction } from '../actions';
import { ScheduleConflictItem } from '@/lib/staff-config-service';

interface SalonHoursDayState {
  weekday: number;
  openMin: number;
  closeMin: number;
  isClosed: boolean;
}

interface HoursClientProps {
  salonId: string;
  initialHours: SalonHoursDayState[];
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

// 15-min options from 00:00 (0) to 24:00 (1440)
const TIME_GRID_OPTIONS: number[] = [];
for (let m = 0; m <= 1440; m += 15) {
  TIME_GRID_OPTIONS.push(m);
}

export default function HoursClient({
  salonId,
  initialHours,
}: HoursClientProps) {
  const t = useTranslations('dashboard');
  const tErrors = useTranslations('errors');

  // Initialize all 7 weekdays
  const [hoursState, setHoursState] = useState<SalonHoursDayState[]>(() => {
    const map = new Map<number, SalonHoursDayState>();
    for (const h of initialHours) {
      map.set(h.weekday, h);
    }
    return [0, 1, 2, 3, 4, 5, 6].map((w) => {
      const existing = map.get(w);
      return (
        existing || {
          weekday: w,
          openMin: 540,
          closeMin: 1260,
          isClosed: false,
        }
      );
    });
  });

  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDayChange = (
    weekday: number,
    field: 'openMin' | 'closeMin' | 'isClosed',
    value: number | boolean
  ) => {
    setSuccessMessage(false);
    setErrorMessage(null);
    setHoursState((prev) =>
      prev.map((day) => (day.weekday === weekday ? { ...day, [field]: value } : day))
    );
  };

  const handleCopyToAllDays = (sourceWeekday: number) => {
    const source = hoursState.find((h) => h.weekday === sourceWeekday);
    if (!source) return;

    setSuccessMessage(false);
    setErrorMessage(null);
    setHoursState((prev) =>
      prev.map((day) => ({
        ...day,
        openMin: source.openMin,
        closeMin: source.closeMin,
        isClosed: source.isClosed,
      }))
    );
  };

  const handleSave = () => {
    setErrorMessage(null);
    setSuccessMessage(false);
    setConflicts([]);

    // Validate closed / openMin < closeMin
    for (const h of hoursState) {
      if (!h.isClosed && h.closeMin <= h.openMin) {
        setErrorMessage(tErrors('INVALID_HOURS'));
        return;
      }
    }

    startTransition(async () => {
      const res = await updateSalonHoursAction({
        salonId,
        hours: hoursState,
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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-paper border-4 border-maroon p-5 shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
        <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
          {t('hoursTitle')}
        </h1>
        <p className="font-body text-sm text-steel mt-0.5">
          {t('hoursSubtitle')}
        </p>
      </div>

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
          {t('saveHours')} ✓
        </div>
      )}

      {/* 7 Weekday Schedule Rows */}
      <div className="bg-paper border-4 border-maroon p-4 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] rounded-xl space-y-4">
        <div className="space-y-3">
          {WEEKDAYS_DISPLAY_ORDER.map((weekday) => {
            const day = hoursState.find((h) => h.weekday === weekday)!;
            const weekdayName = t(WEEKDAY_KEYS[weekday]);

            return (
              <div
                key={weekday}
                className={clsx(
                  'p-3.5 sm:p-4 rounded-xl border-2 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3',
                  day.isClosed
                    ? 'bg-charcoal/5 border-charcoal/20 opacity-80'
                    : 'bg-chalk border-charcoal/15'
                )}
              >
                {/* Weekday Label & Closed Toggle */}
                <div className="flex items-center justify-between md:justify-start gap-4 min-w-[160px]">
                  <span className="font-sign text-lg font-bold text-ink">
                    {weekdayName}
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={day.isClosed}
                      onChange={(e) => handleDayChange(weekday, 'isClosed', e.target.checked)}
                      className="w-5 h-5 accent-maroon rounded"
                    />
                    <span
                      className={clsx(
                        'font-token text-xs px-2 py-0.5 rounded border select-none',
                        day.isClosed
                          ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      )}
                    >
                      {day.isClosed ? t('dayClosed') : t('dayOpen')}
                    </span>
                  </label>
                </div>

                {/* Time Selection Controls (15-min grid) */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="font-label text-xs uppercase font-bold text-steel">
                      {t('openTime')}
                    </label>
                    <select
                      disabled={day.isClosed}
                      value={day.openMin}
                      onChange={(e) => handleDayChange(weekday, 'openMin', Number(e.target.value))}
                      className="min-h-[48px] px-2.5 py-1.5 bg-paper border-2 border-charcoal/30 rounded-lg text-ink font-token text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-maroon"
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
                      disabled={day.isClosed}
                      value={day.closeMin}
                      onChange={(e) => handleDayChange(weekday, 'closeMin', Number(e.target.value))}
                      className="min-h-[48px] px-2.5 py-1.5 bg-paper border-2 border-charcoal/30 rounded-lg text-ink font-token text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-maroon"
                    >
                      {TIME_GRID_OPTIONS.filter((m) => m > 0).map((m) => (
                        <option key={m} value={m}>
                          {formatMinutesToTime(m)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Copy to all days utility */}
                  <button
                    type="button"
                    onClick={() => handleCopyToAllDays(weekday)}
                    title={t('copyToAllDays')}
                    className="min-h-[48px] px-3 py-2 bg-paper text-ink border border-charcoal/30 rounded-lg font-token text-xs hover:border-maroon hover:text-maroon select-none transition-colors"
                  >
                    {t('copyToAllDays')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Hours Action Button */}
        <div className="flex justify-end pt-4 border-t-2 border-charcoal/20">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="min-h-[48px] px-8 py-3 bg-maroon text-chalk rounded-xl font-label font-bold text-base border-2 border-marigold shadow-[4px_4px_0px_#2B2118] hover:bg-maroon/90 active:translate-x-0.5 active:translate-y-0.5 transition-all select-none disabled:opacity-50"
          >
            {isPending ? t('saving') : t('saveHours')}
          </button>
        </div>
      </div>
    </div>
  );
}
