'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookingStatus, BookingSource } from '@prisma/client';
import { RegisterBookingItem, RegisterSummary } from '@/lib/dashboard-service';
import { updateBookingStatusAction } from './actions';
import { formatIstTime, formatIstDate } from '@/lib/time';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { clsx } from 'clsx';

interface RegisterClientProps {
  userRole: 'BARBER' | 'OWNER';
  salon: {
    id: string;
    name: string;
    nameHi: string | null;
    slug: string;
  };
  salons?: Array<{
    id: string;
    name: string;
    nameHi: string | null;
    slug: string;
  }>;
  barbers: Array<{
    id: string;
    displayName: string;
  }>;
  selectedDateIst: string;
  todayDateIst: string;
  selectedBarberId?: string;
  bookings: RegisterBookingItem[];
  summary: RegisterSummary;
  nextCustomer: RegisterBookingItem | null;
}

export default function RegisterClient({
  userRole,
  salon,
  salons = [],
  barbers,
  selectedDateIst,
  todayDateIst,
  selectedBarberId,
  bookings,
  summary,
  nextCustomer,
}: RegisterClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tToken = useTranslations('token');
  const tError = useTranslations('errors');

  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Modal state for cancellation
  const [cancellingBooking, setCancellingBooking] = useState<RegisterBookingItem | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isBookingToday = selectedDateIst === todayDateIst;

  const getCustomerDisplayName = (b: {
    customerName: string | null;
    source: BookingSource;
    customerPhone: string | null;
  }) => {
    if (b.customerName) return b.customerName;
    if (b.source === BookingSource.WALK_IN) return t('walkIn');
    return b.customerPhone ? `${t('customer')} (${b.customerPhone})` : t('customer');
  };

  // Set initial client updated time
  useEffect(() => {
    const d = new Date();
    setLastUpdated(
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    );
  }, []);

  // 30-second auto-refresh, paused when document is hidden
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        startTransition(() => {
          router.refresh();
          const d = new Date();
          setLastUpdated(
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
          );
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const handleManualRefresh = () => {
    startTransition(() => {
      router.refresh();
      const d = new Date();
      setLastUpdated(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    });
  };

  // Helper to change URL params
  const updateQuery = useCallback(
    (newParams: Record<string, string | undefined>) => {
      const p = new URLSearchParams(searchParams?.toString() || '');
      for (const [key, val] of Object.entries(newParams)) {
        if (val) {
          p.set(key, val);
        } else {
          p.delete(key);
        }
      }
      router.push(`/dashboard?${p.toString()}`);
    },
    [router, searchParams]
  );

  // Date navigation math (-7 to +14 days)
  const shiftDate = (daysDelta: number) => {
    const cur = new Date(selectedDateIst + 'T12:00:00Z');
    cur.setUTCDate(cur.getUTCDate() + daysDelta);
    const newDateStr = cur.toISOString().split('T')[0];
    updateQuery({ date: newDateStr });
  };

  // Status transition execution
  const handleTransition = async (
    booking: RegisterBookingItem,
    newStatus: BookingStatus,
    reason?: string
  ) => {
    setConflictError(null);
    startTransition(async () => {
      const result = await updateBookingStatusAction({
        bookingId: booking.id,
        expectedStatus: booking.status,
        newStatus,
        cancelReason: reason,
      });

      if (!result.ok) {
        const errorMsg =
          result.code && tError.has(result.code)
            ? tError(result.code as never)
            : result.error || tError('generic');
        setConflictError(errorMsg);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  };

  const handleOpenCancel = (booking: RegisterBookingItem) => {
    setCancellingBooking(booking);
    setCancelReasonText('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingBooking) return;
    const trimmed = cancelReasonText.trim();
    if (trimmed.length < 3 || trimmed.length > 200) {
      setCancelError(
        t('cancelReasonPrompt', {
          defaultMessage: 'Enter a valid reason for cancellation (3 to 200 characters).',
        })
      );
      return;
    }

    const bookingToCancel = cancellingBooking;
    setCancellingBooking(null);
    await handleTransition(bookingToCancel, BookingStatus.CANCELLED, trimmed);
  };

  const nowMs = Date.now();

  return (
    <div className="space-y-6">
      {/* Top Controls: Salon Switcher (if multi-salon owner), Add Walk-in & Refresh */}
      <div className="bg-paper border-4 border-ink p-4 sm:p-5 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {userRole === 'OWNER' && salons.length > 1 && (
            <div>
              <label htmlFor="salonSwitcher" className="block font-label text-xs uppercase font-bold text-steel mb-1">
                {t('salonSwitcher')}
              </label>
              <select
                id="salonSwitcher"
                value={salon.id}
                onChange={(e) => updateQuery({ salonId: e.target.value })}
                className="min-h-[44px] bg-paper border-2 border-ink px-3 py-2 font-sign text-base text-maroon font-bold shadow-[2px_2px_0px_#2B2118] focus:outline-none focus:ring-2 focus:ring-maroon rounded"
              >
                {salons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {locale === 'hi' && s.nameHi ? s.nameHi : s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className="font-sign text-xl text-maroon font-bold block">
              {locale === 'hi' && salon.nameHi ? salon.nameHi : salon.name}
            </span>
            <span className="font-body text-xs text-steel">
              {lastUpdated ? t('updatedAt', { time: lastUpdated }) : t('liveRegister')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/walk-in${salon.id ? `?salonId=${salon.id}` : ''}`}
            className="min-h-[48px] px-5 py-2.5 bg-marigold text-ink font-label font-bold text-sm border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-2 rounded-lg"
          >
            <span>+</span>
            <span>{t('addWalkIn')}</span>
          </Link>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isPending}
            className="min-h-[48px] px-4 py-2 bg-tile/40 text-tealDeep font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/70 active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center justify-center gap-1.5 rounded-lg"
          >
            <span className={clsx(isPending && 'animate-spin')}>🔄</span>
            <span className="hidden sm:inline">{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Conflict / Error Banner */}
      {conflictError && (
        <div
          role="alert"
          className="bg-poleRed/15 border-2 border-poleRed text-poleRed p-3 font-body text-sm flex items-center justify-between rounded-lg"
        >
          <span>{conflictError}</span>
          <button
            type="button"
            onClick={() => setConflictError(null)}
            className="font-bold underline text-xs ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Date Navigation Strip */}
      <div className="bg-paper border-4 border-ink p-3 sm:p-4 shadow-[4px_4px_0px_#2B2118] flex items-center justify-between gap-2 rounded-xl">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          className="min-h-[48px] px-4 py-2 border-2 border-ink bg-paper font-label font-bold text-sm shadow-[2px_2px_0px_#2B2118] hover:bg-tile/30 active:translate-x-0.5 active:translate-y-0.5 transition-all rounded-lg"
        >
          ← {t('prevDay')}
        </button>

        <div className="text-center">
          <div className="font-sign text-lg sm:text-2xl text-maroon font-bold">
            {formatIstDate(selectedDateIst, locale, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </div>
          {selectedDateIst === todayDateIst ? (
            <span className="font-token text-xs font-bold bg-marigold text-ink px-2 py-0.5 border border-ink uppercase rounded">
              {tCommon('today')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => updateQuery({ date: todayDateIst })}
              className="font-body text-xs text-tealDeep underline hover:text-ink block mt-0.5"
            >
              {t('jumpToToday')}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => shiftDate(1)}
          className="min-h-[48px] px-4 py-2 border-2 border-ink bg-paper font-label font-bold text-sm shadow-[2px_2px_0px_#2B2118] hover:bg-tile/30 active:translate-x-0.5 active:translate-y-0.5 transition-all rounded-lg"
        >
          {t('nextDay')} →
        </button>
      </div>

      {/* Barber Filter Chips (for Owners) */}
      {userRole === 'OWNER' && barbers.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => updateQuery({ barberId: undefined })}
            className={clsx(
              'min-h-[44px] px-4 py-2 font-label text-xs sm:text-sm font-bold border-2 border-ink transition-all whitespace-nowrap rounded-lg',
              !selectedBarberId
                ? 'bg-maroon text-chalk shadow-[3px_3px_0px_#2B2118]'
                : 'bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20'
            )}
          >
            {t('filterAll')}
          </button>
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => updateQuery({ barberId: b.id })}
              className={clsx(
                'min-h-[44px] px-4 py-2 font-label text-xs sm:text-sm font-bold border-2 border-ink transition-all whitespace-nowrap rounded-lg',
                selectedBarberId === b.id
                  ? 'bg-maroon text-chalk shadow-[3px_3px_0px_#2B2118]'
                  : 'bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20'
              )}
            >
              {b.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Summary Strip (6 counts) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('todayTokens')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-ink">
            {summary.todayTokens}
          </span>
        </div>

        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('waiting')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-tealDeep">
            {summary.waiting}
          </span>
        </div>

        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('inChair')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-marigold">
            {summary.inChair}
          </span>
        </div>

        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('done')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-ink">
            {summary.done}
          </span>
        </div>

        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('cancelledNoShow')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-poleRed">
            {summary.cancelledNoShow}
          </span>
        </div>

        <div className="bg-paper border-3 border-ink p-3 shadow-[3px_3px_0px_#2B2118] rounded-xl text-center col-span-2 sm:col-span-1 lg:col-span-1">
          <span className="font-label text-xs text-steel uppercase font-bold block">
            {t('earnings')}
          </span>
          <span className="font-token text-2xl sm:text-3xl font-bold text-maroon">
            ₹{summary.earningsRupees}
          </span>
        </div>
      </div>

      {/* Sticky / Prominent Next Customer Strip */}
      {nextCustomer && (
        <div className="bg-tealDeep text-chalk border-4 border-ink p-4 sm:p-5 shadow-[5px_5px_0px_#2B2118] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-marigold text-ink font-token font-bold text-xs px-2 py-0.5 border border-ink rounded">
                {t('nextCustomer')}
              </span>
              <span className="font-token text-xl font-bold text-marigold">
                #{nextCustomer.token}
              </span>
              <span className="font-body text-xs text-chalk/80">
                ({formatIstTime(new Date(nextCustomer.startsAt))})
              </span>
            </div>
            <div className="font-sign text-xl text-chalk font-bold">
              {getCustomerDisplayName(nextCustomer)}{' '}
              {nextCustomer.customerPhone && (
                <span className="font-token text-sm text-chalk/70 font-normal">
                  ({nextCustomer.customerPhone})
                </span>
              )}
            </div>
            <div className="font-body text-xs text-chalk/80">
              {nextCustomer.barberName} &bull;{' '}
              {nextCustomer.services.map((s) => s.name).join(', ')} (₹
              {nextCustomer.totalRupees})
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {nextCustomer.status === BookingStatus.CONFIRMED && (
              <button
                type="button"
                onClick={() => handleTransition(nextCustomer, BookingStatus.CHECKED_IN)}
                disabled={isPending}
                className="min-h-[48px] flex-1 sm:flex-none px-5 py-2.5 bg-tile text-tealDeep font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
              >
                {t('checkIn')}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleTransition(nextCustomer, BookingStatus.IN_PROGRESS)}
              disabled={isPending}
              className="min-h-[48px] flex-1 sm:flex-none px-6 py-2.5 bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
            >
              {t('start')} →
            </button>
          </div>
        </div>
      )}

      {/* Register Diary List */}
      <div className="bg-paper border-4 border-ink shadow-[5px_5px_0px_#2B2118] rounded-xl overflow-hidden">
        <div className="bg-tile/30 border-b-2 border-ink p-4 flex items-center justify-between">
          <h2 className="font-sign text-xl sm:text-2xl text-maroon font-bold">
            {t('registerDiary')}
          </h2>
          <span className="font-token text-xs font-bold text-steel">
            {t('entriesCount', { count: bookings.length })}
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-steel font-body">
            <div className="font-token text-4xl mb-2">📖</div>
            <p className="text-base">{t('noBookingsToday')}</p>
          </div>
        ) : (
          <div className="divide-y-2 divide-ink/20">
            {bookings.map((booking) => {
              const startsAtDate = new Date(booking.startsAt);
              const endsAtDate = new Date(booking.endsAt);
              const isPastStartsAt = nowMs >= startsAtDate.getTime();

              return (
                <div
                  key={booking.id}
                  className="p-4 sm:p-5 hover:bg-tile/10 transition-colors flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                >
                  {/* Left: Token, Time, Name, Barber, Services */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="text-center min-w-[56px]">
                      <span className="font-label text-[10px] uppercase font-bold text-steel block">
                        {tToken('tokenNo')}
                      </span>
                      <span className="font-token text-3xl font-bold text-maroon block leading-tight">
                        #{booking.token}
                      </span>
                      <span
                        className={clsx(
                          'font-label text-[10px] uppercase px-1.5 py-0.2 border border-ink font-bold inline-block mt-0.5 rounded',
                          booking.source === BookingSource.WALK_IN
                            ? 'bg-marigold text-ink'
                            : 'bg-tile text-tealDeep'
                        )}
                      >
                        {booking.source === BookingSource.WALK_IN ? t('sourceWalkIn') : t('sourceOnline')}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-token font-bold text-base text-ink">
                          {formatIstTime(startsAtDate)} – {formatIstTime(endsAtDate)}
                        </span>
                        <span className="text-steel">•</span>
                        <Link
                          href={`/dashboard/bookings/${booking.id}`}
                          className="font-sign text-lg font-bold text-maroon hover:underline"
                        >
                          {getCustomerDisplayName(booking)}
                        </Link>
                        {booking.customerPhone && (
                          <a
                            href={`tel:${booking.customerPhone}`}
                            className="font-token text-xs text-tealDeep hover:underline bg-tile/40 px-2 py-0.5 border border-ink/30 rounded"
                          >
                            📞 {booking.customerPhone}
                          </a>
                        )}
                      </div>

                      <div className="font-body text-xs text-steel">
                        <strong className="text-ink">{booking.barberName}</strong> &bull;{' '}
                        {booking.services
                          .map((s) => (locale === 'hi' && s.nameHi ? s.nameHi : s.name))
                          .join(', ')}
                      </div>

                      <div className="font-token text-xs font-bold text-ink">
                        ₹{booking.totalRupees}
                      </div>

                      {booking.cancelReason && (
                        <div className="font-body text-xs text-poleRed bg-poleRed/10 p-1.5 border border-poleRed/30 rounded">
                          {t('reasonLabel')} {booking.cancelReason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Stamp & Action Buttons (>=48px tap targets) */}
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                    {/* Status Badge */}
                    <div
                      className={clsx(
                        'font-token text-xs font-bold uppercase px-3 py-1.5 border-2 border-ink self-center rounded',
                        booking.status === BookingStatus.CONFIRMED && 'bg-tile text-tealDeep',
                        booking.status === BookingStatus.CHECKED_IN && 'bg-marigold text-ink',
                        booking.status === BookingStatus.IN_PROGRESS && 'bg-maroon text-chalk animate-pulse',
                        booking.status === BookingStatus.COMPLETED && 'bg-paper text-steel border-dashed',
                        booking.status === BookingStatus.CANCELLED && 'bg-poleRed/20 text-poleRed border-poleRed',
                        booking.status === BookingStatus.REJECTED && 'bg-poleRed/20 text-poleRed border-poleRed',
                        booking.status === BookingStatus.NO_SHOW && 'bg-poleRed text-chalk',
                        booking.status === BookingStatus.PENDING && 'bg-marigold/30 text-ink'
                      )}
                    >
                      {tToken(
                        booking.status === 'CONFIRMED'
                          ? 'confirmed'
                          : booking.status === 'CHECKED_IN'
                          ? 'checkedIn'
                          : booking.status === 'IN_PROGRESS'
                          ? 'inProgress'
                          : booking.status === 'COMPLETED'
                          ? 'completed'
                          : booking.status === 'CANCELLED'
                          ? 'cancelled'
                          : booking.status === 'REJECTED'
                          ? 'rejected'
                          : booking.status === 'NO_SHOW'
                          ? 'noShow'
                          : 'pending'
                      )}
                    </div>

                    {/* Action buttons depending on status */}
                    {booking.status === BookingStatus.PENDING && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTransition(booking, BookingStatus.CONFIRMED)}
                          disabled={isPending}
                          className="min-h-[48px] px-3.5 py-2 bg-tile text-tealDeep font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                        >
                          {t('accept')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransition(booking, BookingStatus.REJECTED)}
                          disabled={isPending}
                          className="min-h-[48px] px-3 py-2 bg-paper text-poleRed font-label font-bold text-xs border-2 border-poleRed shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/10 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                        >
                          {t('rejectAction')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCancel(booking)}
                          disabled={isPending}
                          className="min-h-[48px] px-3 py-2 bg-paper text-steel font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:text-poleRed hover:border-poleRed rounded-lg"
                        >
                          {tCommon('cancel')}
                        </button>
                      </>
                    )}

                    {booking.status === BookingStatus.CONFIRMED && (
                      <>
                        {isBookingToday && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleTransition(booking, BookingStatus.CHECKED_IN)}
                              disabled={isPending}
                              className="min-h-[48px] px-3.5 py-2 bg-tile text-tealDeep font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                            >
                              {t('checkIn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTransition(booking, BookingStatus.IN_PROGRESS)}
                              disabled={isPending}
                              className="min-h-[48px] px-3.5 py-2 bg-marigold text-ink font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                            >
                              {t('start')}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTransition(booking, BookingStatus.NO_SHOW)}
                          disabled={isPending || !isPastStartsAt}
                          title={!isPastStartsAt ? t('noShowTooEarly') : undefined}
                          className={clsx(
                            'min-h-[48px] px-3 py-2 font-label font-bold text-xs border-2 transition-all rounded-lg',
                            isPastStartsAt
                              ? 'bg-paper text-poleRed border-poleRed shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/10 active:translate-x-0.5 active:translate-y-0.5'
                              : 'bg-steel/15 text-steel border-steel/30 cursor-not-allowed opacity-60'
                          )}
                        >
                          {t('noShow')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCancel(booking)}
                          disabled={isPending}
                          className="min-h-[48px] px-3 py-2 bg-paper text-steel font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:text-poleRed hover:border-poleRed rounded-lg"
                        >
                          {tCommon('cancel')}
                        </button>
                      </>
                    )}

                    {booking.status === BookingStatus.CHECKED_IN && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTransition(booking, BookingStatus.IN_PROGRESS)}
                          disabled={isPending}
                          className="min-h-[48px] px-4 py-2 bg-marigold text-ink font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                        >
                          {t('start')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransition(booking, BookingStatus.NO_SHOW)}
                          disabled={isPending || !isPastStartsAt}
                          className={clsx(
                            'min-h-[48px] px-3 py-2 font-label font-bold text-xs border-2 transition-all rounded-lg',
                            isPastStartsAt
                              ? 'bg-paper text-poleRed border-poleRed shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/10 active:translate-x-0.5 active:translate-y-0.5'
                              : 'bg-steel/15 text-steel border-steel/30 cursor-not-allowed opacity-60'
                          )}
                        >
                          {t('noShow')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCancel(booking)}
                          disabled={isPending}
                          className="min-h-[48px] px-3 py-2 bg-paper text-steel font-label font-bold text-xs border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:text-poleRed hover:border-poleRed rounded-lg"
                        >
                          {tCommon('cancel')}
                        </button>
                      </>
                    )}

                    {booking.status === BookingStatus.IN_PROGRESS && (
                      <button
                        type="button"
                        onClick={() => handleTransition(booking, BookingStatus.COMPLETED)}
                        disabled={isPending}
                        className="min-h-[48px] px-5 py-2.5 bg-tile text-tealDeep font-label font-bold text-sm border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                      >
                        ✓ {t('complete')}
                      </button>
                    )}

                    <Link
                      href={`/dashboard/bookings/${booking.id}`}
                      className="min-h-[48px] px-3 py-2 bg-paper text-ink font-label text-xs border-2 border-ink/40 hover:border-ink hover:bg-tile/20 flex items-center justify-center rounded-lg"
                    >
                      →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancellation Modal Dialog */}
      {cancellingBooking && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-paper border-4 border-ink max-w-lg w-full p-6 shadow-[8px_8px_0px_#2B2118] space-y-4 rounded-2xl animate-in fade-in duration-200">
            <h3 className="font-sign text-2xl text-maroon font-bold">
              {t('cancelConfirm')} &bull; #{cancellingBooking.token}
            </h3>
            <p className="font-body text-sm text-steel">
              {t('cancelConfirmPrompt', { name: getCustomerDisplayName(cancellingBooking) })}
            </p>

            {cancelError && (
              <div className="bg-poleRed/15 border-2 border-poleRed text-poleRed p-2.5 font-body text-xs rounded-lg">
                {cancelError}
              </div>
            )}

            <div>
              <label htmlFor="cancelReasonInput" className="block font-label text-xs uppercase font-bold text-ink mb-1">
                {t('cancelReason')} *
              </label>
              <textarea
                id="cancelReasonInput"
                value={cancelReasonText}
                onChange={(e) => setCancelReasonText(e.target.value)}
                placeholder={t('cancelPlaceholder')}
                maxLength={200}
                rows={3}
                className="w-full bg-paper border-2 border-ink p-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-maroon rounded-lg"
              />
              <span className="font-token text-xs text-steel block text-right">
                {cancelReasonText.length}/200
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="min-h-[44px] px-5 py-2 font-label font-bold text-sm border-2 border-ink bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 rounded-lg"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isPending}
                className="min-h-[44px] px-6 py-2 bg-poleRed text-chalk font-label font-bold text-sm border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-poleRed/90 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
              >
                {t('cancelConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
