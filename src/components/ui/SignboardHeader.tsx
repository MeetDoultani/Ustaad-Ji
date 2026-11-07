'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import { setLocaleAction } from '@/i18n/actions';
import { Locale } from '@/i18n/config';

interface SignboardHeaderProps {
  salonName?: string;
  salonNameHi?: string;
}

export default function SignboardHeader({ salonName, salonNameHi }: SignboardHeaderProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tBrand = useTranslations('brand');
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLanguageToggle = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    const targetLocale: Locale = locale === 'en' ? 'hi' : 'en';
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('ustaad_locale_dismissed', 'true');
      }
      await setLocaleAction(targetLocale);
      router.refresh();
    } finally {
      setIsSwitching(false);
    }
  };

  // Determine brand name per language
  const brandName =
    locale === 'hi'
      ? (salonNameHi && salonNameHi.trim() ? salonNameHi : (salonName ?? tBrand('name')))
      : (salonName ?? tBrand('name'));

  const user = session?.user;
  const userRole = (user as unknown as { role?: string })?.role;

  // Single-language navigation links
  const links: { label: string; href: string }[] = [
    { label: t('salons'), href: '/salons' },
  ];

  if (user) {
    if (userRole === 'ADMIN') {
      links.push({ label: t('admin'), href: '/admin' });
    } else if (userRole === 'BARBER' || userRole === 'OWNER') {
      links.push({ label: t('dashboard'), href: '/dashboard' });
    } else {
      links.push({ label: t('bookings'), href: '/bookings' });
    }
    links.push({ label: t('account'), href: '/account' });
  } else {
    links.push({ label: t('login'), href: '/login' });
  }

  const userGreeting = user
    ? user.name || (user.email ? user.email.split('@')[0] : t('account'))
    : null;

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 bg-maroon border-b-2 border-marigold/40 transition-all duration-200 shadow-md',
        scrolled ? 'py-1' : 'py-2.5',
      )}
    >
      {/* Marigold inner border box */}
      <div className="mx-2 sm:mx-4 border border-marigold/40 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-3">
        {/* Logo + Barber Pole */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Animated Barber Pole */}
          <div
            className="barber-pole-icon flex-shrink-0"
            aria-hidden="true"
            style={{
              width: '18px',
              height: scrolled ? '30px' : '42px',
              border: '2px solid #2B2118',
              borderRadius: '2px',
              overflow: 'hidden',
              transition: 'height 0.2s',
            }}
          >
            <div
              className="barber-pole-stripe"
              style={{
                width: '100%',
                height: '200%',
                background:
                  'repeating-linear-gradient(45deg, #C8262F 0, #C8262F 6px, #FFFFFF 6px, #FFFFFF 12px, #1E4F9C 12px, #1E4F9C 18px)',
                backgroundSize: '18px 18px',
              }}
            />
          </div>

          {/* Text Logo: Single language display */}
          <Link href="/" className="flex flex-col leading-tight group">
            <span
              className={clsx(
                'font-sign text-marigold tracking-normal transition-all duration-200 group-hover:text-chalk',
                scrolled ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
              )}
            >
              {brandName}
            </span>
          </Link>
        </div>

        {/* Desktop Nav links */}
        <nav className="hidden md:flex items-center gap-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-label font-bold text-paper hover:text-marigold transition-colors min-h-[44px] flex items-center text-base"
            >
              <span>{link.label}</span>
            </Link>
          ))}

          {user && (
            <div className="flex items-center gap-3 pl-2 border-l border-marigold/30">
              <span className="font-token text-xs text-marigold bg-ink/40 px-2 py-1 border border-marigold/30">
                {userGreeting}
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="font-label font-bold text-xs uppercase text-paper/80 hover:text-poleRed hover:underline py-1"
              >
                {t('logout')}
              </button>
            </div>
          )}
        </nav>

        {/* Right action bar: Language Switcher + Mobile Menu Button */}
        <div className="flex items-center gap-2">
          {/* Language Toggle: Displays the OTHER language's name */}
          <button
            onClick={handleLanguageToggle}
            type="button"
            disabled={isSwitching}
            className="font-label font-bold text-paper border-2 border-marigold/60 px-3 py-1.5 min-h-[44px] text-sm sm:text-base hover:bg-marigold hover:text-ink transition-all active:scale-95 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-marigold"
            aria-label={tCommon('languageSwitchLabel')}
          >
            <span>{tCommon('languageSwitch')}</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-11 h-11 border-2 border-marigold/60 text-paper hover:bg-marigold hover:text-ink"
            aria-label={t('toggleMenu')}
            aria-expanded={mobileMenuOpen}
          >
            <span className="block w-5 h-0.5 bg-current mb-1" />
            <span className="block w-5 h-0.5 bg-current mb-1" />
            <span className="block w-5 h-0.5 bg-current" />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mx-2 mt-1 border-2 border-marigold bg-maroon p-3 flex flex-col gap-2">
          {user && (
            <div className="p-2 border-b border-marigold/30 text-marigold font-token text-xs flex justify-between items-center">
              <span>{userGreeting}</span>
              <span className="uppercase text-[10px] bg-ink/50 px-1.5 py-0.5">{userRole}</span>
            </div>
          )}

          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="font-label font-bold text-paper hover:text-marigold py-2 px-3 border border-marigold/20 flex items-center justify-between min-h-[44px]"
            >
              <span>{link.label}</span>
            </Link>
          ))}

          {/* Language switcher inside mobile drawer */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLanguageToggle();
            }}
            className="font-label font-bold text-paper bg-tealDeep py-2 px-3 border border-marigold/40 flex items-center justify-between min-h-[44px] mt-1"
          >
            <span>{tCommon('language')}</span>
            <span className="text-marigold font-bold">{tCommon('languageSwitch')}</span>
          </button>

          {user && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                signOut({ callbackUrl: '/' });
              }}
              className="font-label font-bold text-poleRed bg-paper text-left py-2 px-3 border border-poleRed flex items-center justify-between min-h-[44px] mt-1"
            >
              <span>{t('logout')}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
