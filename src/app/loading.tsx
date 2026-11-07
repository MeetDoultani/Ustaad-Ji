import React from 'react';
import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  let t;
  try {
    t = await getTranslations('loading');
  } catch {
    t = (key: string) => {
      const fallback: Record<string, string> = {
        title: 'Getting Your Chair Ready...',
        subtitle: 'Preparing your neighbourhood appointment register...',
        subtext: 'Please wait a moment while we load your details.',
      };
      return fallback[key] || key;
    };
  }

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center p-6 text-center">
      {/* Barber Pole vertical loader */}
      <div
        className="w-8 h-20 border-2 border-ink shadow-[3px_3px_0px_#2B2118] overflow-hidden mb-6 relative"
        aria-hidden="true"
      >
        <div
          className="barber-load-stripe w-full h-[200%]"
          style={{
            background:
              'repeating-linear-gradient(45deg, #C8262F 0, #C8262F 8px, #FFFFFF 8px, #FFFFFF 16px, #1E4F9C 16px, #1E4F9C 24px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <h2 className="font-sign text-2xl sm:text-3xl text-maroon mb-2">
        {t('title')}
      </h2>
      <p className="font-body text-base text-steel mb-4">
        {t('subtitle')}
      </p>

      <div className="font-token text-xs bg-tile/30 border border-ink/40 px-3 py-1.5 text-ink">
        {t('subtext')}
      </div>
    </main>
  );
}
