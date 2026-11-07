'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6 font-body">
      <div className="text-center max-w-md w-full">
        <div className="font-token text-6xl text-poleRed mb-4">⚠</div>
        <h1 className="font-sign text-3xl text-maroon mb-4">{t('title')}</h1>

        <div
          className="border-4 border-poleRed bg-paper p-6 mb-6 text-left"
          style={{ boxShadow: '6px 6px 0px #C8262F' }}
        >
          <p className="font-body text-ink text-base mb-2">
            {t('message')}
          </p>
          {error?.digest && (
            <p className="font-token text-xs text-steel mt-2 border-t border-steel/30 pt-2">
              {t('digest', { digest: error.digest })}
            </p>
          )}
        </div>

        <button
          onClick={reset}
          type="button"
          className="border-2 border-ink bg-marigold px-6 py-3 font-label font-bold text-ink min-h-[44px] shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5"
        >
          {t('retry')}
        </button>
      </div>
    </main>
  );
}
