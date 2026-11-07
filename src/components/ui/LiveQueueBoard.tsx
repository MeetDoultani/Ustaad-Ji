'use client';

import React from 'react';
import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('queueBoard');
  const formattedToken = currentToken.toString().padStart(2, '0');

  return (
    <div
      className={clsx(
        'relative bg-[#1A1412] text-chalk border-4 border-steel p-4 sm:p-5 shadow-[5px_5px_0px_#2B2118] rounded-xl',
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
          <span className="font-label font-bold text-xs uppercase tracking-normal text-marigold">
            {t('title')}
          </span>
        </div>
        {salonName && (
          <span className="font-sign text-xs text-chalk/70 truncate max-w-[140px]">
            {salonName}
          </span>
        )}
      </div>

      {/* Main Display: Seven-Segment / Digital Token Box */}
      <div className="text-center bg-black/70 border-2 border-poleRed/50 py-3 px-4 shadow-inner mb-3 rounded-md">
        <span className="font-label font-bold text-[11px] uppercase tracking-normal text-chalk/60 block mb-1">
          {t('nowServing')}
        </span>
        <div className="font-token text-4xl sm:text-5xl font-black text-poleRed tracking-wider leading-none drop-shadow-[0_0_8px_rgba(200,38,47,0.7)]">
          {formattedToken}
        </div>
      </div>

      {/* Sub-meters: People Waiting & Estimated Wait Time */}
      <div className="grid grid-cols-2 gap-2 text-center pt-1">
        <div className="bg-ink border border-steel/40 p-2 rounded-sm">
          <span className="font-label font-bold text-[10px] text-chalk/60 block uppercase">
            {t('waiting')}
          </span>
          <span className="font-token text-lg sm:text-xl font-bold text-marigold">
            {t('waitingCount', { count: peopleWaiting })}
          </span>
        </div>

        <div className="bg-ink border border-steel/40 p-2 rounded-sm">
          <span className="font-label font-bold text-[10px] text-chalk/60 block uppercase">
            {t('estimatedWait')}
          </span>
          <span className="font-token text-lg sm:text-xl font-bold text-tile">
            {t('waitMinutes', { minutes: approxWaitMin })}
          </span>
        </div>
      </div>
    </div>
  );
}
