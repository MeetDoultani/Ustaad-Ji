'use client';

import React, { useState, useTransition } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { utcToIstDetails, istToUtcDate, formatMinutesToTime } from '@/lib/time';
import { createBarberTimeOffAction, deleteBarberTimeOffAction } from '../actions';
import { ScheduleConflictItem } from '@/lib/staff-config-service';

interface TimeOffRecordItem {
  id: string;
  barberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

interface TimeOffClientProps {
  userRole: 'OWNER' | 'BARBER';
  salonId: string;
  barbers: Array<{ id: string; displayName: string; isActive: boolean }>;
  selectedBarberId: string;
  initialTimeOffList: TimeOffRecordItem[];
}

export default function TimeOffClient({
  userRole,
  salonId,
  barbers,
  selectedBarberId,
  initialTimeOffList,
}: TimeOffClientProps) {
  const router = useRouter();
  const t = useTranslations('dashboard');
  const tErrors = useTranslations('errors');

  const [timeOffList, setTimeOffList] = useState<TimeOffRecordItem[]>(initialTimeOffList);
  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form inputs (default: tomorrow 09:00 to 18:00 IST)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { dateIst: defaultDateIst } = utcToIstDetails(tomorrow);

  const [startDate, setStartDate] = useState(defaultDateIst);
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(defaultDateIst);
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');

  const handleBarberSwitch = (barberId: string) => {
    router.push(`/dashboard/time-off?salonId=${encodeURIComponent(salonId)}&barberId=${encodeURIComponent(barberId)}`);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(false);
    setConflicts([]);

    // Parse start and end minutes
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    const endMinutes = (endH || 0) * 60 + (endM || 0);

    let startsAtUtc: Date;
    let endsAtUtc: Date;

    try {
      startsAtUtc = istToUtcDate(startDate, startMinutes);
      endsAtUtc = istToUtcDate(endDate, endMinutes);
    } catch {
      setErrorMessage(tErrors('INVALID_TIMEOFF_RANGE'));
      return;
    }

    if (endsAtUtc <= startsAtUtc) {
      setErrorMessage(tErrors('INVALID_TIMEOFF_RANGE'));
      return;
    }

    if (endsAtUtc.getTime() <= Date.now()) {
      setErrorMessage(tErrors('TIMEOFF_IN_PAST'));
      return;
    }

    startTransition(async () => {
      const res = await createBarberTimeOffAction({
        barberId: selectedBarberId,
        startsAt: startsAtUtc.toISOString(),
        endsAt: endsAtUtc.toISOString(),
        reason: reason.trim() ? reason.trim() : null,
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
      setReason('');
      if (res.data?.id) {
        const newRecord: TimeOffRecordItem = {
          id: res.data.id,
          barberId: selectedBarberId,
          startsAt: startsAtUtc.toISOString(),
          endsAt: endsAtUtc.toISOString(),
          reason: reason.trim() ? reason.trim() : null,
        };
        setTimeOffList((prev) => [...prev, newRecord].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      }

      if (res.data?.conflicts && res.data.conflicts.length > 0) {
        setConflicts(res.data.conflicts);
      }
    });
  };

  const handleDelete = (timeOffId: string) => {
    setErrorMessage(null);
    setSuccessMessage(false);

    startTransition(async () => {
      const res = await deleteBarberTimeOffAction({
        barberId: selectedBarberId,
        timeOffId,
      });

      if (!res.ok) {
        const errKey =
          res.code && tErrors.has(res.code)
            ? tErrors(res.code as never)
            : res.error || tErrors('generic');
        setErrorMessage(errKey);
        return;
      }

      setTimeOffList((prev) => prev.filter((item) => item.id !== timeOffId));
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-paper border-4 border-maroon p-5 shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
        <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
          {t('timeOffTitle')}
        </h1>
        <p className="font-body text-sm text-steel mt-0.5">
          {t('timeOffSubtitle')}
        </p>

        {/* Barber Filter Chips for Owner */}
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
            {t('timeOffConflictDesc', { count: conflicts.length })}
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
          {t('addTimeOff')} ✓
        </div>
      )}

      {/* Add Time Off Form */}
      <form
        onSubmit={handleCreate}
        className="bg-paper border-4 border-maroon p-5 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] rounded-xl space-y-4"
      >
        <h2 className="font-sign text-xl text-maroon font-bold border-b border-charcoal/15 pb-2">
          {t('addTimeOff')}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Start Date & Time */}
          <div className="space-y-2">
            <label className="block font-label text-xs uppercase font-bold text-steel">
              {t('startsAt')}
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-sm flex-1 focus:outline-none focus:border-maroon"
              />
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-sm w-32 focus:outline-none focus:border-maroon"
              />
            </div>
          </div>

          {/* End Date & Time */}
          <div className="space-y-2">
            <label className="block font-label text-xs uppercase font-bold text-steel">
              {t('endsAt')}
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-sm flex-1 focus:outline-none focus:border-maroon"
              />
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-token text-sm w-32 focus:outline-none focus:border-maroon"
              />
            </div>
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block font-label text-xs uppercase font-bold text-steel mb-1">
            {t('reason')}
          </label>
          <input
            type="text"
            maxLength={100}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full min-h-[48px] px-3 bg-chalk border-2 border-charcoal/30 rounded-lg text-ink font-body text-sm focus:outline-none focus:border-maroon"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="min-h-[48px] px-6 py-2.5 bg-maroon text-chalk rounded-lg font-label font-bold text-sm border-2 border-marigold shadow-[3px_3px_0px_#2B2118] hover:bg-maroon/90 active:translate-x-0.5 active:translate-y-0.5 transition-all select-none disabled:opacity-50"
          >
            {isPending ? t('saving') : t('addTimeOff')}
          </button>
        </div>
      </form>

      {/* List of Scheduled Time Off */}
      <div className="bg-paper border-4 border-maroon p-5 sm:p-6 shadow-[5px_5px_0px_#7A1F2B] rounded-xl space-y-4">
        <h2 className="font-sign text-xl text-maroon font-bold border-b border-charcoal/15 pb-2">
          {t('upcomingTimeOff')}
        </h2>

        {timeOffList.length === 0 ? (
          <div className="py-6 text-center text-sm font-body text-steel italic">
            {t('noTimeOff')}
          </div>
        ) : (
          <div className="space-y-3">
            {timeOffList.map((item) => {
              const startDetails = utcToIstDetails(new Date(item.startsAt));
              const endDetails = utcToIstDetails(new Date(item.endsAt));

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-chalk border-2 border-charcoal/15"
                >
                  <div className="space-y-1">
                    <div className="font-token text-sm text-ink font-bold">
                      {startDetails.dateIst} • {formatMinutesToTime(startDetails.minutesFromMidnight)} → {endDetails.dateIst} • {formatMinutesToTime(endDetails.minutesFromMidnight)}
                    </div>
                    {item.reason && (
                      <div className="font-body text-xs text-steel">
                        {item.reason}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDelete(item.id)}
                    aria-label={t('deleteTimeOff')}
                    className="min-h-[48px] px-4 py-2 bg-rose-50 text-rose-800 border border-rose-300 rounded-lg font-token text-xs font-bold hover:bg-rose-100 select-none self-end sm:self-auto transition-colors disabled:opacity-40"
                  >
                    {t('deleteTimeOff')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
