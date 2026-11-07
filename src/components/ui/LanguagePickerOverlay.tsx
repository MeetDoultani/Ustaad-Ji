'use client';
/* eslint-disable react/jsx-no-literals -- Intentional first-visit bilingual onboarding modal where language is not yet known */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/i18n/actions';
import { Locale } from '@/i18n/config';

interface LanguagePickerOverlayProps {
  initialHasCookie?: boolean;
}

export default function LanguagePickerOverlay({ initialHasCookie = false }: LanguagePickerOverlayProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [highlightHindi, setHighlightHindi] = useState(false);
  const englishBtnRef = useRef<HTMLButtonElement>(null);
  const hindiBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Never show in test environments or on API/auth routes
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    if (typeof window === 'undefined') return;

    const pathname = window.location.pathname;
    if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      return;
    }

    // Check if NEXT_LOCALE cookie exists
    const hasLocaleCookie =
      initialHasCookie ||
      document.cookie.split(';').some((c) => c.trim().startsWith('NEXT_LOCALE='));

    // Check if session fallback was set (when cookies blocked)
    const sessionDismissed = sessionStorage.getItem('ustaad_locale_dismissed') === 'true';

    if (!hasLocaleCookie && !sessionDismissed) {
      setIsOpen(true);

      // Pre-highlight Hindi if browser prefers Hindi (do NOT switch automatically)
      const langs = navigator.languages || [navigator.language || ''];
      const prefersHi = langs.some((l) => l.toLowerCase().startsWith('hi'));
      if (prefersHi) {
        setHighlightHindi(true);
      }
    }
  }, [initialHasCookie]);

  // Focus trap inside dialog
  useEffect(() => {
    if (!isOpen) return;

    // Focus the preferred or primary button on mount
    if (highlightHindi && hindiBtnRef.current) {
      hindiBtnRef.current.focus();
    } else if (englishBtnRef.current) {
      englishBtnRef.current.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === 'Tab') {
        const focusable = [englishBtnRef.current, hindiBtnRef.current].filter(Boolean) as HTMLElement[];
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightHindi]);

  if (!isOpen) {
    return null;
  }

  const handleSelect = async (locale: Locale) => {
    setIsPending(true);
    try {
      sessionStorage.setItem('ustaad_locale_dismissed', 'true');
      await setLocaleAction(locale);
      setIsOpen(false);
      router.refresh();
    } catch {
      setIsOpen(false);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lang-picker-title"
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm motion-safe:transition-opacity"
    >
      <div className="w-full max-w-sm sm:max-w-md bg-paper border-4 border-maroon rounded-2xl shadow-2xl p-6 text-center transform motion-safe:transition-all">
        {/* Salon Signboard Accent Bar */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="w-2.5 h-6 rounded-full border border-ink bg-gradient-to-b from-poleRed via-chalk to-poleBlue inline-block" />
          <span className="font-sign text-maroon text-2xl tracking-wide">Ustaad-Ji • उस्ताद जी</span>
          <span className="w-2.5 h-6 rounded-full border border-ink bg-gradient-to-b from-poleRed via-chalk to-poleBlue inline-block" />
        </div>

        {/* Title: The one place both languages appear together */}
        <h2
          id="lang-picker-title"
          className="font-sign text-xl sm:text-2xl text-ink mb-2 leading-tight"
        >
          Choose your language <br />
          <span className="text-maroon text-lg sm:text-xl">अपनी भाषा चुनें</span>
        </h2>
        <p className="font-body text-ink/80 text-sm mb-6">
          You can change this anytime from the top bar.
        </p>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            ref={englishBtnRef}
            type="button"
            disabled={isPending}
            onClick={() => handleSelect('en')}
            className={`min-h-[52px] px-4 py-3 rounded-xl font-sign text-lg border-2 text-ink bg-tile hover:bg-tile/80 active:scale-95 transition-all shadow-md focus:outline-none focus:ring-4 focus:ring-marigold ${
              !highlightHindi ? 'border-maroon ring-2 ring-maroon/30 font-bold' : 'border-ink/40'
            }`}
          >
            English
          </button>

          <button
            ref={hindiBtnRef}
            type="button"
            disabled={isPending}
            onClick={() => handleSelect('hi')}
            className={`min-h-[52px] px-4 py-3 rounded-xl font-sign text-xl border-2 text-ink bg-marigold hover:bg-marigold/80 active:scale-95 transition-all shadow-md focus:outline-none focus:ring-4 focus:ring-maroon ${
              highlightHindi ? 'border-maroon ring-4 ring-maroon/40 font-bold' : 'border-ink/40'
            }`}
          >
            हिन्दी
          </button>
        </div>
      </div>
    </div>
  );
}
