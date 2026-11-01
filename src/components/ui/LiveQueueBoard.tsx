'use client';

import React from 'react';
import { clsx } from 'clsx';

interface LiveQueueBoardProps {
  currentToken?: number;
  peopleWaiting?: number;
  approxWaitMin?: number;
  salonName?: string;
  className?: string;
}

export default function LiveQueueBoard({
  currentToken = 12,
  peopleWaiting = 3,
  approxWaitMin = 25,
  salonName,
  className,
}: LiveQueueBoardProps) {
  const formattedToken = currentToken.toString().padStart(2, '0');

  return (
    <div
      className={clsx(
        'relative bg-[#1A1412] text-chalk border-4 border-steel p-4 sm:p-5 shadow-[5px_5px_0px_#2B2118]',
        className
      )}
    >
      {/* Brass Screw Accents at 4 corners */}
      <div className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full border border-steel/60 bg-paper/40" />
      <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-steel/60 bg-paper/40" />
      <div className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full border border-steel/60 bg-paper/40" />
      <div className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full border border-steel/60 bg-paper/40" />

      {/* Counter Title & Active Status Dot */}
      <div className="flex items-center justify-between border-b border-steel/40 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-tile animate-pulse" />
          <span className="font-label font-bold text-xs uppercase tracking-widest text-marigold">
            LIVE COUNTER / लाइव टोकन
          </span>
        </div>
        {salonName && (
          <span className="font-sign text-xs text-chalk/70 truncate max-w-[140px]">
            {salonName}
          </span>
        )}
      </div>

      {/* Main Display: Seven-Segment / Digital Token Box */}
      <div className="text-center bg-black/70 border-2 border-poleRed/50 py-3 px-4 shadow-inner mb-3">
        <span className="font-label font-bold text-[11px] uppercase tracking-wider text-chalk/60 block mb-1">
          Now Serving / सेवा में
        </span>
        <div className="font-token text-4xl sm:text-5xl font-black text-poleRed tracking-widest leading-none drop-shadow-[0_0_8px_rgba(200,38,47,0.7)]">
          {formattedToken}
        </div>
      </div>

      {/* Sub-meters: People Waiting & Estimated Wait Time */}
      <div className="grid grid-cols-2 gap-2 text-center pt-1">
        <div className="bg-ink border border-steel/40 p-2">
          <span className="font-label font-bold text-[10px] text-chalk/60 block uppercase">
            Waiting / कतार
          </span>
          <span className="font-token text-lg sm:text-xl font-bold text-marigold">
            {peopleWaiting} {peopleWaiting === 1 ? 'person' : 'people'}
          </span>
        </div>

        <div className="bg-ink border border-steel/40 p-2">
          <span className="font-label font-bold text-[10px] text-chalk/60 block uppercase">
            Approx. Wait / समय
          </span>
          <span className="font-token text-lg sm:text-xl font-bold text-tile">
            ~{approxWaitMin} mins
          </span>
        </div>
      </div>
    </div>
  );
}
