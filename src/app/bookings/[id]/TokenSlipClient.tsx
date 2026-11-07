'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { BookingStatus } from '@prisma/client';
import TokenSlip from '@/components/ui/TokenSlip';
import RegisterDiarySlotPicker, { DiaryDateTab } from '@/components/ui/RegisterDiarySlotPicker';
import { cancelBookingAction, rescheduleBookingAction } from '../actions';
import { getSlotsAction, SerializedSlot } from '@/app/book/actions';
import { useLocale, useTranslations } from 'next-intl';
import { getLocalizedName } from '@/i18n/config';

interface TokenSlipClientProps {
  booking: {
    id: string;
    token: number;
    tokenDate: Date | string;
    status: string;
    startsAt: Date | string;
    endsAt: Date | string;
    totalRupees: number;
    cancelReason?: string | null;
    cancelledAt?: Date | string | null;
    salon: {
      id: string;
      slug: string;
      name: string;
      nameHi?: string | null;
      phone?: string | null;
      addressLine: string;
      area: string;
      city: string;
      pincode: string;
    };
    barber: {
      id: string;
      displayName: string;
    };
    customer?: {
      name?: string | null;
    } | null;
    items: Array<{
      id: string;
      serviceId: string;
      priceRupees: number;
      durationMin: number;
      service: {
        name: string;
        nameHi?: string | null;
      };
    }>;
  };
  formattedDate: string;
  formattedTime: string;
  canCancel: boolean;
  canReschedule: boolean;
  cutoffPassed: boolean;
  dateTabs: DiaryDateTab[];
}

export default function TokenSlipClient({
  booking,
  formattedDate,
  formattedTime,
  canCancel,
  canReschedule,
  cutoffPassed,
  dateTabs,
}: TokenSlipClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('token');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [isPending, startTransition] = useTransition();

  // Cancel Modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Reschedule Modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedDateIst, setSelectedDateIst] = useState(dateTabs[0]?.dateIst || '');
  const [slots, setSlots] = useState<SerializedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedNewSlotStartsAt, setSelectedNewSlotStartsAt] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Screenshot / Download PNG handler
  const handleSavePng = async () => {
    try {
      const { toPng } = await import('html-to-image');
      const node = document.getElementById('token-slip-card');
      if (!node) return;

      const dataUrl = await toPng(node, { quality: 0.95 });
      const link = document.createElement('a');
      link.download = `token-slip-${booking.token}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      window.print();
    }
  };

  // Fetch slots for reschedule
  const loadSlotsForDate = (dateIst: string) => {
    setSelectedDateIst(dateIst);
    setSelectedNewSlotStartsAt(null);
    setLoadingSlots(true);
    setRescheduleError(null);

    const serviceIds = booking.items.map((i) => i.serviceId);
    getSlotsAction({
      barberId: booking.barber.id,
      dateIst,
      serviceIds,
    })
      .then((res) => {
        setLoadingSlots(false);
        if (res.ok && res.slots) {
          setSlots(res.slots);
        } else {
          setRescheduleError(res.message || tErrors('generic'));
          setSlots([]);
        }
      })
      .catch(() => {
        setLoadingSlots(false);
        setRescheduleError(tErrors('generic'));
        setSlots([]);
      });
  };

  // Trigger loading slots when reschedule modal opens
  const openRescheduleModal = () => {
    setShowRescheduleModal(true);
    loadSlotsForDate(selectedDateIst);
  };

  // Perform Cancellation
  const handleConfirmCancel = () => {
    setCancelError(null);
    startTransition(async () => {
      const result = await cancelBookingAction({
        bookingId: booking.id,
        reason: cancelReason.trim() || undefined,
      });

      if (result.ok) {
        setShowCancelModal(false);
        router.refresh();
      } else {
        const errKey = result.message || 'generic';
        const translated = (tErrors as unknown as Record<string, string>)[errKey] || result.message || tErrors('generic');
        setCancelError(translated);
      }
    });
  };

  // Perform Reschedule
  const handleConfirmReschedule = () => {
    if (!selectedNewSlotStartsAt) {
      setRescheduleError(t('selectNewSlotError'));
      return;
    }

    setRescheduleError(null);
    startTransition(async () => {
      const result = await rescheduleBookingAction({
        bookingId: booking.id,
        newStartsAtIso: selectedNewSlotStartsAt,
      });

      if (result.ok && result.newBookingId) {
        setShowRescheduleModal(false);
        router.push(`/bookings/${result.newBookingId}`);
      } else {
        const errKey = result.message || 'generic';
        const translated = (tErrors as unknown as Record<string, string>)[errKey] || result.message || tErrors('generic');
        setRescheduleError(translated);
      }
    });
  };

  const servicesList = booking.items.map((i) => ({
    name: i.service.name,
    nameHi: i.service.nameHi,
    priceRupees: i.priceRupees,
    durationMin: i.durationMin,
  }));

  const fullAddress = `${booking.salon.addressLine}, ${booking.salon.area}, ${booking.salon.city}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Back to My Bookings link */}
      <div>
        <Link
          href="/bookings"
          className="font-body text-xs sm:text-sm text-steel hover:text-ink underline flex items-center gap-1"
        >
          ← {t('backToBookings')}
        </Link>
      </div>

      {/* Main Token Slip */}
      <TokenSlip
        tokenNumber={booking.token}
        salonName={booking.salon.name}
        salonNameHi={booking.salon.nameHi || undefined}
        barberName={booking.barber.displayName}
        services={servicesList}
        date={formattedDate}
        time={formattedTime}
        status={booking.status as BookingStatus}
        totalPriceRupees={booking.totalRupees}
        customerName={booking.customer?.name || undefined}
        salonAddress={fullAddress}
        onSave={handleSavePng}
      />

      {/* Cancellation or Reschedule Controls */}
      <div className="bg-paper border-3 border-ink p-4 shadow-[4px_4px_0px_#2B2118] space-y-4 rounded-xl">
        {booking.status === 'CANCELLED' ? (
          <div className="text-center font-body text-sm text-poleRed">
            <p className="font-bold">{t('cancelledBadge')}</p>
            {booking.cancelReason && (
              <p className="text-xs text-steel mt-0.5">
                {t('reasonPrefix')} {booking.cancelReason}
              </p>
            )}
          </div>
        ) : cutoffPassed ? (
          <div className="bg-tile/30 border border-tealDeep/40 p-3 text-xs font-body text-tealDeep rounded-lg">
            ⚠️ <strong>{t('cancellationCutoffLabel')}</strong>{' '}
            {t('cutoffPassedNotice', {
              minutes: 60,
              phone: booking.salon.phone || t('salonDesk'),
            })}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            {canReschedule && (
              <button
                type="button"
                onClick={openRescheduleModal}
                className="flex-1 min-h-[44px] bg-paper border-2 border-ink text-ink font-label font-bold text-sm px-4 py-2.5 shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 transition-all text-center rounded-lg"
              >
                {t('reschedule')}
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="flex-1 min-h-[44px] bg-paper border-2 border-poleRed text-poleRed font-label font-bold text-sm px-4 py-2.5 shadow-[2px_2px_0px_#C8262F] hover:bg-poleRed/10 transition-all text-center rounded-lg"
              >
                {t('cancelBooking')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4 backdrop-blur-sm"
        >
          <div className="bg-paper border-4 border-maroon p-6 max-w-md w-full shadow-[6px_6px_0px_#2B2118] space-y-4 rounded-2xl">
            <h3 className="font-sign text-2xl text-maroon">
              {t('cancelBooking')}
            </h3>
            <p className="font-body text-sm text-ink/80">
              {t('cancelConfirm')}
            </p>

            <div>
              <label htmlFor="cancel-reason" className="block font-label text-xs uppercase text-steel mb-1">
                {t('cancelReasonLabel')}
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('cancelReasonPlaceholder')}
                className="w-full border-2 border-ink p-2 text-sm font-body bg-paper focus:border-marigold focus:outline-none rounded-lg"
                rows={2}
              />
            </div>

            {cancelError && (
              <div className="p-2 bg-poleRed/10 border border-poleRed text-poleRed text-xs font-body rounded">
                {cancelError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 min-h-[44px] border-2 border-ink bg-paper font-label font-bold text-sm text-ink hover:bg-tile/20 rounded-lg"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmCancel}
                className="flex-1 min-h-[44px] border-2 border-poleRed bg-poleRed text-chalk font-label font-bold text-sm hover:bg-poleRed/90 shadow-[2px_2px_0px_#2B2118] disabled:opacity-60 rounded-lg"
              >
                {isPending ? tCommon('loading') : t('cancelBooking')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Slot Picker Modal */}
      {showRescheduleModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-ink/75 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto"
        >
          <div className="bg-paper border-4 border-maroon p-6 max-w-xl w-full shadow-[6px_6px_0px_#2B2118] space-y-4 my-8 rounded-2xl">
            <div className="flex items-center justify-between border-b-2 border-ink/20 pb-3">
              <div>
                <h3 className="font-sign text-2xl text-maroon">
                  {t('reschedule')}
                </h3>
                <p className="font-body text-xs text-steel">
                  {booking.barber.displayName} &bull; {getLocalizedName(booking.salon, locale)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="font-token text-lg text-steel hover:text-ink px-2 py-1"
              >
                ✕
              </button>
            </div>

            {rescheduleError && (
              <div className="p-3 bg-poleRed/10 border-2 border-poleRed text-poleRed text-xs font-body rounded-lg">
                {rescheduleError}
              </div>
            )}

            <RegisterDiarySlotPicker
              dates={dateTabs}
              selectedDateIst={selectedDateIst}
              onSelectDateIst={(dateIst) => loadSlotsForDate(dateIst)}
              slots={slots}
              isLoading={loadingSlots}
              selectedSlot={selectedNewSlotStartsAt || undefined}
              onSelectSlot={(_, startsAt) => setSelectedNewSlotStartsAt(startsAt || null)}
            />

            <div className="flex gap-3 pt-3 border-t-2 border-ink/20">
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="flex-1 min-h-[44px] border-2 border-ink bg-paper font-label font-bold text-sm text-ink hover:bg-tile/20 rounded-lg"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                disabled={isPending || !selectedNewSlotStartsAt}
                onClick={handleConfirmReschedule}
                className={clsx(
                  'flex-1 min-h-[44px] border-2 border-ink font-label font-bold text-sm shadow-[2px_2px_0px_#2B2118] transition-all rounded-lg',
                  selectedNewSlotStartsAt
                    ? 'bg-marigold text-ink hover:bg-saffron'
                    : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
                )}
              >
                {isPending ? tCommon('loading') : t('confirmReschedule')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
