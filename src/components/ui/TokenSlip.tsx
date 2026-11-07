'use client';

import React from 'react';
import { clsx } from 'clsx';
import { BookingStatus } from '@prisma/client';
import { useLocale, useTranslations } from 'next-intl';

export interface TokenSlipProps {
  id?: string;
  tokenNumber: number;
  salonName: string;
  salonNameHi?: string;
  barberName: string;
  services: Array<string | { name: string; nameHi?: string | null; priceRupees?: number; durationMin?: number }>;
  date: string;
  time: string;
  status?: BookingStatus | 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED' | 'CHECKED_IN' | 'IN_PROGRESS';
  totalPriceRupees?: number;
  customerName?: string;
  salonAddress?: string;
  className?: string;
  showActions?: boolean;
  onSave?: () => void;
  onShareWhatsApp?: () => void;
}

export default function TokenSlip({
  id = 'token-slip-card',
  tokenNumber,
  salonName,
  salonNameHi,
  barberName,
  services,
  date,
  time,
  status = 'CONFIRMED',
  totalPriceRupees,
  customerName,
  salonAddress,
  className,
  showActions = true,
  onSave,
  onShareWhatsApp,
}: TokenSlipProps) {
  const locale = useLocale();
  const t = useTranslations('token');

  const displaySalonName =
    locale === 'hi' && salonNameHi && salonNameHi.trim() ? salonNameHi : salonName;

  const shareText = encodeURIComponent(
    t('whatsappText', {
      salon: displaySalonName,
      token: tokenNumber,
      date,
      time,
    })
  );

  // Status stamp configuration: exactly ONE word per language
  let stampBorder = 'border-tealDeep text-tealDeep';
  let stampWord = t('confirmed');
  let stampSub = t('stampOfficial');

  if (status === 'PENDING') {
    stampBorder = 'border-marigold text-marigold';
    stampWord = t('pending');
    stampSub = t('stampAwaiting');
  } else if (status === 'CANCELLED') {
    stampBorder = 'border-poleRed text-poleRed';
    stampWord = t('cancelled');
    stampSub = t('stampNotValid');
  } else if (status === 'COMPLETED') {
    stampBorder = 'border-tealDeep text-tealDeep';
    stampWord = t('completed');
    stampSub = t('stampVisited');
  } else if (status === 'CHECKED_IN') {
    stampBorder = 'border-tealDeep text-tealDeep';
    stampWord = t('checkedIn');
    stampSub = t('stampOfficial');
  } else if (status === 'IN_PROGRESS') {
    stampBorder = 'border-marigold text-marigold';
    stampWord = t('inProgress');
    stampSub = t('stampOfficial');
  } else if (status === 'NO_SHOW') {
    stampBorder = 'border-poleRed text-poleRed';
    stampWord = t('noShow');
    stampSub = t('stampNotValid');
  } else if (status === 'REJECTED') {
    stampBorder = 'border-poleRed text-poleRed';
    stampWord = t('rejected');
    stampSub = t('stampNotValid');
  }

  return (
    <div className={clsx('relative flex flex-col items-center', className)}>
      {/* Torn Slip Card Container */}
      <div
        id={id}
        className="relative bg-paper text-ink p-6 sm:p-8 border-2 border-ink shadow-[5px_5px_0px_#2B2118] max-w-sm sm:max-w-md w-full transition-transform transform -rotate-[1deg] hover:rotate-0 rounded-sm"
        style={{
          /* Perforated side edges effect */
          backgroundImage:
            'radial-gradient(circle at 0px 16px, transparent 6px, #F6EBD0 6px), radial-gradient(circle at 100% 16px, transparent 6px, #F6EBD0 6px)',
          backgroundSize: '100% 24px',
        }}
      >
        {/* Rubber Stamp Overlap: Single language, single word */}
        <div
          className={clsx(
            'absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed flex flex-col items-center justify-center p-1 pointer-events-none transform rotate-12 bg-paper/95 shadow-sm z-20',
            stampBorder
          )}
        >
          <div
            className={clsx(
              'w-full h-full rounded-full border-2 flex flex-col items-center justify-center text-center leading-none p-1',
              stampBorder
            )}
          >
            <span className="font-body text-[9px] font-bold tracking-normal uppercase">
              {stampSub}
            </span>
            <span
              className={clsx(
                'my-1 font-bold',
                locale === 'hi'
                  ? 'font-sign text-xl sm:text-2xl'
                  : 'font-token text-base sm:text-lg tracking-wider'
              )}
            >
              {stampWord}
            </span>
          </div>
        </div>

        {/* Top Header */}
        <div className="text-center border-b-2 border-dashed border-ink/40 pb-4 mb-4">
          <p className="font-sign text-xs tracking-normal text-maroon uppercase">
            {t('slipTitle')}
          </p>
          <h3 className="font-sign text-2xl text-ink leading-tight mt-1">
            {displaySalonName}
          </h3>
          {salonAddress && (
            <p className="font-body text-[11px] text-steel mt-0.5">
              {salonAddress}
            </p>
          )}
        </div>

        {/* Big Token Number */}
        <div className="text-center my-3 bg-tile/30 border-2 border-ink py-3 px-4 rounded-sm">
          <span className="font-label font-bold text-xs uppercase tracking-normal text-ink/70 block">
            {t('tokenNo')}
          </span>
          <span className="font-token text-4xl sm:text-5xl font-bold text-maroon tracking-wider">
            #{tokenNumber}
          </span>
        </div>

        {/* Details List */}
        <div className="space-y-2.5 text-xs sm:text-sm my-4 border-b-2 border-dashed border-ink/40 pb-4">
          {customerName && (
            <div className="flex justify-between items-baseline">
              <span className="text-steel font-body">{t('customer')}:</span>
              <span className="font-bold text-ink">{customerName}</span>
            </div>
          )}

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">{t('barber')}:</span>
            <span className="font-bold text-ink">{barberName}</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">{t('date')}:</span>
            <span className="font-token font-bold text-ink">{date}</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">{t('time')}:</span>
            <span className="font-token text-maroon text-base font-bold">{time}</span>
          </div>

          <div className="flex justify-between items-start pt-1">
            <span className="text-steel font-body">{t('services')}:</span>
            <div className="text-right space-y-0.5">
              {services.map((srv, idx) => {
                let name = '';
                let price: string | null = null;
                if (typeof srv === 'string') {
                  name = srv;
                } else {
                  name = locale === 'hi' && srv.nameHi ? srv.nameHi : srv.name;
                  if (srv.priceRupees) price = `₹${srv.priceRupees}`;
                }

                return (
                  <div key={idx} className="font-bold text-ink flex items-center justify-end gap-2">
                    <span>• {name}</span>
                    {price && <span className="text-steel font-token text-xs">{price}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {totalPriceRupees !== undefined && (
            <div className="flex justify-between items-baseline border-t border-ink/20 pt-2 mt-2">
              <span className="font-label font-bold text-sm">{t('total')}:</span>
              <span className="font-token text-xl font-bold text-maroon">
                ₹{totalPriceRupees}
              </span>
            </div>
          )}
        </div>

        {/* Instructions footer */}
        <div className="text-center text-[11px] font-body text-steel mb-4">
          {t('arriveEarlyHint')}
        </div>

        {/* Action Buttons */}
        {showActions && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onSave}
              className="flex-1 min-h-[44px] bg-paper border-2 border-maroon text-maroon font-label font-bold text-xs uppercase px-3 py-2 hover:bg-maroon hover:text-chalk transition-all rounded-sm"
            >
              {t('saveSlip')}
            </button>

            <a
              href={`https://api.whatsapp.com/send?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onShareWhatsApp}
              className="flex-1 min-h-[44px] bg-marigold border-2 border-ink text-ink font-label font-bold text-xs uppercase px-3 py-2 flex items-center justify-center hover:bg-saffron transition-all shadow-[2px_2px_0px_#2B2118] rounded-sm"
            >
              {t('shareWhatsApp')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
