import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function OfflinePage() {
  let t;
  try {
    t = await getTranslations('common');
  } catch {
    t = (key: string) => {
      const fallback: Record<string, string> = {
        offlineTitle: 'You are offline',
        offlineDesc: 'Please check your internet connection and try again.',
        offlineAction: 'Try Again',
      };
      return fallback[key] || key;
    };
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="relative max-w-md border-4 border-maroon bg-paper p-8 shadow-[6px_6px_0px_0px_#2B2118]">
        {/* Barber pole top accent */}
        <div className="h-3 w-full bg-gradient-to-r from-poleRed via-chalk to-poleBlue mb-6" />

        <h1 className="font-sign text-3xl text-maroon mb-4">
          {t('offlineTitle')}
        </h1>

        <p className="font-body text-base text-ink mb-6">
          {t('offlineDesc')}
        </p>

        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center border-2 border-ink bg-marigold px-6 py-2.5 font-label font-bold text-ink shadow-[3px_3px_0px_0px_#2B2118] transition-transform active:translate-x-0.5 active:translate-y-0.5 min-h-[44px]"
          >
            {t('offlineAction')}
          </Link>
        </div>
      </div>
    </main>
  );
}
