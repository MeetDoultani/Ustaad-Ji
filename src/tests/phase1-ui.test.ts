import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import {
  getPublicSalons,
  getSalonBySlug,
  groupServicesByCategory,
  calculateServicesSummary,
} from '@/lib/salons';
import { formatMinutesToTime, isSalonOpenNow } from '@/lib/time';
import { ServiceCategory, Service, VerificationStatus } from '@prisma/client';

describe('Phase 1 Public Salon Queries & Security Verification', () => {
  beforeAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run DB tests when APP_ENV or NODE_ENV is production');
    }
  });
  it('returns verified salons (Sharma Ji Gents Parlour) and strictly excludes pending salons (Royal Ustaad)', async () => {
    // 1. Check raw database to ensure both salons exist in db
    const sharmaJiInDb = await db.salon.findUnique({
      where: { slug: 'sharma-ji-gents-parlour' },
    });
    expect(sharmaJiInDb).not.toBeNull();
    expect(sharmaJiInDb?.status).toBe(VerificationStatus.VERIFIED);

    const royalUstaadInDb = await db.salon.findUnique({
      where: { slug: 'royal-ustaad-mens-salon' },
    });
    expect(royalUstaadInDb).not.toBeNull();
    expect(royalUstaadInDb?.status).toBe(VerificationStatus.PENDING);

    // 2. Query public salons via helper
    const publicSalons = await getPublicSalons();

    // Verify Sharma Ji is included
    const foundSharmaJi = publicSalons.find(
      (s) => s.slug === 'sharma-ji-gents-parlour'
    );
    expect(foundSharmaJi).toBeDefined();
    expect(foundSharmaJi?.status).toBe(VerificationStatus.VERIFIED);

    // Security Check: Verify Royal Ustaad is strictly EXCLUDED
    const foundRoyalUstaad = publicSalons.find(
      (s) => s.slug === 'royal-ustaad-mens-salon'
    );
    expect(foundRoyalUstaad).toBeUndefined();

    // Ensure all returned public salons have status === VERIFIED
    for (const salon of publicSalons) {
      expect(salon.status).toBe(VerificationStatus.VERIFIED);
      // Ensure all barbers returned inside are VERIFIED and active
      for (const barber of salon.barbers) {
        expect(barber.status).toBe(VerificationStatus.VERIFIED);
        expect(barber.isActive).toBe(true);
      }
    }
  });

  it('getSalonBySlug returns verified salon and returns null for pending or missing salon', async () => {
    // Verified salon returns full data
    const salon = await getSalonBySlug('sharma-ji-gents-parlour');
    expect(salon).not.toBeNull();
    expect(salon?.slug).toBe('sharma-ji-gents-parlour');
    expect(salon?.status).toBe(VerificationStatus.VERIFIED);
    expect(salon?.barbers.length).toBeGreaterThan(0);
    expect(salon?.services.length).toBeGreaterThan(0);

    // Pending salon returns null (Security Rule)
    const pendingSalon = await getSalonBySlug('royal-ustaad-mens-salon');
    expect(pendingSalon).toBeNull();

    // Missing slug returns null
    const nonExistent = await getSalonBySlug('non-existent-salon');
    expect(nonExistent).toBeNull();
  });
});

describe('Phase 1 Service Grouping & Calculation Logic', () => {
  const mockServices: Service[] = [
    {
      id: 'srv-1',
      salonId: 'salon-1',
      category: ServiceCategory.HAIR,
      name: 'Classic Haircut',
      nameHi: 'सादा बाल कटिंग',
      durationMin: 30,
      priceRupees: 100,
      homeVisitOk: true,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: 'srv-2',
      salonId: 'salon-1',
      category: ServiceCategory.HAIR,
      name: 'Layer Cut & Styling',
      nameHi: 'स्टाइलिश हेयरकट',
      durationMin: 45,
      priceRupees: 200,
      homeVisitOk: true,
      isActive: true,
      sortOrder: 2,
    },
    {
      id: 'srv-3',
      salonId: 'salon-1',
      category: ServiceCategory.BEARD,
      name: 'Beard Trim & Shape',
      nameHi: 'दाढ़ी सेटिंग',
      durationMin: 20,
      priceRupees: 60,
      homeVisitOk: true,
      isActive: true,
      sortOrder: 1,
    },
    {
      id: 'srv-4',
      salonId: 'salon-1',
      category: ServiceCategory.MASSAGE,
      name: 'Navratna Head Champi',
      nameHi: 'नवरत्न तेल चंपी',
      durationMin: 25,
      priceRupees: 120,
      homeVisitOk: true,
      isActive: true,
      sortOrder: 1,
    },
  ];

  it('groups services accurately by ServiceCategory', () => {
    const grouped = groupServicesByCategory(mockServices);

    expect(grouped[ServiceCategory.HAIR].length).toBe(2);
    expect(grouped[ServiceCategory.BEARD].length).toBe(1);
    expect(grouped[ServiceCategory.MASSAGE].length).toBe(1);
    expect(grouped[ServiceCategory.FACIAL].length).toBe(0);
  });

  it('calculates total price and duration accurately for multiple selected service IDs', () => {
    // Select Haircut (100 rs, 30 min) + Champi (120 rs, 25 min)
    const summary = calculateServicesSummary(mockServices, ['srv-1', 'srv-4']);

    expect(summary.serviceCount).toBe(2);
    expect(summary.totalPriceRupees).toBe(220);
    expect(summary.totalDurationMin).toBe(55);
    expect(summary.selectedServices.map((s) => s.id)).toEqual(['srv-1', 'srv-4']);
  });

  it('returns zero values when no services are selected', () => {
    const summary = calculateServicesSummary(mockServices, []);

    expect(summary.serviceCount).toBe(0);
    expect(summary.totalPriceRupees).toBe(0);
    expect(summary.totalDurationMin).toBe(0);
    expect(summary.selectedServices).toEqual([]);
  });
});

describe('Phase 1 Time Helpers Verification', () => {
  it('formats minutes from midnight into 12-hour AM/PM format', () => {
    expect(formatMinutesToTime(0)).toBe('12:00 AM');
    expect(formatMinutesToTime(570)).toBe('9:30 AM');
    expect(formatMinutesToTime(720)).toBe('12:00 PM');
    expect(formatMinutesToTime(1080)).toBe('6:00 PM');
    expect(formatMinutesToTime(1260)).toBe('9:00 PM');
  });

  it('correctly determines if salon is open or closed based on hours', () => {
    // Suppose hours: open 9:00 AM (540 min) to 9:00 PM (1260 min)
    const mockHours = [
      { weekday: 1, openMin: 540, closeMin: 1260, isClosed: false }, // Monday open
      { weekday: 2, openMin: 540, closeMin: 1260, isClosed: true },  // Tuesday closed
    ];

    // Create date for Monday 11:00 AM IST (UTC: 5:30 AM on Monday)
    const mondayOpenTime = new Date('2026-10-26T05:30:00.000Z'); // 11:00 AM IST on Monday (weekday 1)
    expect(isSalonOpenNow(mockHours, mondayOpenTime)).toBe(true);

    // Create date for Monday 10:00 PM IST (UTC: 4:30 PM on Monday, after 9pm close)
    const mondayNightTime = new Date('2026-10-26T16:30:00.000Z'); // 10:00 PM IST
    expect(isSalonOpenNow(mockHours, mondayNightTime)).toBe(false);

    // Create date for Tuesday 11:00 AM IST (closed day)
    const tuesdayTime = new Date('2026-10-27T05:30:00.000Z');
    expect(isSalonOpenNow(mockHours, tuesdayTime)).toBe(false);
  });
});
