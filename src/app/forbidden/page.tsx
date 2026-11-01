import React from 'react';
import Link from 'next/link';

export default function ForbiddenPage() {
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

      <div className="text-center max-w-md w-full">
        <div className="font-token text-8xl text-poleRed mb-2">403</div>

        <h1 className="font-sign text-3xl text-maroon mb-1">
          Pravesh Nishedh / No Entry
        </h1>
        <p className="font-body text-lg text-steel mb-6">
          प्रवेश निषेध (Forbidden)
        </p>

        <div
          className="border-4 border-maroon bg-paper p-6 mb-6 shadow-[5px_5px_0px_#2B2118]"
        >
          <p className="font-body text-ink text-base mb-2">
            Aapke paas is section ko dekhne ki anumati nahi hai. Kripya apne sahi account se login karein.
          </p>
          <p className="font-body text-steel text-sm">
            आपके पास इस सेक्शन को देखने की अनुमति नहीं है।
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/salons"
            className="inline-flex items-center justify-center border-2 border-ink bg-marigold px-6 py-3 font-label font-bold text-ink min-h-[44px] shadow-[3px_3px_0px_#2B2118] active:translate-x-0.5 active:translate-y-0.5"
          >
            Salons Dekhein / सैलून देखें
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center border-2 border-maroon bg-paper px-6 py-3 font-label font-bold text-maroon min-h-[44px] shadow-[3px_3px_0px_#7A1F2B] active:translate-x-0.5 active:translate-y-0.5"
          >
            Ghar Wapas / Home
          </Link>
        </div>
      </div>
    </main>
  );
}
