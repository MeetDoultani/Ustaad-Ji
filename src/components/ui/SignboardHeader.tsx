'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { clsx } from 'clsx';

interface SignboardHeaderProps {
  salonName?: string;
  salonNameHi?: string;
}

export default function SignboardHeader({ salonName, salonNameHi }: SignboardHeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/NEXT_LOCALE=(en|hi)/);
      if (match && (match[1] === 'en' || match[1] === 'hi')) {
        setLang(match[1]);
      }
    }

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleLang = () => {
    const next = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    router.refresh();
  };

  const displayName = salonName ?? 'SalonWala';
  const displayNameHi = salonNameHi ?? 'सैलनवाला';

  const user = session?.user;
  const userRole = (user as unknown as { role?: string })?.role;

  // Determine role-aware navigation links
  const links: { label: string; labelHi: string; href: string }[] = [
    { label: 'Salons', labelHi: 'सैलून', href: '/salons' },
  ];

  if (user) {
    if (userRole === 'ADMIN') {
      links.push({ label: 'Admin Desk', labelHi: 'एडमिन', href: '/admin' });
    } else if (userRole === 'BARBER' || userRole === 'OWNER') {
      links.push({ label: 'Dashboard', labelHi: 'रजिस्टर', href: '/dashboard' });
    } else {
      links.push({ label: 'My Bookings', labelHi: 'बुकिंग', href: '/bookings' });
    }
    links.push({ label: 'Profile', labelHi: 'खाता', href: '/account' });
  } else {
    links.push({ label: 'Login', labelHi: 'लॉगिन', href: '/login' });
  }

  const userGreeting = user
    ? user.name || (user.email ? user.email.split('@')[0] : 'Grahak')
    : null;

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 bg-maroon border-b-2 border-marigold/40 transition-all duration-200 shadow-md',
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

          {/* Text Logo */}
          <Link href="/" className="flex flex-col leading-tight group">
            <span
              className={clsx(
                'font-sign text-marigold tracking-wide transition-all duration-200 group-hover:text-chalk',
                scrolled ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl',
              )}
            >
              {displayName}
            </span>
            <span
              className={clsx(
                'font-body text-paper/80 transition-all duration-200 leading-none',
                scrolled ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm',
              )}
            >
              {displayNameHi}
            </span>
          </Link>
        </div>

        {/* Desktop Nav links */}
        <nav className="hidden md:flex items-center gap-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-label font-bold text-paper hover:text-marigold transition-colors min-h-[44px] flex items-center gap-1.5"
            >
              <span>{link.label}</span>
              <span className="font-body text-paper/60 text-xs">/ {link.labelHi}</span>
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
                Logout / बाहर
              </button>
            </div>
          )}
        </nav>

        {/* Right action bar: Language Switcher + Mobile Menu Button */}
        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            type="button"
            className="font-label font-bold text-paper border-2 border-marigold/60 px-2.5 sm:px-3 py-1 min-h-[44px] text-xs sm:text-sm hover:bg-marigold hover:text-ink transition-all active:translate-x-[1px] active:translate-y-[1px]"
            aria-label="Toggle language between English and Hindi"
          >
            {lang === 'en' ? 'EN | हिं' : 'हिं | EN'}
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex flex-col justify-center items-center w-11 h-11 border-2 border-marigold/60 text-paper hover:bg-marigold hover:text-ink"
            aria-label="Toggle Navigation Menu"
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
              <span>Namaste, {userGreeting}</span>
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
              <span className="font-body text-paper/60 text-sm">/ {link.labelHi}</span>
            </Link>
          ))}

          {user && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                signOut({ callbackUrl: '/' });
              }}
              className="font-label font-bold text-poleRed bg-paper text-left py-2 px-3 border border-poleRed flex items-center justify-between min-h-[44px] mt-1"
            >
              <span>Logout</span>
              <span className="font-body text-xs">/ लॉगआउट</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}
