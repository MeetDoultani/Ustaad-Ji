'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface TokenSlipProps {
  tokenNumber: number;
  salonName: string;
  salonNameHi?: string;
  barberName: string;
  services: string[];
  date: string;
  time: string;
  totalPriceRupees?: number;
  customerName?: string;
  className?: string;
  onSave?: () => void;
  onShareWhatsApp?: () => void;
}

export default function TokenSlip({
  tokenNumber,
  salonName,
  salonNameHi,
  barberName,
  services,
  date,
  time,
  totalPriceRupees,
  customerName,
  className,
  onSave,
  onShareWhatsApp,
}: TokenSlipProps) {
  const shareText = encodeURIComponent(
    `Indian Salon Token: #${tokenNumber} at ${salonName} with Ustaad ${barberName} on ${date} at ${time}. Booked via Indian Salon Booking.`
  );

  return (
    <div className={clsx('relative flex flex-col items-center', className)}>
      {/* Torn Slip Card Container */}
      <div
        className="relative bg-paper text-ink p-6 sm:p-8 border-2 border-ink shadow-[5px_5px_0px_#2B2118] max-w-sm sm:max-w-md w-full transition-transform transform -rotate-[1.5deg] hover:rotate-0"
        style={{
          /* Perforated side edges effect */
          backgroundImage:
            'radial-gradient(circle at 0px 16px, transparent 6px, #F6EBD0 6px), radial-gradient(circle at 100% 16px, transparent 6px, #F6EBD0 6px)',
          backgroundSize: '100% 24px',
        }}
      >
        {/* Rubber Stamp Overlap (Confirmed / पक्का) */}
        <div
          className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed border-maroon text-maroon flex flex-col items-center justify-center p-1 pointer-events-none transform rotate-12 bg-paper/90 shadow-sm z-20"
          style={{
            maskImage:
              'radial-gradient(circle, rgba(0,0,0,1) 85%, rgba(0,0,0,0.7) 100%)',
          }}
        >
          <div className="w-full h-full rounded-full border-2 border-maroon flex flex-col items-center justify-center text-center leading-none">
            <span className="font-token text-[10px] tracking-widest uppercase">
              ★ OFFICIAL ★
            </span>
            <span className="font-sign text-sm sm:text-base font-bold my-0.5">
              पक्का
            </span>
            <span className="font-token text-[11px] sm:text-xs font-bold tracking-wider">
              CONFIRMED
            </span>
            <span className="font-token text-[9px]">PAID/BOOKED</span>
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
            <div className="text-right">
              {services.map((srv, idx) => (
                <div key={idx} className="font-bold text-ink">
                  • {srv}
                </div>
              ))}
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

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={onSave || (() => window.print())}
            className="flex-1 min-h-[44px] bg-paper border-2 border-maroon text-maroon font-label font-bold text-xs uppercase px-3 py-2 hover:bg-maroon hover:text-chalk transition-all"
          >
            Save Slip / सहेजें
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
      </div>
    </div>
  );
}
