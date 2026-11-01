import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../lib/db';
import { BookingStatus, BookingType, BookingSource } from '@prisma/client';

describe('Database Constraints & Exclusion Rules (PostgreSQL Supabase)', () => {
  // Safety guard: Refuse to run against production database
  beforeAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run DB tests when APP_ENV or NODE_ENV is production');
    }
  });

  const testDate = new Date('2099-01-15T00:00:00.000Z');
  let testSalonId: string;
  let testBarberId: string;
  let testCustomerId: string;
  const createdBookingIds: string[] = [];

  beforeAll(async () => {
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
      throw new Error('Seed data required: No customer user found');
    }
    testCustomerId = customer.id;
  });

  afterEach(async () => {
    if (createdBookingIds.length > 0) {
      await db.bookingItem.deleteMany({
        where: { bookingId: { in: createdBookingIds } },
      });
      await db.booking.deleteMany({
        where: { id: { in: createdBookingIds } },
      });
      createdBookingIds.length = 0;
    }
  });

  afterAll(async () => {
    await db.booking.deleteMany({
      where: { tokenDate: testDate },
    });
    await db.dailyTokenCounter.deleteMany({
      where: { date: testDate },
    });
    await db.$disconnect();
  });

  // 1. Overlapping active bookings rejected (Postgres error code 23P01)
  it('rejects two overlapping active bookings for the same barber with Postgres error 23P01', async () => {
    const startsAt1 = new Date('2099-01-15T10:00:00.000Z');
    const endsAt1 = new Date('2099-01-15T10:45:00.000Z');

    const b1 = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 501,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CONFIRMED,
        startsAt: startsAt1,
        endsAt: endsAt1,
        totalRupees: 120,
      },
    });
    createdBookingIds.push(b1.id);

    // Overlapping slot: 10:30 to 11:15 overlaps 10:00 to 10:45
    const startsAt2 = new Date('2099-01-15T10:30:00.000Z');
    const endsAt2 = new Date('2099-01-15T11:15:00.000Z');

    let threwError = false;
    let is23P01 = false;

    try {
      await db.booking.create({
        data: {
          salonId: testSalonId,
          barberId: testBarberId,
          customerId: testCustomerId,
          token: 502,
          tokenDate: testDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: startsAt2,
          endsAt: endsAt2,
          totalRupees: 120,
        },
      });
    } catch (err: unknown) {
      threwError = true;
      const errorStr = JSON.stringify(err) + String(err);
      is23P01 = errorStr.includes('23P01') || errorStr.includes('booking_no_overlap');
    }

    expect(threwError).toBe(true);
    expect(is23P01).toBe(true);
  });

  // 2. Back-to-back bookings (one ends exactly when next starts) are allowed
  it('allows back-to-back bookings where one ends exactly when the next starts', async () => {
    const slot1Start = new Date('2099-01-15T11:00:00.000Z');
    const slot1End = new Date('2099-01-15T11:30:00.000Z');

    const b1 = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 503,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CONFIRMED,
        startsAt: slot1Start,
        endsAt: slot1End,
        totalRupees: 100,
      },
    });
    createdBookingIds.push(b1.id);

    // Exact back-to-back: starts at slot1End (11:30)
    const slot2Start = slot1End;
    const slot2End = new Date('2099-01-15T12:00:00.000Z');

    const b2 = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 504,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CONFIRMED,
        startsAt: slot2Start,
        endsAt: slot2End,
        totalRupees: 100,
      },
    });
    createdBookingIds.push(b2.id);

    expect(b1.id).toBeDefined();
    expect(b2.id).toBeDefined();
  });

  // 3. A cancelled booking does not block the same slot
  it('allows a new booking on a slot that was previously CANCELLED', async () => {
    const slotStart = new Date('2099-01-15T14:00:00.000Z');
    const slotEnd = new Date('2099-01-15T14:45:00.000Z');

    // Create cancelled booking
    const cancelledBooking = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 505,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CANCELLED,
        startsAt: slotStart,
        endsAt: slotEnd,
        totalRupees: 150,
      },
    });
    createdBookingIds.push(cancelledBooking.id);

    // Create active confirmed booking covering identical slot
    const activeBooking = await db.booking.create({
      data: {
        salonId: testSalonId,
        barberId: testBarberId,
        customerId: testCustomerId,
        token: 506,
        tokenDate: testDate,
        type: BookingType.IN_SALON,
        source: BookingSource.ONLINE,
        status: BookingStatus.CONFIRMED,
        startsAt: slotStart,
        endsAt: slotEnd,
        totalRupees: 150,
      },
    });
    createdBookingIds.push(activeBooking.id);

    expect(activeBooking.id).toBeDefined();
    expect(activeBooking.status).toBe(BookingStatus.CONFIRMED);
  });

  // 4. A booking with endsAt <= startsAt is rejected by check constraint
  it('rejects a booking where endsAt <= startsAt with check constraint error', async () => {
    const slotStart = new Date('2099-01-15T16:00:00.000Z');
    // endsAt is earlier than startsAt
    const invalidEnd = new Date('2099-01-15T15:30:00.000Z');

    let threwError = false;
    let isTimeOrderViolation = false;

    try {
      await db.booking.create({
        data: {
          salonId: testSalonId,
          barberId: testBarberId,
          customerId: testCustomerId,
          token: 507,
          tokenDate: testDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: slotStart,
          endsAt: invalidEnd,
          totalRupees: 100,
        },
      });
    } catch (err: unknown) {
      threwError = true;
      const errorStr = JSON.stringify(err) + String(err);
      isTimeOrderViolation =
        errorStr.includes('booking_time_order') ||
        errorStr.includes('23514'); // Postgres check violation code
    }

    expect(threwError).toBe(true);
    expect(isTimeOrderViolation).toBe(true);
  });
});
