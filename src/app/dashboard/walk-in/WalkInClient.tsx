'use client';

import React, { useState, useTransition } from 'react';
import { createWalkInAction } from '../actions';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { clsx } from 'clsx';
import { formatIstTime } from '@/lib/time';

interface WalkInClientProps {
  userRole: 'BARBER' | 'OWNER';
  salon: {
    id: string;
    name: string;
    nameHi: string | null;
  };
  barbers: Array<{
    id: string;
    displayName: string;
  }>;
  initialBarberId?: string;
  services: Array<{
    id: string;
    name: string;
    nameHi: string | null;
    durationMin: number;
    priceRupees: number;
    category: string;
  }>;
}

export default function WalkInClient({
  userRole,
  salon,
  barbers,
  initialBarberId,
  services,
}: WalkInClientProps) {
  const locale = useLocale();
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tToken = useTranslations('token');
  const tError = useTranslations('errors');

  const [selectedBarberId, setSelectedBarberId] = useState<string>(
    initialBarberId || (barbers[0]?.id ?? '')
  );
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Success state for showing issued slip
  const [issuedSlip, setIssuedSlip] = useState<{
    bookingId: string;
    token: number;
    barberName: string;
    startsAt: string;
    endsAt: string;
    totalRupees: number;
  } | null>(null);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((sId) => sId !== id);
      }
      if (prev.length >= 6) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const totalDurationMin = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPriceRupees = selectedServices.reduce((sum, s) => sum + s.priceRupees, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedBarberId) {
      setFormError(t('selectBarberError'));
      return;
    }

    if (selectedServiceIds.length === 0) {
      setFormError(t('selectServiceError'));
      return;
    }

    if (customerPhone.trim() && !/^\+?[0-9]{10,13}$/.test(customerPhone.trim())) {
      setFormError(t('phoneFormatError'));
      return;
    }

    startTransition(async () => {
      const result = await createWalkInAction({
        barberId: selectedBarberId,
        serviceIds: selectedServiceIds,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
      });

      if (!result.ok) {
        const errorMsg =
          result.code && tError.has(result.code)
            ? tError(result.code as never)
            : result.error || tError('generic');
        setFormError(errorMsg);
      } else if (result.data) {
        setIssuedSlip({
          bookingId: result.data.bookingId,
          token: result.data.token,
          barberName: result.data.barberName,
          startsAt: new Date(result.data.startsAt).toISOString(),
          endsAt: new Date(result.data.endsAt).toISOString(),
          totalRupees: result.data.totalRupees,
        });
      }
    });
  };

  const handleResetForAnother = () => {
    setIssuedSlip(null);
    setSelectedServiceIds([]);
    setCustomerName('');
    setCustomerPhone('');
    setFormError(null);
  };

  // If slip was issued, render slip preview with print button and add another
  if (issuedSlip) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-paper border-4 border-ink p-6 sm:p-8 shadow-[6px_6px_0px_#2B2118] space-y-6 relative rounded-2xl">
          <div className="absolute top-0 left-0 right-0 h-2 bg-[repeating-linear-gradient(45deg,#7A1F2B,#7A1F2B_10px,#FAF5E8_10px,#FAF5E8_20px,#0F5E57_20px,#0F5E57_30px,#FAF5E8_30px,#FAF5E8_40px)] rounded-t-xl" />

          <div className="text-center border-b-2 border-dashed border-ink/30 pb-4 pt-2">
            <span className="font-token text-xs bg-marigold text-ink px-2.5 py-0.5 border border-ink font-bold uppercase rounded">
              {t('sourceWalkIn')} • {tToken('checkedIn')}
            </span>
            <h2 className="font-sign text-2xl sm:text-3xl text-maroon font-bold mt-2">
              {locale === 'hi' && salon.nameHi ? salon.nameHi : salon.name}
            </h2>
            <div className="font-token text-5xl font-bold text-maroon mt-2">
              #{issuedSlip.token}
            </div>
          </div>

          <div className="space-y-3 font-body text-sm border-b-2 border-dashed border-ink/30 pb-4">
            <div className="flex justify-between">
              <span className="text-steel">{t('selectBarberField')}</span>
              <strong className="text-ink">{issuedSlip.barberName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-steel">{t('timeSlotField')}</span>
              <span className="font-token font-bold text-ink">
                {formatIstTime(new Date(issuedSlip.startsAt))} – {formatIstTime(new Date(issuedSlip.endsAt))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-steel">{t('customerLabel')}</span>
              <strong className="text-ink">{customerName.trim() || t('walkInCustomer')}</strong>
            </div>
            {customerPhone.trim() && (
              <div className="flex justify-between">
                <span className="text-steel">{tCommon('phone')}:</span>
                <span className="font-token text-ink">{customerPhone.trim()}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2">
              <span className="font-label font-bold text-base text-ink">
                {t('totalAmountField')}
              </span>
              <span className="font-token text-3xl font-bold text-maroon">
                ₹{issuedSlip.totalRupees}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[3px_3px_0px_#2B2118] hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
            >
              🖨️ {t('printToken')}
            </button>

            <button
              type="button"
              onClick={handleResetForAnother}
              className="w-full min-h-[48px] bg-paper text-ink font-label font-bold text-sm border-2 border-ink shadow-[2px_2px_0px_#2B2118] hover:bg-tile/20 active:translate-x-0.5 active:translate-y-0.5 rounded-lg"
            >
              + {t('addAnother')}
            </button>

            <Link
              href="/dashboard"
              className="block text-center font-body text-xs text-steel underline hover:text-ink pt-1"
            >
              ← {t('backToRegister')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="font-label font-bold text-sm text-steel hover:text-ink underline flex items-center gap-1 min-h-[44px]"
        >
          ← {t('backToRegister')}
        </Link>
      </div>

      <div className="border-4 border-maroon bg-paper p-6 sm:p-8 shadow-[5px_5px_0px_#7A1F2B] space-y-6 rounded-2xl">
        <div className="border-b-2 border-ink/20 pb-4">
          <span className="font-token text-xs uppercase bg-marigold text-ink px-2 py-0.5 border border-ink font-bold rounded">
            {t('sourceWalkIn')}
          </span>
          <h1 className="font-sign text-2xl sm:text-3xl text-maroon font-bold mt-1">
            {t('addWalkIn')}
          </h1>
          <p className="font-body text-xs sm:text-sm text-steel">
            {t('walkInSubtitle')}
          </p>
        </div>

        {formError && (
          <div className="p-3 bg-poleRed/15 border-2 border-poleRed text-poleRed font-body text-sm rounded-lg">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Barber Selection */}
          <div>
            <label htmlFor="barberSelect" className="block font-label font-bold text-sm text-ink mb-1">
              {t('selectBarberField')} *
            </label>
            {userRole === 'BARBER' ? (
              <div className="p-3 border-2 border-ink bg-tile/20 font-sign text-lg font-bold text-maroon rounded-lg">
                {barbers.find((b) => b.id === selectedBarberId)?.displayName || 'Assigned Barber'}
              </div>
            ) : (
              <select
                id="barberSelect"
                value={selectedBarberId}
                onChange={(e) => setSelectedBarberId(e.target.value)}
                className="w-full min-h-[48px] bg-paper border-2 border-ink p-3 font-sign text-base text-maroon font-bold shadow-[2px_2px_0px_#2B2118] focus:outline-none focus:ring-2 focus:ring-maroon rounded-lg"
              >
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Customer Optional Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="customerNameInput" className="block font-label font-bold text-xs uppercase text-ink mb-1">
                {t('customerNameOptional')}
              </label>
              <input
                id="customerNameInput"
                type="text"
                maxLength={60}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t('customerNamePlaceholder')}
                className="w-full min-h-[48px] bg-paper border-2 border-ink px-3 py-2 font-body text-sm rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="customerPhoneInput" className="block font-label font-bold text-xs uppercase text-ink mb-1">
                {t('phoneOptional')}
              </label>
              <input
                id="customerPhoneInput"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                className="w-full min-h-[48px] bg-paper border-2 border-ink px-3 py-2 font-token text-sm rounded-lg"
              />
            </div>
          </div>

          {/* Services Selection (1 to 6) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-label font-bold text-sm text-ink">
                {t('selectServicesField')} *
              </label>
              <span className="font-token text-xs text-steel">
                {t('selectedServicesCount', { count: selectedServiceIds.length })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1 border-2 border-ink/20 rounded-lg">
              {services.map((service) => {
                const isSelected = selectedServiceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.id)}
                    className={clsx(
                      'min-h-[48px] p-3 text-left border-2 transition-all flex items-center justify-between rounded-lg',
                      isSelected
                        ? 'border-maroon bg-marigold/20 shadow-[2px_2px_0px_#7A1F2B] font-bold'
                        : 'border-ink/30 bg-paper hover:border-ink'
                    )}
                  >
                    <div>
                      <span className="font-body text-xs sm:text-sm text-ink block">
                        {locale === 'hi' && service.nameHi ? service.nameHi : service.name}
                      </span>
                      <span className="font-token text-[11px] text-steel">
                        {service.durationMin}m
                      </span>
                    </div>
                    <span className="font-token font-bold text-sm text-maroon">
                      ₹{service.priceRupees}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary Box */}
          {selectedServiceIds.length > 0 && (
            <div className="bg-tile/20 border-2 border-ink p-4 flex items-center justify-between rounded-xl">
              <div>
                <span className="font-label text-xs uppercase font-bold text-steel block">
                  {t('totalDurationField')}
                </span>
                <span className="font-token text-base font-bold text-ink">
                  {totalDurationMin} {tCommon('mins')}
                </span>
              </div>
              <div className="text-right">
                <span className="font-label text-xs uppercase font-bold text-steel block">
                  {t('totalAmountField')}
                </span>
                <span className="font-token text-2xl font-bold text-maroon">
                  ₹{totalPriceRupees}
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isPending || selectedServiceIds.length === 0}
            className={clsx(
              'w-full min-h-[48px] bg-marigold text-ink font-label font-bold text-base border-2 border-ink shadow-[4px_4px_0px_#2B2118] transition-all flex items-center justify-center gap-2 rounded-lg',
              isPending || selectedServiceIds.length === 0
                ? 'opacity-60 cursor-not-allowed shadow-none'
                : 'hover:bg-saffron active:translate-x-0.5 active:translate-y-0.5'
            )}
          >
            {isPending ? (
              <span>{t('issuingToken')}</span>
            ) : (
              <span>{t('issueWalkInButton')} →</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
