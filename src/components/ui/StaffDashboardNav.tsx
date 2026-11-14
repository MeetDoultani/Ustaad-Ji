'use client';

import React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { useTranslations } from 'next-intl';

export type StaffDashboardTab =
  | 'register'
  | 'walk-in'
  | 'history'
  | 'services'
  | 'hours'
  | 'barbers'
  | 'profile'
  | 'availability'
  | 'time-off';

interface StaffDashboardNavProps {
  currentTab: StaffDashboardTab;
  role: 'OWNER' | 'BARBER';
  salonId?: string;
  className?: string;
}

interface NavItemConfig {
  key: StaffDashboardTab;
  href: string;
  labelKey: string;
}

const OWNER_NAV_ITEMS: NavItemConfig[] = [
  { key: 'register', href: '/dashboard', labelKey: 'navRegister' },
  { key: 'walk-in', href: '/dashboard/walk-in', labelKey: 'navWalkIn' },
  { key: 'history', href: '/dashboard/history', labelKey: 'navHistory' },
  { key: 'services', href: '/dashboard/services', labelKey: 'navServices' },
  { key: 'hours', href: '/dashboard/hours', labelKey: 'navHours' },
  { key: 'barbers', href: '/dashboard/barbers', labelKey: 'navBarbers' },
  { key: 'profile', href: '/dashboard/profile', labelKey: 'navSalonProfile' },
  { key: 'availability', href: '/dashboard/availability', labelKey: 'navAvailability' },
  { key: 'time-off', href: '/dashboard/time-off', labelKey: 'navTimeOff' },
];

const BARBER_NAV_ITEMS: NavItemConfig[] = [
  { key: 'register', href: '/dashboard', labelKey: 'navRegister' },
  { key: 'walk-in', href: '/dashboard/walk-in', labelKey: 'navWalkIn' },
  { key: 'history', href: '/dashboard/history', labelKey: 'navHistory' },
  { key: 'profile', href: '/dashboard/profile', labelKey: 'navMyProfile' },
  { key: 'availability', href: '/dashboard/availability', labelKey: 'navAvailability' },
  { key: 'time-off', href: '/dashboard/time-off', labelKey: 'navTimeOff' },
];

export default function StaffDashboardNav({
  currentTab,
  role,
  salonId,
  className,
}: StaffDashboardNavProps) {
  const t = useTranslations('dashboard');

  const visibleItems = role === 'OWNER' ? OWNER_NAV_ITEMS : BARBER_NAV_ITEMS;

  return (
    <nav
      aria-label={t('navAriaLabel')}
      className={clsx(
        'w-full bg-paper border-2 border-charcoal/20 shadow-[3px_3px_0px_#2B2118] rounded-xl p-1.5 sm:p-2 overflow-x-auto no-scrollbar',
        className
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
        {visibleItems.map((item) => {
          const isActive = currentTab === item.key;
          const hrefWithQuery = salonId ? `${item.href}?salonId=${encodeURIComponent(salonId)}` : item.href;

          return (
            <Link
              key={item.key}
              href={hrefWithQuery}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                'min-h-[48px] px-3.5 sm:px-4 py-2.5 rounded-lg font-token text-xs sm:text-sm flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-maroon focus:ring-offset-1 select-none',
                isActive
                  ? 'bg-maroon text-chalk border-2 border-marigold font-bold shadow-[2px_2px_0px_#2B2118]'
                  : 'bg-paper text-ink border-2 border-charcoal/15 font-medium hover:border-maroon/60 hover:text-maroon'
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
