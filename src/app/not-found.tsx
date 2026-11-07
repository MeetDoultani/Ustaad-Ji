import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  let t;
  try {
    t = await getTranslations('notFound');
  } catch {
    t = (key: string) => {
      const fallback: Record<string, string> = {
        code: '404',
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist or may have been moved.',
        exploreSalons: 'Explore Salons',
        home: 'Back to Home',
      };
      return fallback[key] || key;
    };
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      {/* Barber pole top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-4"
        style={{
          background:
            'repeating-linear-gradient(90deg, #C8262F 0, #C8262F 33%, #FFFFFF 33%, #FFFFFF 66%, #1E4F9C 66%, #1E4F9C 100%)',
        }}
      />

      <div className="text-center max-w-md">
        {/* Big typewriter 404 */}
        <div className="font-token text-8xl text-maroon mb-2">{t('code')}</div>

        <h1 className="font-sign text-3xl text-maroon mb-4">
          {t('title')}
        </h1>

        <div
          className="border-4 border-maroon bg-paper p-6 mb-6"
          style={{ boxShadow: '6px 6px 0px #2B2118' }}
        >
          <p className="font-body text-ink text-base">
            {t('message')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/salons"
            className="inline-flex items-center justify-center border-2 border-ink bg-marigold px-6 py-3 font-label font-bold text-ink min-h-[44px]"
            style={{ boxShadow: '3px 3px 0px #2B2118' }}
          >
            {t('exploreSalons')}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center border-2 border-maroon bg-paper px-6 py-3 font-label font-bold text-maroon min-h-[44px]"
            style={{ boxShadow: '3px 3px 0px #7A1F2B' }}
          >
            {t('home')}
          </Link>
        </div>
      </div>
    </main>
  );
}
