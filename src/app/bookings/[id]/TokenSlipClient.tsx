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
    } catch (err) {
      console.error('Failed to download slip image:', err);
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
          setRescheduleError(res.message || 'Slots load nahi ho sake.');
          setSlots([]);
        }
      })
      .catch(() => {
        setLoadingSlots(false);
        setRescheduleError('Network error while loading slots.');
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
        setCancelError(result.message || 'Cancel karne mein samasya aayi.');
      }
    });
  };

  // Perform Reschedule
  const handleConfirmReschedule = () => {
    if (!selectedNewSlotStartsAt) {
      setRescheduleError('Kripya naya slot chuniye.');
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
        setRescheduleError(result.message || 'Reschedule fail ho gaya.');
      }
    });
  };

  const servicesList = booking.items.map((i) => ({
    name: i.service.name,
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
          ← Mere Sabhi Tokens / Back to My Bookings
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
      <div className="bg-paper border-3 border-ink p-4 shadow-[4px_4px_0px_#2B2118] space-y-4">
        {booking.status === 'CANCELLED' ? (
          <div className="text-center font-body text-sm text-poleRed">
            <p className="font-bold">Yeh booking cancel kar di gayi hai.</p>
            {booking.cancelReason && (
              <p className="text-xs text-steel mt-0.5">
                Karan: {booking.cancelReason}
              </p>
            )}
          </div>
        ) : cutoffPassed ? (
          <div className="bg-tile/30 border border-tealDeep/40 p-3 text-xs font-body text-tealDeep">
            ⚠️ <strong>Cancellation Cutoff:</strong> Appointment shuru hone mein 1 ghante se kam bacha hai. Kisi bhi badlaav ke liye kripya salon se seedhe sampark karein: <strong>{booking.salon.phone || 'Salon desk'}</strong>.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            {canReschedule && (
              <button
                type="button"
                onClick={openRescheduleModal}
                className="flex-1 min-h-[44px] bg-paper border-2 border-ink text-ink font-label font-bold text-sm px-4 py-2.5 shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 transition-all text-center"
              >
                Reschedule / समय बदलें
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="flex-1 min-h-[44px] bg-paper border-2 border-poleRed text-poleRed font-label font-bold text-sm px-4 py-2.5 shadow-[2px_2px_0px_#7A1F2B] hover:bg-poleRed/10 transition-all text-center"
              >
                Cancel Booking / रद्द करें
              </button>
            )}
          </div>
        )}
      </div>

      {/* CANCEL MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4">
          <div className="bg-paper border-4 border-maroon p-6 max-w-md w-full shadow-[6px_6px_0px_#2B2118] space-y-4">
            <h3 className="font-sign text-xl text-maroon">
              Cancel Booking / बुकिंग रद्द करें?
            </h3>
            <p className="font-body text-xs text-ink/80">
              Kya aap sach mein Token #{booking.token} cancel karna chahte hain?
            </p>

            {cancelError && (
              <p className="text-xs font-bold text-poleRed">{cancelError}</p>
            )}

            <div>
              <label className="font-label text-xs uppercase text-steel block mb-1">
                Karan / Reason (Optional):
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Jaise: Tabiyat theek nahi, doosra kaam aa gaya"
                className="w-full bg-paper border-2 border-ink p-2 font-body text-sm focus:outline-none focus:border-maroon"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowCancelModal(false)}
                className="flex-1 min-h-[44px] bg-paper border-2 border-ink text-ink font-label font-bold text-xs"
              >
                Nahi, Wapas Jayein
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmCancel}
                className="flex-1 min-h-[44px] bg-poleRed text-chalk border-2 border-ink font-label font-bold text-xs shadow-[2px_2px_0px_#2B2118] hover:bg-poleRed/90"
              >
                {isPending ? 'Cancelling...' : 'Haan, Cancel Karein'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL / DRAWER */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-paper border-4 border-maroon p-4 sm:p-6 max-w-lg w-full shadow-[6px_6px_0px_#2B2118] space-y-4 my-auto">
            <div className="flex justify-between items-center border-b-2 border-ink/20 pb-2">
              <h3 className="font-sign text-lg sm:text-xl text-maroon">
                Reschedule Slot / नया समय चुनें
              </h3>
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="font-token text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {rescheduleError && (
              <p className="text-xs font-bold text-poleRed bg-poleRed/10 p-2 border border-poleRed">
                {rescheduleError}
              </p>
            )}

            <RegisterDiarySlotPicker
              dates={dateTabs}
              selectedDateIst={selectedDateIst}
              onSelectDateIst={loadSlotsForDate}
              slots={slots}
              isLoading={loadingSlots}
              selectedSlot={selectedNewSlotStartsAt || undefined}
              onSelectSlot={(_timeStr, startsAt) => {
                setSelectedNewSlotStartsAt(startsAt || null);
              }}
            />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowRescheduleModal(false)}
                className="flex-1 min-h-[44px] bg-paper border-2 border-ink text-ink font-label font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isPending || !selectedNewSlotStartsAt}
                onClick={handleConfirmReschedule}
                className={clsx(
                  'flex-1 min-h-[44px] border-2 border-ink font-label font-bold text-xs shadow-[2px_2px_0px_#2B2118]',
                  selectedNewSlotStartsAt
                    ? 'bg-marigold text-ink hover:bg-saffron'
                    : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
                )}
              >
                {isPending ? 'Rescheduling...' : 'Naya Time Pakka Karein'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
