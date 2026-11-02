'use client';

import React from 'react';
import { clsx } from 'clsx';
import { BookingStatus } from '@prisma/client';

export interface TokenSlipProps {
  id?: string;
  tokenNumber: number;
  salonName: string;
  salonNameHi?: string;
  barberName: string;
  services: Array<string | { name: string; priceRupees?: number; durationMin?: number }>;
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
  const shareText = encodeURIComponent(
    `Indian Salon Token: #${tokenNumber} at ${salonName} with Ustaad ${barberName} on ${date} at ${time}. Status: ${status}.`
  );

  // Status stamp configuration
  let stampBorder = 'border-tealDeep text-tealDeep';
  let stampSub = '★ OFFICIAL ★';
  let stampHi = 'पक्का';
  let stampEn = 'CONFIRMED';
  let stampBottom = 'CONFIRMED';

  if (status === 'PENDING') {
    stampBorder = 'border-marigold text-marigold';
    stampSub = '★ AWAITING ★';
    stampHi = 'प्रतीक्षारत';
    stampEn = 'PENDING';
    stampBottom = 'APPROVAL';
  } else if (status === 'CANCELLED') {
    stampBorder = 'border-poleRed text-poleRed';
    stampSub = '✕ CANCELLED ✕';
    stampHi = 'रद्द';
    stampEn = 'CANCELLED';
    stampBottom = 'NOT VALID';
  } else if (status === 'COMPLETED') {
    stampBorder = 'border-tealDeep text-tealDeep';
    stampSub = '✓ VISITED ✓';
    stampHi = 'पूर्ण';
    stampEn = 'COMPLETED';
    stampBottom = 'VISITED';
  }

  return (
    <div className={clsx('relative flex flex-col items-center', className)}>
      {/* Torn Slip Card Container */}
      <div
        id={id}
        className="relative bg-paper text-ink p-6 sm:p-8 border-2 border-ink shadow-[5px_5px_0px_#2B2118] max-w-sm sm:max-w-md w-full transition-transform transform -rotate-[1deg] hover:rotate-0"
        style={{
          /* Perforated side edges effect */
          backgroundImage:
            'radial-gradient(circle at 0px 16px, transparent 6px, #F6EBD0 6px), radial-gradient(circle at 100% 16px, transparent 6px, #F6EBD0 6px)',
          backgroundSize: '100% 24px',
        }}
      >
        {/* Rubber Stamp Overlap */}
        <div
          className={clsx(
            'absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed flex flex-col items-center justify-center p-1 pointer-events-none transform rotate-12 bg-paper/90 shadow-sm z-20',
            stampBorder
          )}
          style={{
            maskImage:
              'radial-gradient(circle, rgba(0,0,0,1) 85%, rgba(0,0,0,0.7) 100%)',
          }}
        >
          <div
            className={clsx(
              'w-full h-full rounded-full border-2 flex flex-col items-center justify-center text-center leading-none',
              stampBorder
            )}
          >
            <span className="font-token text-[9px] tracking-widest uppercase">
              {stampSub}
            </span>
            <span className="font-sign text-sm sm:text-base font-bold my-0.5">
              {stampHi}
            </span>
            <span className="font-token text-[11px] sm:text-xs font-bold tracking-wider">
              {stampEn}
            </span>
            <span className="font-token text-[8px] uppercase tracking-wider">
              {stampBottom}
            </span>
          </div>
        </div>

        {/* Top Header */}
        <div className="text-center border-b-2 border-dashed border-ink/40 pb-4 mb-4">
          <p className="font-sign text-xs tracking-widest text-maroon uppercase">
            DESI SALON TOKEN SLIP / पर्ची
          </p>
          <h3 className="font-sign text-2xl text-ink leading-tight mt-1">
            {salonName}
          </h3>
          {salonNameHi && (
            <p className="font-body text-xs text-steel">({salonNameHi})</p>
          )}
          {salonAddress && (
            <p className="font-body text-[11px] text-steel mt-0.5">
              {salonAddress}
            </p>
          )}
        </div>

        {/* Big Token Number */}
        <div className="text-center my-3 bg-tile/30 border-2 border-ink py-3 px-4">
          <span className="font-label font-bold text-xs uppercase tracking-wider text-ink/70 block">
            Token Number / टोकन संख्या
          </span>
          <span className="font-token text-4xl sm:text-5xl font-bold text-maroon tracking-wider">
            No. {tokenNumber}
          </span>
        </div>

        {/* Details List */}
        <div className="space-y-2.5 font-token text-xs sm:text-sm my-4 border-b-2 border-dashed border-ink/40 pb-4">
          {customerName && (
            <div className="flex justify-between items-baseline">
              <span className="text-steel font-body">Customer / ग्राहक:</span>
              <span className="font-bold text-ink">{customerName}</span>
            </div>
          )}

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">Ustaad / कारीगर:</span>
            <span className="font-bold text-ink">{barberName}</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">Date / तारीख:</span>
            <span className="font-bold text-ink">{date}</span>
          </div>

          <div className="flex justify-between items-baseline">
            <span className="text-steel font-body">Time Slot / समय:</span>
            <span className="font-bold text-maroon text-base font-bold">{time}</span>
          </div>

          <div className="flex justify-between items-start pt-1">
            <span className="text-steel font-body">Services / सेवा:</span>
            <div className="text-right space-y-0.5">
              {services.map((srv, idx) => {
                const name = typeof srv === 'string' ? srv : srv.name;
                const price = typeof srv === 'object' && srv.priceRupees ? `₹${srv.priceRupees}` : null;
                return (
                  <div key={idx} className="font-bold text-ink flex items-center justify-end gap-2">
                    <span>• {name}</span>
                    {price && <span className="text-steel font-normal text-xs">{price}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {totalPriceRupees !== undefined && (
            <div className="flex justify-between items-baseline border-t border-ink/20 pt-2 mt-2">
              <span className="font-label font-bold text-sm">Total / कुल:</span>
              <span className="font-token text-xl font-bold text-maroon">
                ₹{totalPriceRupees}
              </span>
            </div>
          )}
        </div>

        {/* Instructions footer */}
        <div className="text-center text-[11px] font-body text-steel mb-4">
          Kripya apne slot se 5 minute pehle pahuchein. Dhanyavaad!
        </div>

        {/* Action Buttons (rendered outside of print/snapshot if required) */}
        {showActions && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={onSave}
              className="flex-1 min-h-[44px] bg-paper border-2 border-maroon text-maroon font-label font-bold text-xs uppercase px-3 py-2 hover:bg-maroon hover:text-chalk transition-all"
            >
              Save Slip / डाउनलोड
            </button>

            <a
              href={`https://api.whatsapp.com/send?text=${shareText}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onShareWhatsApp}
              className="flex-1 min-h-[44px] bg-marigold border-2 border-ink text-ink font-label font-bold text-xs uppercase px-3 py-2 flex items-center justify-center hover:bg-saffron transition-all shadow-[2px_2px_0px_#2B2118]"
            >
              WhatsApp / शेयर
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
