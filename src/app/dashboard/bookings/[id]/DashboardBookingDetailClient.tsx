'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookingStatus, BookingSource } from '@prisma/client';
import { RegisterBookingItem } from '@/lib/dashboard-service';
import { updateBookingStatusAction } from '../../actions';
import { formatIstTime, formatIstDate, utcToIstDetails } from '@/lib/time';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { clsx } from 'clsx';

interface DashboardBookingDetailClientProps {
  booking: RegisterBookingItem & { salonSlug: string; salonName: string };
}

export default function DashboardBookingDetailClient({
  booking,
}: DashboardBookingDetailClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tToken = useTranslations('token');
  const tError = useTranslations('errors');

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cancellation modal state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const startsAtDate = new Date(booking.startsAt);
  const endsAtDate = new Date(booking.endsAt);
  const isPastStartsAt = Date.now() >= startsAtDate.getTime();
  const startsAtDateIst = utcToIstDetails(startsAtDate).dateIst;
  const todayDateIst = utcToIstDetails(new Date()).dateIst;
  const isBookingToday = startsAtDateIst === todayDateIst;

  const customerDisplayName =
    booking.customerName ||
    (booking.source === BookingSource.WALK_IN
      ? t('walkIn')
      : booking.customerPhone
      ? `${t('customer')} (${booking.customerPhone})`
      : t('customer'));

  const handleTransition = async (newStatus: BookingStatus, reason?: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await updateBookingStatusAction({
        bookingId: booking.id,
        expectedStatus: booking.status,
        newStatus,
        cancelReason: reason,
      });

      if (!result.ok) {
        const message =
          result.code && tError.has(result.code)
            ? tError(result.code as never)
            : result.error || tError('generic');
        setErrorMsg(message);
      } else {
        router.refresh();
      }
    });
  };

  const handleConfirmCancel = async () => {
    const trimmed = cancelReason.trim();
    if (trimmed.length < 3 || trimmed.length > 200) {
      setCancelError(t('cancelReasonPrompt'));
      return;
    }
    setIsCancelling(false);
    await handleTransition(BookingStatus.CANCELLED, trimmed);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="font-label font-bold text-sm text-steel hover:text-ink underline flex items-center gap-1 min-h-[44px]"
        >
          ← {t('backToRegister')}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-[44px] px-4 py-2 border-2 border-ink bg-paper font-label font-bold text-xs shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 rounded-lg"
        >
          🖨️ {t('printToken')}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm rounded-lg">
          {errorMsg}
        </div>
      )}

      {/* Main Authentic Slip Card */}
      <div className="bg-paper border-4 border-ink p-6 sm:p-8 shadow-[6px_6px_0px_#2B2118] space-y-6 relative rounded-2xl">
        {/* Top Barber Pole Ribbon */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#7A1F2B,#7A1F2B_10px,#FAF5E8_10px,#FAF5E8_20px,#0F5E57_20px,#0F5E57_30px,#FAF5E8_30px,#FAF5E8_40px)] rounded-t-xl" />

        {/* Header & Token Number */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-dashed border-ink/30 pb-4 pt-2">
          <div>
            <span className="font-label text-xs uppercase font-bold text-steel block">
              {tToken('tokenNo')}
            </span>
            <span className="font-token text-4xl sm:text-5xl font-bold text-maroon block leading-tight">
              #{booking.token}
            </span>
            <span className="font-body text-xs text-steel">
              {formatIstDate(startsAtDate, locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          <div className="text-left sm:text-right space-y-1">
            <div
              className={clsx(
                'font-token text-sm font-bold uppercase px-3.5 py-1.5 border-2 border-ink inline-block rounded',
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

            <div className="font-token text-xs text-steel block">
              {booking.source === BookingSource.WALK_IN ? t('sourceWalkIn') : t('sourceOnline')}
            </div>
          </div>
        </div>

        {/* Customer & Appointment Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b-2 border-dashed border-ink/30 pb-4 font-body text-sm">
          <div>
            <span className="font-label text-xs uppercase text-steel block">
              {t('customerNameField')}
            </span>
            <span className="font-sign text-xl font-bold text-ink">
              {customerDisplayName}
            </span>
          </div>

          <div>
            <span className="font-label text-xs uppercase text-steel block">
              {t('mobileNumberField')}
            </span>
            {booking.customerPhone ? (
              <a
                href={`tel:${booking.customerPhone}`}
                className="font-token text-base font-bold text-tealDeep hover:underline inline-flex items-center gap-1.5"
              >
                📞 {booking.customerPhone}
              </a>
            ) : (
              <span className="text-steel italic">
                {t('notProvided')}
              </span>
            )}
          </div>

          <div>
            <span className="font-label text-xs uppercase text-steel block">
              {t('selectBarberField')}
            </span>
            <span className="font-bold text-ink text-base">
              {booking.barberName}
            </span>
          </div>

          <div>
            <span className="font-label text-xs uppercase text-steel block">
              {t('timeSlotField')}
            </span>
            <span className="font-token text-base font-bold text-maroon">
              {formatIstTime(startsAtDate)} – {formatIstTime(endsAtDate)}
            </span>
          </div>
        </div>

        {/* Services & Total */}
        <div className="space-y-2 border-b-2 border-dashed border-ink/30 pb-4">
          <span className="font-label text-xs uppercase text-steel block mb-1">
            {t('servicesField')}
          </span>
          {booking.services.map((service) => (
            <div key={service.id} className="flex justify-between font-body text-sm">
              <span className="text-ink">
                {locale === 'hi' && service.nameHi ? service.nameHi : service.name}{' '}
                <span className="font-token text-xs text-steel">({service.durationMin}m)</span>
              </span>
              <span className="font-token font-bold text-ink">
                ₹{service.priceRupees}
              </span>
            </div>
          ))}

          <div className="flex justify-between items-baseline pt-2">
            <span className="font-label font-bold text-base text-ink">
              {t('totalAmountField')}
            </span>
            <span className="font-token text-3xl font-bold text-maroon">
              ₹{booking.totalRupees}
            </span>
          </div>
        </div>

        {/* Timeline & Audit Logs */}
        <div className="bg-tile/20 border-2 border-ink/30 p-4 rounded-xl space-y-2 font-body text-xs text-steel">
          <span className="font-label text-xs uppercase font-bold text-ink block mb-1">
            {t('activityTimeline')}
          </span>
          <div className="flex justify-between">
            <span>{t('scheduledStart')}</span>
            <span className="font-token text-ink font-bold">{formatIstTime(startsAtDate)}</span>
          </div>
          {booking.checkedInAt && (
            <div className="flex justify-between">
              <span>{t('checkIn')}</span>
              <span className="font-token text-tealDeep font-bold">
                {formatIstTime(new Date(booking.checkedInAt))}
              </span>
            </div>
          )}
          {booking.startedAt && (
            <div className="flex justify-between">
              <span>{t('start')}</span>
              <span className="font-token text-marigold font-bold">
                {formatIstTime(new Date(booking.startedAt))}
              </span>
            </div>
          )}
          {booking.completedAt && (
            <div className="flex justify-between">
              <span>{t('complete')}</span>
              <span className="font-token text-ink font-bold">
                {formatIstTime(new Date(booking.completedAt))}
              </span>
            </div>
          )}
          {booking.cancelledAt && (
            <div className="flex justify-between text-poleRed">
              <span>{t('cancelledStatus')}</span>
              <span className="font-token font-bold">
                {formatIstTime(new Date(booking.cancelledAt))}
              </span>
            </div>
          )}
          {booking.cancelReason && (
            <div className="p-2 bg-poleRed/10 border border-poleRed/30 text-poleRed rounded mt-1">
              <strong>{t('reasonLabel')}</strong> {booking.cancelReason}
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-2 flex flex-wrap gap-3 justify-end">
          {booking.status === BookingStatus.CONFIRMED && (
            <>
              {isBookingToday && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTransition(BookingStatus.CHECKED_IN)}
                    disabled={isPending}
                    className="min-h-[48px] px-5 py-2.5 bg-tile text-tealDeep font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                  >
                    {t('checkIn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTransition(BookingStatus.IN_PROGRESS)}
                    disabled={isPending}
                    className="min-h-[48px] px-6 py-2.5 bg-marigold text-ink font-label font-bold text-sm border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
                  >
                    {t('start')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleTransition(BookingStatus.NO_SHOW)}
                disabled={isPending || !isPastStartsAt}
                title={!isPastStartsAt ? t('noShowTooEarly') : undefined}
                className={clsx(
                  'min-h-[48px] px-4 py-2.5 font-label font-bold text-sm border-2 transition-all rounded-lg',
                  isPastStartsAt
                    ? 'bg-paper text-poleRed border-poleRed shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/10 active:translate-x-0.5 active:translate-y-0.5'
                    : 'bg-steel/15 text-steel border-steel/30 cursor-not-allowed opacity-60'
                )}
              >
                {t('noShow')}
              </button>
              <button
                type="button"
                onClick={() => setIsCancelling(true)}
                disabled={isPending}
                className="min-h-[48px] px-4 py-2.5 bg-paper text-steel font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:text-poleRed hover:border-poleRed rounded-lg"
              >
                {tCommon('cancel')}
              </button>
            </>
          )}

          {booking.status === BookingStatus.CHECKED_IN && (
            <>
              <button
                type="button"
                onClick={() => handleTransition(BookingStatus.IN_PROGRESS)}
                disabled={isPending}
                className="min-h-[48px] px-6 py-2.5 bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
              >
                {t('start')}
              </button>
              <button
                type="button"
                onClick={() => handleTransition(BookingStatus.NO_SHOW)}
                disabled={isPending || !isPastStartsAt}
                className={clsx(
                  'min-h-[48px] px-4 py-2.5 font-label font-bold text-sm border-2 transition-all rounded-lg',
                  isPastStartsAt
                    ? 'bg-paper text-poleRed border-poleRed shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/10 active:translate-x-0.5 active:translate-y-0.5'
                    : 'bg-steel/15 text-steel border-steel/30 cursor-not-allowed opacity-60'
                )}
              >
                {t('noShow')}
              </button>
              <button
                type="button"
                onClick={() => setIsCancelling(true)}
                disabled={isPending}
                className="min-h-[48px] px-4 py-2.5 bg-paper text-steel font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:text-poleRed hover:border-poleRed rounded-lg"
              >
                {tCommon('cancel')}
              </button>
            </>
          )}

          {booking.status === BookingStatus.IN_PROGRESS && (
            <button
              type="button"
              onClick={() => handleTransition(BookingStatus.COMPLETED)}
              disabled={isPending}
              className="min-h-[48px] px-7 py-3 bg-tile text-tealDeep font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-tile/80 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
            >
              ✓ {t('complete')}
            </button>
          )}
        </div>
      </div>

      {/* Cancellation Modal Dialog */}
      {isCancelling && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="bg-paper border-4 border-ink max-w-lg w-full p-6 shadow-[8px_8px_0px_#2B2118] space-y-4 rounded-2xl animate-in fade-in duration-200">
            <h3 className="font-sign text-2xl text-maroon font-bold">
              {t('cancelConfirm')} &bull; #{booking.token}
            </h3>
            <p className="font-body text-sm text-steel">
              {t('cancelConfirmPrompt', { name: customerDisplayName })}
            </p>

            {cancelError && (
              <div className="bg-poleRed/15 border-2 border-poleRed text-poleRed p-2.5 font-body text-xs rounded-lg">
                {cancelError}
              </div>
            )}

            <div>
              <label htmlFor="modalCancelReason" className="block font-label text-xs uppercase font-bold text-ink mb-1">
                {t('cancelReason')} *
              </label>
              <textarea
                id="modalCancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('cancelPlaceholder')}
                maxLength={200}
                rows={3}
                className="w-full bg-paper border-2 border-ink p-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-maroon rounded-lg"
              />
              <span className="font-token text-xs text-steel block text-right">
                {cancelReason.length}/200
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelling(false)}
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
