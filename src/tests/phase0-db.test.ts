import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db';
import { BookingStatus, BookingType, BookingSource } from '@prisma/client';

describe('Phase 0 Database & Constraint Verification', () => {
  beforeAll(async () => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run DB tests when APP_ENV or NODE_ENV is production');
    }
    const salon = await db.salon.findFirst({
      where: { status: 'VERIFIED' },
      include: { barbers: true },
    });
    if (!salon || salon.barbers.length === 0) {
      throw new Error('Seed data required: No verified salon or barber found');
    }
    testSalonId = salon.id;
    testBarberId = salon.barbers[0].id;

    const customer = await db.user.findFirst({
      where: { role: 'CUSTOMER' },
    });
    if (!customer) {
      throw new Error('Seed data required: No customer found');
    }
    testCustomerId = customer.id;
  });
  const testDate = new Date('2099-12-31T00:00:00.000Z');
  let testSalonId: string;
  let testBarberId: string;
  let testCustomerId: string;
  let createdBookingId: string | null = null;

  afterAll(async () => {
    // Clean up test bookings and tokens
    if (createdBookingId) {
      await db.bookingItem.deleteMany({ where: { bookingId: createdBookingId } });
      await db.booking.deleteMany({ where: { id: createdBookingId } });
    }
    await db.booking.deleteMany({
      where: {
        tokenDate: testDate,
      },
    });
    await db.dailyTokenCounter.deleteMany({
      where: {
        date: testDate,
      },
    });
    await db.$disconnect();
  });

  it('verifies seeded salons, barbers and services exist', async () => {
    const salons = await db.salon.findMany({
      include: {
        barbers: true,
        services: true,
      },
    });

    expect(salons.length).toBeGreaterThanOrEqual(2);

    const verifiedSalon = salons.find((s) => s.slug === 'sharma-ji-gents-parlour');
    expect(verifiedSalon).toBeDefined();
    expect(verifiedSalon?.status).toBe('VERIFIED');
    expect(verifiedSalon?.barbers.length).toBeGreaterThanOrEqual(3);
    expect(verifiedSalon?.services.length).toBeGreaterThanOrEqual(10);

    const pendingSalon = salons.find((s) => s.slug === 'royal-ustaad-mens-salon');
    expect(pendingSalon).toBeDefined();
    expect(pendingSalon?.status).toBe('PENDING');

    testSalonId = verifiedSalon!.id;
    testBarberId = verifiedSalon!.barbers[0].id;

    const customer = await db.user.findFirst({
      where: { role: 'CUSTOMER' },
    });
    expect(customer).toBeDefined();
    testCustomerId = customer!.id;
  });

  it('rejects overlapping CONFIRMED bookings with Postgres exclusion constraint 23P01 (booking_no_overlap)', async () => {
    const startsAt1 = new Date('2099-12-31T10:00:00.000Z');
    const endsAt1 = new Date('2099-12-31T10:45:00.000Z');

    // 1. Insert initial CONFIRMED booking
    const booking1 = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 101,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CONFIRMED,
        startsAt: startsAt1,
        endsAt: endsAt1,
        totalRupees: 150,
      },
    });
    createdBookingId = booking1.id;
    expect(booking1.id).toBeDefined();

    // 2. Attempt to insert overlapping CONFIRMED booking for same barber (10:30 to 11:00 overlaps with 10:00 to 10:45)
    const startsAt2 = new Date('2099-12-31T10:30:00.000Z');
    const endsAt2 = new Date('2099-12-31T11:00:00.000Z');

    let threwError = false;
    let errorCode: string | undefined;
    let errorMessage = '';

    try {
      await db.booking.create({
        data: {
          salonId: testSalonId,
          barberId: testBarberId,
          customerId: testCustomerId,
          token: 102,
          tokenDate: testDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: startsAt2,
          endsAt: endsAt2,
          totalRupees: 150,
        },
      });
    } catch (error: unknown) {
      threwError = true;
      const err = error as { code?: string; meta?: { code?: string; message?: string }; message: string };
      errorCode = err.meta?.code || err.code;
      errorMessage = err.message || '';
    }

    expect(threwError).toBe(true);
    // Postgres exclusion constraint error code is 23P01
    const isExclusionViolation =
      errorCode === '23P01' ||
      errorMessage.includes('23P01') ||
      errorMessage.includes('booking_no_overlap');

    expect(isExclusionViolation).toBe(true);
  });
});
