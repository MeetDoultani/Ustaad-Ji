import Link from 'next/link';

export default function NotFound() {
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
        <div className="font-token text-8xl text-maroon mb-2">404</div>

        {/* Bilingual heading */}
        <h1 className="font-sign text-3xl text-maroon mb-1">
          Arre! Galat Gali Mein Aa Gaye
        </h1>
        <p className="font-body text-lg text-steel mb-6">
          अरे! ग़लत गली में आ गए
        </p>

        <div
          className="border-4 border-maroon bg-paper p-6 mb-6"
          style={{ boxShadow: '6px 6px 0px #2B2118' }}
        >
          <p className="font-body text-ink text-base mb-2">
            Yeh page nahi mila. Shayad link galat hai ya page hata diya gaya.
          </p>
          <p className="font-body text-steel text-sm">
            यह पेज नहीं मिला। शायद लिंक ग़लत है।
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/salons"
            className="inline-block border-2 border-ink bg-marigold px-6 py-3 font-label font-bold text-ink min-h-[44px] flex items-center justify-center"
            style={{ boxShadow: '3px 3px 0px #2B2118' }}
          >
            Salons Dekhein / सैलून देखें
          </Link>
          <Link
            href="/"
            className="inline-block border-2 border-maroon bg-paper px-6 py-3 font-label font-bold text-maroon min-h-[44px] flex items-center justify-center"
            style={{ boxShadow: '3px 3px 0px #7A1F2B' }}
          >
            Ghar Wapas / Home
          </Link>
        </div>
      </div>
    </main>
  );
}
