'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { FullSalonDetails } from '@/lib/salons';
import { CurrentUser } from '@/lib/auth-server';
import RateCardBoard from '@/components/ui/RateCardBoard';
import UstaadCard from '@/components/ui/UstaadCard';
import RegisterDiarySlotPicker, { DiaryDateTab } from '@/components/ui/RegisterDiarySlotPicker';
import { getSlotsAction, createBookingAction, SerializedSlot } from '../actions';
import { calculateServicesSummary } from '@/lib/salons';

interface BookFlowClientProps {
  salon: FullSalonDetails;
  user: CurrentUser | null;
  dateTabs: DiaryDateTab[];
  initialServiceIds?: string[];
  initialBarberId?: string;
  initialDateIst?: string;
  initialSlotStartsAt?: string;
}

export default function BookFlowClient({
  salon,
  user,
  dateTabs,
  initialServiceIds = [],
  initialBarberId,
  initialDateIst,
  initialSlotStartsAt,
}: BookFlowClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Wizard Step: 1 = Services, 2 = Barber, 3 = Slot, 4 = Confirm
  const [currentStep, setCurrentStep] = useState<number>(() => {
    if (initialServiceIds.length > 0 && initialBarberId && initialSlotStartsAt) return 4;
    if (initialServiceIds.length > 0 && initialBarberId) return 3;
    if (initialServiceIds.length > 0) return 2;
    return 1;
  });

  // Selections
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialServiceIds);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(
    initialBarberId || (salon.barbers[0]?.id ?? null)
  );
  const [selectedDateIst, setSelectedDateIst] = useState<string>(
    initialDateIst || dateTabs[0]?.dateIst || ''
  );
  const [selectedSlotStartsAt, setSelectedSlotStartsAt] = useState<string | null>(
    initialSlotStartsAt || null
  );
  const [selectedSlotTimeStr, setSelectedSlotTimeStr] = useState<string | null>(null);

  // Slots fetching state
  const [slots, setSlots] = useState<SerializedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Submission error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Summary calculation
  const summary = calculateServicesSummary(salon.services, selectedServiceIds);

  // Selected barber object
  const selectedBarber = salon.barbers.find((b) => b.id === selectedBarberId);

  // Filter barbers who can perform ALL selected services
  const barberCapabilityMap = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const barber of salon.barbers) {
      const barberServiceIds = new Set(
        barber.services?.map((bs) => bs.service.id) || []
      );
      const canDoAll = selectedServiceIds.every((id) => barberServiceIds.has(id));
      map.set(barber.id, canDoAll);
    }
    return map;
  }, [salon.barbers, selectedServiceIds]);

  // If currently selected barber cannot perform selected services, reset or find another
  useEffect(() => {
    if (selectedBarberId && !barberCapabilityMap.get(selectedBarberId)) {
      const capableBarber = salon.barbers.find((b) => barberCapabilityMap.get(b.id));
      if (capableBarber) {
        setSelectedBarberId(capableBarber.id);
      }
    }
  }, [selectedServiceIds, barberCapabilityMap, selectedBarberId, salon.barbers]);

  // Fetch slots whenever barber, date, or services change
  useEffect(() => {
    if (!selectedBarberId || !selectedDateIst || selectedServiceIds.length === 0) {
      setSlots([]);
      return;
    }

    let isMounted = true;
    setLoadingSlots(true);
    setSlotsError(null);

    getSlotsAction({
      barberId: selectedBarberId,
      dateIst: selectedDateIst,
      serviceIds: selectedServiceIds,
    })
      .then((res) => {
        if (!isMounted) return;
        setLoadingSlots(false);
        if (res.ok && res.slots) {
          setSlots(res.slots);
          // If previous selection is still in newly fetched available slots, keep it
          if (selectedSlotStartsAt) {
            const found = res.slots.find((s) => s.startsAt === selectedSlotStartsAt);
            if (found && found.available) {
              setSelectedSlotTimeStr(found.timeStr);
            } else {
              setSelectedSlotStartsAt(null);
              setSelectedSlotTimeStr(null);
            }
          }
        } else {
          setSlotsError(res.message || 'Slots load nahi ho sake.');
          setSlots([]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadingSlots(false);
        setSlotsError('Slots load karte samay network error.');
        setSlots([]);
      });


    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarberId, selectedDateIst, selectedServiceIds]);



  const toggleService = (serviceId: string) => {
    setSubmitError(null);
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      }
      if (prev.length >= 6) {
        setSubmitError('Ek baar mein maximum 6 services book ki ja sakti hain.');
        return prev;
      }
      return [...prev, serviceId];
    });
  };

  const handleConfirmBooking = () => {
    if (!user) {
      // Redirect to login preserving callbackUrl with all choices
      const callbackUrl = `/book/${salon.slug}?services=${selectedServiceIds.join(',')}&barber=${selectedBarberId}&date=${selectedDateIst}&slot=${encodeURIComponent(selectedSlotStartsAt || '')}`;
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (user.role !== 'CUSTOMER') {
      setSubmitError('Customer booking ke liye kripya customer account se login karein.');
      return;
    }

    if (!selectedBarberId || !selectedSlotStartsAt || selectedServiceIds.length === 0) {
      setSubmitError('Sabhi steps complete karein.');
      return;
    }

    setSubmitError(null);

    startTransition(async () => {
      const result = await createBookingAction({
        salonId: salon.id,
        barberId: selectedBarberId,
        serviceIds: selectedServiceIds,
        startsAtIso: selectedSlotStartsAt,
      });

      if (result.ok && result.bookingId) {
        router.push(`/bookings/${result.bookingId}`);
      } else {
        setSubmitError(result.message || 'Booking fail ho gayi. Kripya punah koshish karein.');
        if (result.code === 'SLOT_TAKEN') {
          setCurrentStep(3); // Send user back to step 3 to choose another slot
        }
      }
    });
  };

  const isStaff = user && user.role !== 'CUSTOMER';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Staff Account Warning Notice */}
      {isStaff && (
        <div className="bg-paper border-4 border-maroon p-4 shadow-[4px_4px_0px_#7A1F2B]">
          <p className="font-sign text-lg text-maroon font-bold">
            ⚠️ Staff Account Notice / स्टाफ अकाउंट सूचना
          </p>
          <p className="font-body text-sm text-ink mt-1">
            Aap <strong>{user.role}</strong> account se logged in hain. Real slot bookings kewal customers ke liye hain. Booking confirm karne ke liye customer account use karein.
          </p>
        </div>
      )}

      {/* 4-Step Vintage Breadcrumbs / Progress Header */}
      <div className="bg-paper border-3 border-ink p-3 shadow-[4px_4px_0px_#2B2118]">
        <div className="flex items-center justify-between overflow-x-auto text-xs sm:text-sm font-label font-bold scrollbar-none py-1">
          {[
            { step: 1, en: '1. Services', hi: 'सेवाएं' },
            { step: 2, en: '2. Ustaad', hi: 'कारीगर' },
            { step: 3, en: '3. Slot', hi: 'समय' },
            { step: 4, en: '4. Confirm', hi: 'पुष्टि' },
          ].map((item, index) => {
            const isCurrent = currentStep === item.step;
            const isCompleted = currentStep > item.step;

            return (
              <React.Fragment key={item.step}>
                {index > 0 && (
                  <span className="text-steel/50 px-2 select-none">→</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    // Only allow navigating backwards or if prerequisite data exists
                    if (item.step < currentStep) {
                      setCurrentStep(item.step);
                    } else if (item.step === 2 && selectedServiceIds.length > 0) {
                      setCurrentStep(2);
                    } else if (
                      item.step === 3 &&
                      selectedServiceIds.length > 0 &&
                      selectedBarberId
                    ) {
                      setCurrentStep(3);
                    }
                  }}
                  className={clsx(
                    'min-h-[44px] px-3 py-1 flex items-center gap-1.5 transition-all whitespace-nowrap border',
                    isCurrent
                      ? 'bg-marigold text-ink border-ink shadow-[2px_2px_0px_#2B2118]'
                      : isCompleted
                      ? 'bg-tile text-tealDeep border-tealDeep hover:bg-tile/80'
                      : 'text-steel border-transparent hover:text-ink'
                  )}
                >
                  <span>{item.en}</span>
                  <span className="text-[11px] font-body opacity-80">({item.hi})</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div className="bg-poleRed/10 border-2 border-poleRed text-poleRed p-4 font-body text-sm font-bold shadow-[3px_3px_0px_#2B2118]">
          ✕ {submitError}
        </div>
      )}

      {/* STEP 1: Services Selection */}
      {currentStep === 1 && (
        <section className="space-y-6">
          <div className="border-b-2 border-ink/20 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
                Step 1: Rate Card / सेवाएं चुनें
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel">
                Chuniye aapko kaunsi services karwani hain (Maximum 6 services)
              </p>
            </div>
            {selectedServiceIds.length > 0 && (
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold self-start sm:self-auto">
                {selectedServiceIds.length} Chuni gayi
              </span>
            )}
          </div>

          <RateCardBoard
            services={salon.services}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
          />

          {/* Sticky/Bottom Action Bar for Step 1 */}
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-label font-bold text-sm text-steel">
                Total: {summary.serviceCount} services ({summary.totalDurationMin} mins)
              </span>
              <div className="font-token text-2xl font-bold text-maroon">
                ₹{summary.totalPriceRupees}
              </div>
            </div>

            <button
              type="button"
              disabled={selectedServiceIds.length === 0}
              onClick={() => setCurrentStep(2)}
              className={clsx(
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all',
                selectedServiceIds.length > 0
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              Next: Choose Ustaad / कारीगर चुनें →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Barber Selection */}
      {currentStep === 2 && (
        <section className="space-y-6">
          <div className="border-b-2 border-ink/20 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
                Step 2: Choose Your Ustaad / कारीगर चुनें
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel">
                Har ustaad apne haath ki safai ke liye mashhoor hai. Apna pasandeeda ustaad chuniye.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {salon.barbers.map((barber) => {
              const canDoAll = barberCapabilityMap.get(barber.id) ?? true;
              const isSelected = selectedBarberId === barber.id;

              return (
                <div key={barber.id} className="relative">
                  <UstaadCard
                    barber={barber}
                    isSelected={isSelected}
                    onSelect={canDoAll ? (id) => setSelectedBarberId(id) : undefined}
                    className={!canDoAll ? 'opacity-50 cursor-not-allowed' : ''}
                  />
                  {!canDoAll && (
                    <div className="mt-2 text-center">
                      <span className="font-label text-xs bg-paper border border-poleRed text-poleRed px-2 py-0.5">
                        Kuch chuni services yeh ustaad nahi karte
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Bar for Step 2 */}
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="min-h-[44px] px-5 py-2.5 font-label font-bold text-sm border-2 border-ink bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20"
            >
              ← Back to Services
            </button>

            <button
              type="button"
              disabled={!selectedBarberId || !barberCapabilityMap.get(selectedBarberId)}
              onClick={() => setCurrentStep(3)}
              className={clsx(
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all',
                selectedBarberId && barberCapabilityMap.get(selectedBarberId)
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              Next: Choose Slot / समय चुनें →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Slot Picker */}
      {currentStep === 3 && (
        <section className="space-y-6">
          <div className="border-b-2 border-ink/20 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
                Step 3: Appointment Diary / समय तय करें
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel">
                Ustaad {selectedBarber?.displayName} ki register diary se available slot chuniye
              </p>
            </div>
            {selectedSlotTimeStr && (
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold self-start sm:self-auto">
                Chuna: {selectedSlotTimeStr}
              </span>
            )}
          </div>

          {slotsError && (
            <div className="bg-poleRed/10 border-2 border-poleRed text-poleRed p-3 font-body text-xs">
              {slotsError}
            </div>
          )}

          <RegisterDiarySlotPicker
            dates={dateTabs}
            selectedDateIst={selectedDateIst}
            onSelectDateIst={(dateIst) => {
              setSelectedDateIst(dateIst);
              setSelectedSlotStartsAt(null);
              setSelectedSlotTimeStr(null);
            }}
            slots={slots}
            isLoading={loadingSlots}
            selectedSlot={selectedSlotStartsAt || undefined}
            onSelectSlot={(timeStr, startsAt) => {
              setSelectedSlotTimeStr(timeStr);
              setSelectedSlotStartsAt(startsAt || null);
            }}
          />

          {/* Action Bar for Step 3 */}
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="min-h-[44px] px-5 py-2.5 font-label font-bold text-sm border-2 border-ink bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20"
            >
              ← Back to Ustaad
            </button>

            <button
              type="button"
              disabled={!selectedSlotStartsAt}
              onClick={() => setCurrentStep(4)}
              className={clsx(
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all',
                selectedSlotStartsAt
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              Next: Review & Confirm / पुष्टि करें →
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Review & Confirmation Parchment Slip */}
      {currentStep === 4 && (
        <section className="space-y-6 max-w-2xl mx-auto">
          <div className="border-b-2 border-ink/20 pb-3">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon text-center">
              Step 4: Booking Summary / टोकन पर्ची की समीक्षा
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel text-center">
              Kripya sabhi details dekh kar booking pakki karein
            </p>
          </div>

          {/* Authentic Bill / Token Slip Preview */}
          <div className="bg-paper border-4 border-ink p-6 sm:p-8 shadow-[6px_6px_0px_#2B2118] space-y-6 relative">
            {/* Top Barber Pole Ribbon */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#7A1F2B,#7A1F2B_10px,#FAF5E8_10px,#FAF5E8_20px,#0F5E57_20px,#0F5E57_30px,#FAF5E8_30px,#FAF5E8_40px)]" />

            {/* Header info */}
            <div className="text-center border-b-2 border-dashed border-ink/30 pb-4 pt-2">
              <h3 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
                {salon.name}
              </h3>
              {salon.nameHi && (
                <p className="font-sign text-base text-tealDeep mt-0.5">
                  {salon.nameHi}
                </p>
              )}
              <p className="font-body text-xs text-steel mt-1">
                {salon.addressLine}, {salon.area}, {salon.city} - {salon.pincode}
              </p>
            </div>

            {/* Key Appointment Meta */}
            <div className="grid grid-cols-2 gap-4 border-b-2 border-dashed border-ink/30 pb-4 font-body text-sm">
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  Ustaad / कारीगर:
                </span>
                <span className="font-bold text-ink text-base">
                  {selectedBarber?.displayName}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  Date / तारीख:
                </span>
                <span className="font-bold text-ink text-base">
                  {selectedDateIst}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  Time / समय:
                </span>
                <span className="font-token text-base font-bold text-maroon">
                  {selectedSlotTimeStr || 'Selected Time'}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  Total Duration:
                </span>
                <span className="font-token text-base font-bold text-ink">
                  {summary.totalDurationMin} mins
                </span>
              </div>
            </div>

            {/* Selected Services Breakdown */}
            <div className="space-y-2 border-b-2 border-dashed border-ink/30 pb-4">
              <span className="font-label text-xs uppercase text-steel block mb-1">
                Selected Services / सेवाएं:
              </span>
              {summary.selectedServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between text-sm font-body"
                >
                  <span className="text-ink">
                    {service.name}{' '}
                    <span className="text-xs text-steel">({service.durationMin}m)</span>
                  </span>
                  <span className="font-token font-bold text-ink">
                    ₹{service.priceRupees}
                  </span>
                </div>
              ))}
            </div>

            {/* Grand Total */}
            <div className="flex items-baseline justify-between pt-1">
              <span className="font-label font-bold text-base text-ink">
                Grand Total / कुल राशि:
              </span>
              <span className="font-token text-3xl font-bold text-maroon">
                ₹{summary.totalPriceRupees}
              </span>
            </div>

            {/* Free Cancellation Cutoff Notice */}
            <div className="bg-tile/30 border border-tealDeep/40 p-3 text-xs font-body text-tealDeep">
              ℹ️ <strong>Cancellation Policy:</strong> Appointment shuru hone ke 1 ghante pehle tak muft cancellation uplabdh hai. Uske baad cancel nahi kiya ja sakta.
            </div>

            {/* Confirmation Action Button or Login Notice */}
            <div className="pt-2">
              {!user ? (
                <div className="space-y-3 text-center">
                  <div className="p-3 bg-marigold/20 border-2 border-dashed border-ink text-xs font-body text-ink">
                    Booking pakki karne ke liye apna mobile number verify karein.
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    className="w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[4px_4px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 transition-all"
                  >
                    Login with Phone to Confirm / फोन से लॉगिन करें →
                  </button>
                </div>
              ) : isStaff ? (
                <div className="text-center p-3 border-2 border-maroon bg-paper text-maroon font-body text-sm font-bold">
                  Staff account booking nahi bana sakta. Kripya customer account se login karein.
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmBooking}
                  className={clsx(
                    'w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-lg border-2 border-ink shadow-[4px_4px_0px_#2B2118] transition-all flex items-center justify-center gap-2',
                    isPending
                      ? 'opacity-70 cursor-wait'
                      : 'hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  )}
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-3 border-ink border-t-transparent rounded-full animate-spin" />
                      <span>Token Ban Raha Hai... / टोकन बन रहा है...</span>
                    </>
                  ) : (
                    <span>Pakka Karein / पक्का करें →</span>
                  )}
                </button>
              )}
            </div>

            {/* Back Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="font-body text-xs text-steel underline hover:text-ink"
              >
                ← Change Slot or Ustaad
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
