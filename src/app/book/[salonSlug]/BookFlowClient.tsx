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
import { CANCEL_CUTOFF_MIN } from '@/lib/booking-config';
import { useLocale, useTranslations } from 'next-intl';
import { getLocalizedName } from '@/i18n/config';

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
  const locale = useLocale();
  const t = useTranslations('book');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
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
  const localizedSalonName = getLocalizedName(salon, locale);

  // Synchronize state with URL query parameters so language switching and reloads preserve state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (selectedServiceIds.length > 0) {
      params.set('services', selectedServiceIds.join(','));
    } else {
      params.delete('services');
    }
    if (selectedBarberId) params.set('barber', selectedBarberId);
    if (selectedDateIst) params.set('date', selectedDateIst);
    if (selectedSlotStartsAt) params.set('slot', selectedSlotStartsAt);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  }, [selectedServiceIds, selectedBarberId, selectedDateIst, selectedSlotStartsAt]);

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
          // If we had an initialSlotStartsAt, see if we can resolve its timeStr
          if (selectedSlotStartsAt) {
            const found = res.slots.find((s) => s.startsAt === selectedSlotStartsAt);
            if (found) {
              setSelectedSlotTimeStr(found.timeStr);
            }
          }
        } else {
          const errKey = res.code || res.message;
          const errMsg = errKey && (tErrors as unknown as Record<string, string>)[errKey]
            ? (tErrors as unknown as Record<string, string>)[errKey]
            : (res.message || tErrors('generic'));
          setSlotsError(errMsg);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadingSlots(false);
        setSlotsError(tErrors('generic'));
      });

    return () => {
      isMounted = false;
    };
  }, [salon.slug, selectedBarberId, selectedDateIst, selectedServiceIds, selectedSlotStartsAt, tErrors]);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId];
      // Reset selected slot if service duration changes
      setSelectedSlotStartsAt(null);
      setSelectedSlotTimeStr(null);
      return next;
    });
  };

  const handleConfirmBooking = async () => {
    if (!user) {
      const callbackUrl = encodeURIComponent(
        `/book/${salon.slug}?services=${selectedServiceIds.join(',')}&barber=${selectedBarberId}&date=${selectedDateIst}&slot=${encodeURIComponent(
          selectedSlotStartsAt || ''
        )}`
      );
      router.push(`/login?callbackUrl=${callbackUrl}`);
      return;
    }

    if (!selectedBarberId || !selectedSlotStartsAt || selectedServiceIds.length === 0) {
      setSubmitError(tErrors('INVALID_INPUT'));
      return;
    }

    setSubmitError(null);

    startTransition(async () => {
      const res = await createBookingAction({
        salonId: salon.id,
        barberId: selectedBarberId,
        serviceIds: selectedServiceIds,
        startsAtIso: selectedSlotStartsAt,
      });

      if (res.ok && res.bookingId) {
        router.push(`/bookings/${res.bookingId}`);
      } else {
        const errKey = res.code || res.message || 'generic';
        const translatedErr = (tErrors as unknown as Record<string, string>)[errKey] || res.message || tErrors('generic');
        setSubmitError(translatedErr);
      }
    });
  };

  const isStaff = user?.role === 'BARBER' || user?.role === 'OWNER';

  // Step Breadcrumb Navigation
  const steps = [
    { num: 1, label: t('servicesStep') },
    { num: 2, label: t('barberStep') },
    { num: 3, label: t('slotStep') },
    { num: 4, label: t('confirmStep') },
  ];

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-8">
      {/* Step Wizard Header */}
      <div className="bg-paper border-4 border-maroon p-4 sm:p-5 shadow-[4px_4px_0px_#7A1F2B] rounded-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {steps.map((item, idx) => {
            const isCurrent = currentStep === item.num;
            const isCompleted = currentStep > item.num;
            return (
              <React.Fragment key={item.num}>
                {idx > 0 && <span className="text-steel hidden sm:inline">→</span>}
                <button
                  type="button"
                  onClick={() => {
                    // Only allow navigating back to previously reached steps
                    if (item.num <= currentStep) {
                      setCurrentStep(item.num);
                    }
                  }}
                  disabled={item.num > currentStep}
                  className={clsx(
                    'font-label font-bold text-xs sm:text-sm px-3 py-1.5 border-2 transition-all flex items-center gap-1.5 rounded-lg min-h-[44px]',
                    isCurrent
                      ? 'bg-marigold text-ink border-ink shadow-[2px_2px_0px_#2B2118]'
                      : isCompleted
                      ? 'bg-tile text-tealDeep border-tealDeep hover:bg-tile/80'
                      : 'text-steel border-transparent hover:text-ink cursor-not-allowed opacity-60'
                  )}
                >
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div className="bg-poleRed/10 border-2 border-poleRed text-poleRed p-4 font-body text-sm font-bold shadow-[3px_3px_0px_#2B2118] rounded-xl">
          ✕ {submitError}
        </div>
      )}

      {/* STEP 1: Services Selection */}
      {currentStep === 1 && (
        <section className="space-y-6">
          <div className="border-b-2 border-ink/20 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="font-sign text-2xl sm:text-3xl text-maroon">
                {t('servicesStep')}
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
                {t('selectServicesSubtitle')}
              </p>
            </div>
            {selectedServiceIds.length > 0 && (
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold self-start sm:self-auto rounded">
                {t('servicesSelectedCount', { count: selectedServiceIds.length })}
              </span>
            )}
          </div>

          <RateCardBoard
            services={salon.services}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
          />

          {/* Action Bar for Step 1 */}
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl">
            <div>
              <span className="font-label font-bold text-sm text-steel">
                {t('totalSummary', { price: summary.totalPriceRupees, duration: summary.totalDurationMin })}
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
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all rounded-lg',
                selectedServiceIds.length > 0
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              {t('nextSelectBarber')}
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
                {t('barberStep')}
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
                {t('selectBarberSubtitle')}
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
                      <span className="font-label text-xs bg-paper border border-poleRed text-poleRed px-2 py-0.5 rounded">
                        {t('barberMissingServices')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Bar for Step 2 */}
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="min-h-[44px] px-5 py-2.5 font-label font-bold text-sm border-2 border-ink bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 rounded-lg"
            >
              {t('backToServices')}
            </button>

            <button
              type="button"
              disabled={!selectedBarberId || !barberCapabilityMap.get(selectedBarberId)}
              onClick={() => setCurrentStep(3)}
              className={clsx(
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all rounded-lg',
                selectedBarberId && barberCapabilityMap.get(selectedBarberId)
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              {t('nextSelectSlot')}
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
                {t('slotStep')}
              </h2>
              <p className="font-body text-xs sm:text-sm text-steel mt-0.5">
                {selectedBarber?.displayName} &bull; {t('appointmentDiaryTitle')}
              </p>
            </div>
            {selectedSlotTimeStr && (
              <span className="font-token text-xs bg-marigold text-ink px-2.5 py-1 border border-ink font-bold self-start sm:self-auto rounded">
                {t('selectedTimePrefix', { time: selectedSlotTimeStr })}
              </span>
            )}
          </div>

          {slotsError && (
            <div className="bg-poleRed/10 border-2 border-poleRed text-poleRed p-3 font-body text-xs rounded-lg">
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
          <div className="bg-paper border-4 border-ink p-4 shadow-[4px_4px_0px_#2B2118] flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="min-h-[44px] px-5 py-2.5 font-label font-bold text-sm border-2 border-ink bg-paper text-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 rounded-lg"
            >
              {t('backToBarber')}
            </button>

            <button
              type="button"
              disabled={!selectedSlotStartsAt}
              onClick={() => setCurrentStep(4)}
              className={clsx(
                'min-h-[44px] w-full sm:w-auto px-6 py-3 font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] transition-all rounded-lg',
                selectedSlotStartsAt
                  ? 'bg-marigold text-ink hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  : 'bg-steel/20 text-steel cursor-not-allowed shadow-none'
              )}
            >
              {t('nextReviewBooking')}
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Review & Confirmation Slip */}
      {currentStep === 4 && (
        <section className="space-y-6 max-w-2xl mx-auto">
          <div className="border-b-2 border-ink/20 pb-3">
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon text-center">
              {t('confirmStep')}
            </h2>
            <p className="font-body text-xs sm:text-sm text-steel text-center mt-0.5">
              {t('reviewSubtitle')}
            </p>
          </div>

          {/* Authentic Bill / Token Slip Preview */}
          <div className="bg-paper border-4 border-ink p-6 sm:p-8 shadow-[6px_6px_0px_#2B2118] space-y-6 relative rounded-2xl">
            {/* Top Barber Pole Ribbon */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#7A1F2B,#7A1F2B_10px,#FAF5E8_10px,#FAF5E8_20px,#0F5E57_20px,#0F5E57_30px,#FAF5E8_30px,#FAF5E8_40px)] rounded-t-xl" />

            {/* Header info */}
            <div className="text-center border-b-2 border-dashed border-ink/30 pb-4 pt-2">
              <h3 className="font-sign text-2xl sm:text-3xl text-maroon font-bold">
                {localizedSalonName}
              </h3>
              <p className="font-body text-xs text-steel mt-1">
                {salon.addressLine}, {salon.area}, {salon.city} - {salon.pincode}
              </p>
            </div>

            {/* Key Appointment Meta */}
            <div className="grid grid-cols-2 gap-4 border-b-2 border-dashed border-ink/30 pb-4 font-body text-sm">
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  {t('barberField')}
                </span>
                <span className="font-bold text-ink text-base">
                  {selectedBarber?.displayName}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  {t('dateField')}
                </span>
                <span className="font-token font-bold text-ink text-base">
                  {selectedDateIst}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  {t('timeField')}
                </span>
                <span className="font-token text-base font-bold text-maroon">
                  {selectedSlotTimeStr || 'Selected Time'}
                </span>
              </div>
              <div>
                <span className="font-label text-xs uppercase text-steel block">
                  {t('durationField')}
                </span>
                <span className="font-token text-base font-bold text-ink">
                  {summary.totalDurationMin} {tCommon('mins')}
                </span>
              </div>
            </div>

            {/* Selected Services Breakdown */}
            <div className="space-y-2 border-b-2 border-dashed border-ink/30 pb-4">
              <span className="font-label text-xs uppercase text-steel block mb-1">
                {t('servicesField')}
              </span>
              {summary.selectedServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between text-sm font-body"
                >
                  <span className="text-ink">
                    {getLocalizedName(service, locale)}{' '}
                    <span className="text-xs text-steel font-token">({service.durationMin}m)</span>
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
                {t('totalAmountField')}
              </span>
              <span className="font-token text-3xl font-bold text-maroon">
                ₹{summary.totalPriceRupees}
              </span>
            </div>

            {/* Free Cancellation Notice */}
            <div className="bg-tile/30 border border-tealDeep/40 p-3 text-xs font-body text-tealDeep rounded-lg">
              ℹ️ <strong>{t('cancellationPolicyTitle')}</strong>{' '}
              {t('cancellationPolicyDesc', { minutes: CANCEL_CUTOFF_MIN })}
            </div>

            {/* Confirmation Action Button or Login Notice */}
            <div className="pt-2">
              {!user ? (
                <div className="space-y-3 text-center">
                  <div className="p-3 bg-marigold/20 border-2 border-dashed border-ink text-xs font-body text-ink rounded-lg">
                    {t('loginPrompt')}
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    className="w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[4px_4px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 transition-all rounded-lg"
                  >
                    {t('loginWithPhone')}
                  </button>
                </div>
              ) : isStaff ? (
                <div className="text-center p-3 border-2 border-maroon bg-paper text-maroon font-body text-sm font-bold rounded-lg">
                  {t('staffCannotBook')}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmBooking}
                  className={clsx(
                    'w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-lg border-2 border-ink shadow-[4px_4px_0px_#2B2118] transition-all flex items-center justify-center gap-2 rounded-lg',
                    isPending
                      ? 'opacity-70 cursor-wait'
                      : 'hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
                  )}
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-3 border-ink border-t-transparent rounded-full animate-spin" />
                      <span>{t('processing')}</span>
                    </>
                  ) : (
                    <span>{t('confirmButton')} →</span>
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
                {t('changeSlotOrBarber')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
