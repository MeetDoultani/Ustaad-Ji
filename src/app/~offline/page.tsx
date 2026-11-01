import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="relative max-w-md border-4 border-maroon bg-paper p-8 shadow-[6px_6px_0px_0px_#2B2118]">
        {/* Barber pole top accent */}
        <div className="h-3 w-full bg-gradient-to-r from-poleRed via-chalk to-poleBlue mb-6" />

        <h1 className="font-sign text-3xl text-maroon mb-2">
          Aap Offline Hain / आप ऑफलाइन हैं
        </h1>

        <p className="font-body text-base text-ink mb-6">
          Internet connection nahi mil raha hai. Kripya apna network check karein.
          (Please check your internet connection. Saved bookings and tokens remain accessible once reconnected.)
        </p>

        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="inline-block border-2 border-ink bg-marigold px-6 py-2.5 font-label font-bold text-ink shadow-[3px_3px_0px_0px_#2B2118] transition-transform active:translate-x-0.5 active:translate-y-0.5"
          >
            Dobara Koshish Karein / Try Again
          </Link>
        </div>
      </div>
    </main>
  );
}
