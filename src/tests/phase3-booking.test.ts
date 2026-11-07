import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../lib/db';
import { Role, VerificationStatus, BookingStatus, ServiceCategory, User, Salon, Barber, Service } from '@prisma/client';
import {
  canCreateBooking,
  canRescheduleBooking,
  PolicyUser,
} from '../lib/policies';
import {
  createBooking,
  cancelBooking,
  rescheduleBooking,
  getBookingForUser,
} from '../lib/booking-service';
import {
  getNextIstDates,
  istToUtcDate,
  toTokenDateUtc,
  utcToIstDetails,
} from '../lib/time';

describe('Phase 3: Real Slot Booking & Policy Tests', () => {
  // Safety guard
  beforeAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run DB tests when APP_ENV or NODE_ENV is production');
    }
  });

  // ----------------------------------------------------------------
  // 1. Policy Unit Tests
  // ----------------------------------------------------------------
  describe('Policy: canCreateBooking', () => {
    it('allows active CUSTOMER to create booking', () => {
      const customer: PolicyUser = { id: 'cust-1', role: Role.CUSTOMER, isActive: true };
      expect(canCreateBooking(customer)).toBe(true);
    });

    it('denies inactive CUSTOMER', () => {
      const customer: PolicyUser = { id: 'cust-2', role: Role.CUSTOMER, isActive: false };
      expect(canCreateBooking(customer)).toBe(false);
    });

    it('denies BARBER, OWNER, ADMIN from creating customer bookings', () => {
      const barber: PolicyUser = { id: 'barb-1', role: Role.BARBER, isActive: true };
      const owner: PolicyUser = { id: 'own-1', role: Role.OWNER, isActive: true };
      const admin: PolicyUser = { id: 'adm-1', role: Role.ADMIN, isActive: true };

      expect(canCreateBooking(barber)).toBe(false);
      expect(canCreateBooking(owner)).toBe(false);
      expect(canCreateBooking(admin)).toBe(false);
    });

    it('denies unauthenticated or null user', () => {
      expect(canCreateBooking(null)).toBe(false);
      expect(canCreateBooking(undefined)).toBe(false);
    });
  });

  describe('Policy: canRescheduleBooking', () => {
    const booking = {
      id: 'bk-1',
      customerId: 'cust-1',
      barberId: 'barb-1',
      barberUserId: 'barb-user-1',
      salonId: 'salon-1',
      salonOwnerId: 'owner-1',
    };

    it('allows the customer who owns the booking', () => {
      const customer: PolicyUser = { id: 'cust-1', role: Role.CUSTOMER, isActive: true };
      expect(canRescheduleBooking(customer, booking)).toBe(true);
    });

    it('denies another customer from rescheduling', () => {
      const otherCustomer: PolicyUser = { id: 'cust-2', role: Role.CUSTOMER, isActive: true };
      expect(canRescheduleBooking(otherCustomer, booking)).toBe(false);
    });

    it('denies assigned barber and salon owner (customer self-serve only)', () => {
      const barber: PolicyUser = { id: 'barb-user-1', role: Role.BARBER, isActive: true };
      const owner: PolicyUser = { id: 'owner-1', role: Role.OWNER, isActive: true };
      expect(canRescheduleBooking(barber, booking)).toBe(false);
      expect(canRescheduleBooking(owner, booking)).toBe(false);
    });

    it('allows ADMIN to reschedule', () => {
      const admin: PolicyUser = { id: 'adm-1', role: Role.ADMIN, isActive: true };
      expect(canRescheduleBooking(admin, booking)).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // 2. Integration Tests: Concurrency, Limits, Cancel & Reschedule
  // ----------------------------------------------------------------
  describe('Booking Integration & Concurrency on Supabase', () => {
    let testOwner: User;
    let testBarberUser: User;
    let testSalon: Salon;
    let testBarber: Barber;
    let testService: Service;
    let customer1: User;
    let customer2: User;
    let customer3: User;
    let customer4: User;
    let customer5: User;
    let targetDateIst: string;
    const testCustomers: User[] = [];


    beforeAll(async () => {
      const ts = Date.now();

      // Create isolated test owner and salon
      testOwner = await db.user.create({
        data: {
          phone: `+919999${String(ts).slice(-6)}`,
          name: 'Phase 3 Test Owner',
          role: Role.OWNER,
          isActive: true,
        },
      });

      testSalon = await db.salon.create({
        data: {
          slug: `test-salon-${ts}`,
          name: 'Test Concurrency Salon',
          status: VerificationStatus.VERIFIED,
          ownerId: testOwner.id,
          addressLine: '123 Test St',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
        },
      });

      // Salon open all 7 days: 09:00 to 21:00 (540 to 1260)
      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: {
            salonId: testSalon.id,
            weekday: day,
            openMin: 540,
            closeMin: 1260,
            isClosed: false,
          },
        });
      }

      // Create isolated test barber
      testBarberUser = await db.user.create({
        data: {
          phone: `+919998${String(ts).slice(-6)}`,
          name: 'Phase 3 Test Barber',
          role: Role.BARBER,
          isActive: true,
        },
      });

      testBarber = await db.barber.create({
        data: {
          userId: testBarberUser.id,
          salonId: testSalon.id,
          displayName: 'Ustaad Test',
          status: VerificationStatus.VERIFIED,
          isActive: true,
        },
      });

      // Barber available all 7 days: 09:00 to 21:00
      for (let day = 0; day < 7; day++) {
        await db.availability.create({
          data: {
            barberId: testBarber.id,
            weekday: day,
            startMin: 540,
            endMin: 1260,
          },
        });
      }

      // Create test service
      testService = await db.service.create({
        data: {
          salonId: testSalon.id,
          name: 'Test Haircut',
          category: ServiceCategory.HAIR,
          durationMin: 30,
          priceRupees: 100,
          isActive: true,
        },
      });

      await db.barberService.create({
        data: {
          barberId: testBarber.id,
          serviceId: testService.id,
        },
      });

      // Target IST date: 5 days ahead
      const nextDates = getNextIstDates(10, new Date());
      targetDateIst = nextDates[4]; // 5th date

      // Create 5 test customers
      for (let i = 0; i < 5; i++) {
        const cust = await db.user.create({
          data: {
            phone: `+919997${String(ts + i).slice(-6)}`,
            name: `Test Race Cust ${i + 1}`,
            role: Role.CUSTOMER,
            isActive: true,
          },
        });
        testCustomers.push(cust);
      }

      [customer1, customer2, customer3, customer4, customer5] = testCustomers;
    }, 30000);

    const extraCustomerIds: string[] = [];
    let extraSeq = 1;
    async function createFreshCustomer(name = 'Rule Customer'): Promise<User> {
      const ts = Date.now();
      const user = await db.user.create({
        data: {
          phone: `+919991${String(ts + extraSeq++).slice(-6)}`,
          name: `${name} ${extraSeq}`,
          role: Role.CUSTOMER,
          isActive: true,
        },
      });
      extraCustomerIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      // Clean up isolated test entities
      if (testSalon?.id) {
        await db.bookingItem.deleteMany({ where: { booking: { salonId: testSalon.id } } });
        await db.booking.deleteMany({ where: { salonId: testSalon.id } });
        await db.dailyTokenCounter.deleteMany({ where: { salonId: testSalon.id } });
        await db.barberService.deleteMany({ where: { barberId: testBarber.id } });
        await db.availability.deleteMany({ where: { barberId: testBarber.id } });
        await db.service.deleteMany({ where: { salonId: testSalon.id } });
        await db.barber.deleteMany({ where: { salonId: testSalon.id } });
        await db.salonHours.deleteMany({ where: { salonId: testSalon.id } });
        await db.salon.deleteMany({ where: { id: testSalon.id } });
      }

      if (testOwner?.id) {
        // Delete any other salons created under testOwner during tests
        await db.salonHours.deleteMany({ where: { salon: { ownerId: testOwner.id } } });
        await db.service.deleteMany({ where: { salon: { ownerId: testOwner.id } } });
        await db.salon.deleteMany({ where: { ownerId: testOwner.id } });
      }

      const userIdsToDelete = [
        testOwner?.id,
        testBarberUser?.id,
        ...testCustomers.map((c) => c.id),
        ...extraCustomerIds,
      ].filter(Boolean);

      if (userIdsToDelete.length > 0) {
        await db.bookingItem.deleteMany({ where: { booking: { customerId: { in: userIdsToDelete } } } });
        await db.booking.deleteMany({ where: { customerId: { in: userIdsToDelete } } });
        await db.user.deleteMany({ where: { id: { in: userIdsToDelete } } });
      }
    }, 30000);

    // --------------------------------------------------------------
    // Test A: 5-way Parallel Concurrency Race Test
    // --------------------------------------------------------------
    it('prevents double booking in a 5-way parallel race (exactly 1 wins, 4 get SLOT_TAKEN)', async () => {
      // Slot at 2:00 PM IST (840 min)
      const raceSlotStartsAt = istToUtcDate(targetDateIst, 840);
      const allCustomers = [customer1, customer2, customer3, customer4, customer5];

      // Fire 5 booking creation calls simultaneously
      const results = await Promise.all(
        allCustomers.map((cust) =>
          createBooking({
            customerId: cust.id,
            salonId: testSalon.id,
            barberId: testBarber.id,
            serviceIds: [testService.id],
            startsAt: raceSlotStartsAt,
          })
        )
      );

      const successes = results.filter((r) => r.ok);
      const slotTakens = results.filter((r) => !r.ok && r.code === 'SLOT_TAKEN');

      expect(successes.length).toBe(1);
      expect(slotTakens.length).toBe(4);

      // Verify that database has exactly 1 booking for this slot
      const inDbCount = await db.booking.count({
        where: {
          barberId: testBarber.id,
          startsAt: raceSlotStartsAt,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        },
      });
      expect(inDbCount).toBe(1);
    }, 25000);

    // --------------------------------------------------------------
    // Test B: Customer Active Bookings Limit (MAX = 5)
    // --------------------------------------------------------------
    it('enforces MAX_ACTIVE_BOOKINGS_PER_CUSTOMER limit', async () => {
      const baseStartsAt = istToUtcDate(targetDateIst, 570); // 09:30 AM IST

      // Create 5 future active bookings for customer3
      const tempIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const slot = new Date(baseStartsAt.getTime() + i * 30 * 60 * 1000);
        const b = await db.booking.create({
          data: {
            token: 100 + i,
            tokenDate: toTokenDateUtc(targetDateIst),
            salonId: testSalon.id,
            barberId: testBarber.id,
            customerId: customer3.id,
            status: BookingStatus.CONFIRMED,
            startsAt: slot,
            endsAt: new Date(slot.getTime() + 15 * 60 * 1000),
            totalRupees: 100,
          },
        });
        tempIds.push(b.id);
      }

      // Attempt 6th active booking
      const slot6 = new Date(baseStartsAt.getTime() + 8 * 60 * 60 * 1000);
      const res = await createBooking({
        customerId: customer3.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot6,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('ACTIVE_LIMIT_EXCEEDED');
      }

      // Cleanup temp bookings
      await db.booking.deleteMany({ where: { id: { in: tempIds } } });
    });

    // --------------------------------------------------------------
    // Test C: Customer Overlapping Booking Prevention
    // --------------------------------------------------------------
    it('prevents customer from booking overlapping slots across any barber or salon', async () => {
      const slotStart = istToUtcDate(targetDateIst, 660); // 11:00 AM IST
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000); // 11:30 AM IST

      // Create first booking for customer4
      await db.booking.create({
        data: {
          token: 201,
          tokenDate: toTokenDateUtc(targetDateIst),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer4.id,
          status: BookingStatus.CONFIRMED,
          startsAt: slotStart,
          endsAt: slotEnd,
          totalRupees: 100,
        },
      });

      // Customer attempts to book overlapping slot (11:15 AM to 11:45 AM)
      const overlapStart = new Date(slotStart.getTime() + 15 * 60 * 1000);
      const overlapRes = await createBooking({
        customerId: customer4.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: overlapStart,
      });

      expect(overlapRes.ok).toBe(false);
      if (!overlapRes.ok) {
        expect(overlapRes.code).toBe('CUSTOMER_OVERLAP');
      }
    });

    // --------------------------------------------------------------
    // Test D: Cancellation Policy & 60-Minute Cutoff
    // --------------------------------------------------------------
    it('allows customer to cancel > 60 min before start, but rejects within 60 min cutoff', async () => {
      const now = new Date();

      // Booking A: 2 hours in the future
      const farSlot = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const bookingA = await db.booking.create({
        data: {
          token: 301,
          tokenDate: toTokenDateUtc(now),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer1.id,
          status: BookingStatus.CONFIRMED,
          startsAt: farSlot,
          endsAt: new Date(farSlot.getTime() + 30 * 60 * 1000),
          totalRupees: 100,
        },
      });

      const cancelFarRes = await cancelBooking({
        actor: { id: customer1.id, role: Role.CUSTOMER, isActive: true },
        bookingId: bookingA.id,
        reason: 'Change of plan',
        now,
      });

      expect(cancelFarRes.ok).toBe(true);
      if (cancelFarRes.ok) {
        expect(cancelFarRes.data.status).toBe(BookingStatus.CANCELLED);
      }

      // Booking B: 30 minutes in the future (inside 60-min cutoff)
      const nearSlot = new Date(now.getTime() + 30 * 60 * 1000);
      const bookingB = await db.booking.create({
        data: {
          token: 302,
          tokenDate: toTokenDateUtc(now),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer1.id,
          status: BookingStatus.CONFIRMED,
          startsAt: nearSlot,
          endsAt: new Date(nearSlot.getTime() + 30 * 60 * 1000),
          totalRupees: 100,
        },
      });

      const cancelNearCustomerRes = await cancelBooking({
        actor: { id: customer1.id, role: Role.CUSTOMER, isActive: true },
        bookingId: bookingB.id,
        now,
      });

      expect(cancelNearCustomerRes.ok).toBe(false);
      if (!cancelNearCustomerRes.ok) {
        expect(cancelNearCustomerRes.code).toBe('CUTOFF_PASSED');
      }

      // Staff (owner) CAN cancel even within 60 min
      const cancelNearOwnerRes = await cancelBooking({
        actor: { id: testSalon.ownerId, role: Role.OWNER, isActive: true },
        bookingId: bookingB.id,
        reason: 'Barber emergency',
        now,
      });

      expect(cancelNearOwnerRes.ok).toBe(true);
    });

    // --------------------------------------------------------------
    // Test E: Reschedule Transaction & Rollback Safety
    // --------------------------------------------------------------
    it('reschedules successfully inside a transaction, and rolls back if new slot is taken', async () => {
      const now = new Date();
      // Setup original booking at 09:30 AM on target date
      const origStart = istToUtcDate(targetDateIst, 570);
      const origEnd = new Date(origStart.getTime() + testService.durationMin * 60 * 1000);

      const origBooking = await db.booking.create({
        data: {
          token: 401,
          tokenDate: toTokenDateUtc(targetDateIst),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer2.id,
          status: BookingStatus.CONFIRMED,
          startsAt: origStart,
          endsAt: origEnd,
          totalRupees: testService.priceRupees,
          items: {
            create: [
              {
                serviceId: testService.id,
                priceRupees: testService.priceRupees,
                durationMin: testService.durationMin,
              },
            ],
          },
        },
      });

      // Successful Reschedule to 10:00 AM (600 min)
      const newStart = istToUtcDate(targetDateIst, 600);
      const reschedRes = await rescheduleBooking({
        actor: { id: customer2.id, role: Role.CUSTOMER, isActive: true },
        bookingId: origBooking.id,
        newStartsAt: newStart,
        now,
      });

      expect(reschedRes.ok).toBe(true);
      if (reschedRes.ok) {
        expect(reschedRes.data.startsAt.getTime()).toBe(newStart.getTime());

        // Verify old booking is marked CANCELLED with cancelReason RESCHEDULED
        const oldRefetched = await db.booking.findUnique({
          where: { id: origBooking.id },
        });
        expect(oldRefetched?.status).toBe(BookingStatus.CANCELLED);
        expect(oldRefetched?.cancelReason).toBe('RESCHEDULED');
      }

      // Now create a blocker booking at 10:30 AM (630 min)
      const blockerStart = istToUtcDate(targetDateIst, 630);
      await db.booking.create({
        data: {
          token: 402,
          tokenDate: toTokenDateUtc(targetDateIst),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer1.id,
          status: BookingStatus.CONFIRMED,
          startsAt: blockerStart,
          endsAt: new Date(blockerStart.getTime() + 30 * 60 * 1000),
          totalRupees: 100,
        },
      });

      // Try to reschedule current active booking to 10:30 AM (which is blocked by blockerBooking)
      const currentActiveId = reschedRes.ok ? reschedRes.data.id : '';
      const failResched = await rescheduleBooking({
        actor: { id: customer2.id, role: Role.CUSTOMER, isActive: true },
        bookingId: currentActiveId,
        newStartsAt: blockerStart,
        now,
      });

      expect(failResched.ok).toBe(false);
      if (!failResched.ok) {
        expect(failResched.code).toBe('SLOT_TAKEN');
      }

      // Verify that currentActiveId was NOT cancelled because transaction rolled back!
      const currentStillActive = await db.booking.findUnique({
        where: { id: currentActiveId },
      });
      expect(currentStillActive?.status).toBe(BookingStatus.CONFIRMED);
    });

    // --------------------------------------------------------------
    // Test F: getBookingForUser Authorization
    // --------------------------------------------------------------
    it('strictly isolates booking access between customers and barbers', async () => {
      const slotStart = istToUtcDate(targetDateIst, 780);
      const testBooking = await db.booking.create({
        data: {
          token: 501,
          tokenDate: toTokenDateUtc(targetDateIst),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: customer1.id,
          status: BookingStatus.CONFIRMED,
          startsAt: slotStart,
          endsAt: new Date(slotStart.getTime() + 30 * 60 * 1000),
          totalRupees: 100,
        },
      });

      // Owner customer can view
      const ownerView = await getBookingForUser(
        { id: customer1.id, role: Role.CUSTOMER, isActive: true },
        testBooking.id
      );
      expect(ownerView).not.toBeNull();
      expect(ownerView?.id).toBe(testBooking.id);

      // Other customer gets null
      const otherView = await getBookingForUser(
        { id: customer2.id, role: Role.CUSTOMER, isActive: true },
        testBooking.id
      );
      expect(otherView).toBeNull();

      // Assigned barber can view
      const barberView = await getBookingForUser(
        { id: testBarber.userId, role: Role.BARBER, isActive: true },
        testBooking.id
      );
      expect(barberView).not.toBeNull();

      // Salon owner can view
      const salonOwnerView = await getBookingForUser(
        { id: testSalon.ownerId, role: Role.OWNER, isActive: true },
        testBooking.id
      );
      expect(salonOwnerView).not.toBeNull();
    });

    // --------------------------------------------------------------
    // Comprehensive Booking Service Rule Tests (Rules 1 to 17)
    // --------------------------------------------------------------
    it('Rule 1: rejects booking requests for off-grid start times (e.g. 10:07)', async () => {
      const cust = await createFreshCustomer('Rule 1');
      const offGridStart = istToUtcDate(targetDateIst, 607);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: offGridStart,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
        expect(res.message).toBe('Please pick a time from the list.');
      }
    });

    it('Rule 2: rejects booking requests for times outside operational salon or barber hours', async () => {
      const cust = await createFreshCustomer('Rule 2');
      const afterHoursStart = istToUtcDate(targetDateIst, 1275);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: afterHoursStart,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
        expect(res.message).toContain('outside');
      }
    });

    it('Rule 3: rejects booking requests in the past or beyond the 14-day advance window', async () => {
      const cust = await createFreshCustomer('Rule 3');
      const now = new Date();
      const pastStart = new Date(now.getTime() - 30 * 60 * 1000);
      const pastRes = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: pastStart,
        now,
      });
      expect(pastRes.ok).toBe(false);
      if (!pastRes.ok) {
        expect(pastRes.code).toBe('INVALID_INPUT');
      }

      const future16Days = new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000);
      const { dateIst: future16DateIst } = utcToIstDetails(future16Days);
      const futureStart = istToUtcDate(future16DateIst, 600);
      const futureRes = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: futureStart,
        now,
      });
      expect(futureRes.ok).toBe(false);
      if (!futureRes.ok) {
        expect(futureRes.code).toBe('INVALID_INPUT');
        expect(futureRes.message).toContain('14 days');
      }
    });

    it('Rule 4: rejects services belonging to a different salon', async () => {
      const cust = await createFreshCustomer('Rule 4');
      const foreignSalon = await db.salon.create({
        data: {
          slug: `foreign-salon-${Date.now()}`,
          name: 'Foreign Salon',
          status: VerificationStatus.VERIFIED,
          ownerId: testOwner.id,
          addressLine: '456 Foreign Rd',
          area: 'Koramangala',
          city: 'Bengaluru',
          pincode: '560034',
        },
      });
      const foreignService = await db.service.create({
        data: {
          salonId: foreignSalon.id,
          name: 'Foreign Shave',
          category: ServiceCategory.BEARD,
          durationMin: 15,
          priceRupees: 80,
          isActive: true,
        },
      });

      const start = istToUtcDate(targetDateIst, 720);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [foreignService.id],
        startsAt: start,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
      }

      await db.service.delete({ where: { id: foreignService.id } });
      await db.salon.delete({ where: { id: foreignSalon.id } });
    });

    it('Rule 5: rejects barbers not mapped to all selected services via BarberService', async () => {
      const cust = await createFreshCustomer('Rule 5');
      const unmappedService = await db.service.create({
        data: {
          salonId: testSalon.id,
          name: 'Unmapped Massage',
          category: ServiceCategory.MASSAGE,
          durationMin: 45,
          priceRupees: 300,
          isActive: true,
        },
      });

      const start = istToUtcDate(targetDateIst, 720);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id, unmappedService.id],
        startsAt: start,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
      }

      await db.service.delete({ where: { id: unmappedService.id } });
    });

    it('Rule 6: rejects unverified, rejected, or suspended salons and barbers', async () => {
      const cust = await createFreshCustomer('Rule 6');
      const pendingSalon = await db.salon.create({
        data: {
          slug: `pending-salon-${Date.now()}`,
          name: 'Pending Salon',
          status: VerificationStatus.PENDING,
          ownerId: testOwner.id,
          addressLine: '789 Pending St',
          area: 'Jayanagar',
          city: 'Bengaluru',
          pincode: '560041',
        },
      });

      const start = istToUtcDate(targetDateIst, 720);
      const res = await createBooking({
        customerId: cust.id,
        salonId: pendingSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: start,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('NOT_FOUND');
      }

      await db.salon.delete({ where: { id: pendingSalon.id } });
    });

    it('Rule 7: rejects inactive services (isActive: false)', async () => {
      const cust = await createFreshCustomer('Rule 7');
      const inactiveService = await db.service.create({
        data: {
          salonId: testSalon.id,
          name: 'Inactive Facial',
          category: ServiceCategory.FACIAL,
          durationMin: 30,
          priceRupees: 200,
          isActive: false,
        },
      });
      await db.barberService.create({
        data: { barberId: testBarber.id, serviceId: inactiveService.id },
      });

      const start = istToUtcDate(targetDateIst, 720);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [inactiveService.id],
        startsAt: start,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('INVALID_INPUT');
      }

      await db.barberService.deleteMany({ where: { serviceId: inactiveService.id } });
      await db.service.delete({ where: { id: inactiveService.id } });
    });

    it('Rule 8: rejects empty services array and duplicate service IDs', async () => {
      const cust = await createFreshCustomer('Rule 8');
      const start = istToUtcDate(targetDateIst, 720);

      const emptyRes = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [],
        startsAt: start,
      });
      expect(emptyRes.ok).toBe(false);
      if (!emptyRes.ok) expect(emptyRes.code).toBe('INVALID_INPUT');

      const dupRes = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id, testService.id],
        startsAt: start,
      });
      expect(dupRes.ok).toBe(false);
      if (!dupRes.ok) {
        expect(dupRes.code).toBe('INVALID_INPUT');
        expect(dupRes.message).toContain('Duplicate');
      }
    });

    it('Rule 9: computes tamper-proof pricing and duration solely from database records', async () => {
      const cust = await createFreshCustomer('Rule 9');
      const slotStart = istToUtcDate(targetDateIst, 750);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slotStart,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.totalRupees).toBe(testService.priceRupees);
        expect(res.data.items[0].priceRupees).toBe(testService.priceRupees);
        expect(res.data.items[0].durationMin).toBe(testService.durationMin);
        const expectedEnd = new Date(slotStart.getTime() + testService.durationMin * 60 * 1000);
        expect(res.data.endsAt.getTime()).toBe(expectedEnd.getTime());

        await db.bookingItem.deleteMany({ where: { bookingId: res.data.id } });
        await db.booking.delete({ where: { id: res.data.id } });
      }
    });

    it('Rule 10 & 11: allocates sequential daily tokens and rolls back counter on transaction failure', async () => {
      const custA = await createFreshCustomer('Rule 10 A');
      const custB = await createFreshCustomer('Rule 10 B');
      const slot1 = istToUtcDate(targetDateIst, 900);
      const slot2 = istToUtcDate(targetDateIst, 930);

      const b1 = await createBooking({
        customerId: custA.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot1,
      });
      expect(b1.ok).toBe(true);
      const token1 = b1.ok ? b1.data.token : 0;

      const failed = await createBooking({
        customerId: custB.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot1,
      });
      expect(failed.ok).toBe(false);

      const b2 = await createBooking({
        customerId: custB.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot2,
      });
      expect(b2.ok).toBe(true);
      const token2 = b2.ok ? b2.data.token : 0;
      expect(token2).toBe(token1 + 1);

      if (b1.ok) {
        await db.bookingItem.deleteMany({ where: { bookingId: b1.data.id } });
        await db.booking.delete({ where: { id: b1.data.id } });
      }
      if (b2.ok) {
        await db.bookingItem.deleteMany({ where: { bookingId: b2.data.id } });
        await db.booking.delete({ where: { id: b2.data.id } });
      }
    });

    it('Rule 12: creates bookings with status PENDING when salon.requiresApproval is true', async () => {
      const cust = await createFreshCustomer('Rule 12');
      await db.salon.update({
        where: { id: testSalon.id },
        data: { requiresApproval: true },
      });

      const slot = istToUtcDate(targetDateIst, 960);
      const res = await createBooking({
        customerId: cust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe(BookingStatus.PENDING);

        await db.bookingItem.deleteMany({ where: { bookingId: res.data.id } });
        await db.booking.delete({ where: { id: res.data.id } });
      }

      await db.salon.update({
        where: { id: testSalon.id },
        data: { requiresApproval: false },
      });
    });

    it('Rule 13: blocks customers exceeding MAX_BOOKINGS_CREATED_PER_HOUR (5 bookings/hour)', async () => {
      const now = new Date();
      const rateLimitCust = await createFreshCustomer('Rule 13 Cust');
      const tempBookingIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const slot = istToUtcDate(targetDateIst, 1000 + i * 30);
        const b = await db.booking.create({
          data: {
            token: 600 + i,
            tokenDate: toTokenDateUtc(targetDateIst),
            salonId: testSalon.id,
            barberId: testBarber.id,
            customerId: rateLimitCust.id,
            status: BookingStatus.CANCELLED,
            startsAt: slot,
            endsAt: new Date(slot.getTime() + 15 * 60 * 1000),
            totalRupees: 100,
            createdAt: new Date(now.getTime() - (i + 1) * 60 * 1000),
          },
        });
        tempBookingIds.push(b.id);
      }

      const slot6 = istToUtcDate(targetDateIst, 1185);
      const res = await createBooking({
        customerId: rateLimitCust.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot6,
        now,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('RATE_LIMIT_EXCEEDED');
      }

      await db.booking.deleteMany({ where: { id: { in: tempBookingIds } } });
    });

    it('Rule 14: allows staff to cancel at any time with mandatory non-empty reason; rejects empty reason', async () => {
      const cust = await createFreshCustomer('Rule 14');
      const now = new Date();
      const nearSlot = new Date(now.getTime() + 20 * 60 * 1000);

      const booking = await db.booking.create({
        data: {
          token: 701,
          tokenDate: toTokenDateUtc(now),
          salonId: testSalon.id,
          barberId: testBarber.id,
          customerId: cust.id,
          status: BookingStatus.CONFIRMED,
          startsAt: nearSlot,
          endsAt: new Date(nearSlot.getTime() + 30 * 60 * 1000),
          totalRupees: 100,
        },
      });

      const emptyReasonRes = await cancelBooking({
        actor: { id: testSalon.ownerId, role: Role.OWNER, isActive: true },
        bookingId: booking.id,
        reason: '   ',
        now,
      });
      expect(emptyReasonRes.ok).toBe(false);
      if (!emptyReasonRes.ok) {
        expect(emptyReasonRes.code).toBe('INVALID_INPUT');
      }

      const validStaffRes = await cancelBooking({
        actor: { id: testSalon.ownerId, role: Role.OWNER, isActive: true },
        bookingId: booking.id,
        reason: 'Emergency water cut at salon',
        now,
      });
      expect(validStaffRes.ok).toBe(true);
      if (validStaffRes.ok) {
        expect(validStaffRes.data.status).toBe(BookingStatus.CANCELLED);
        expect(validStaffRes.data.cancelReason).toBe('Emergency water cut at salon');
      }
    });

    it('Rule 15: slot reuse: cancelling a booking immediately frees that slot for new reservations', async () => {
      const custA = await createFreshCustomer('Rule 15 A');
      const custB = await createFreshCustomer('Rule 15 B');
      const slot = istToUtcDate(targetDateIst, 1020);
      const b1 = await createBooking({
        customerId: custA.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot,
      });
      expect(b1.ok).toBe(true);

      if (b1.ok) {
        const cancelRes = await cancelBooking({
          actor: { id: custA.id, role: Role.CUSTOMER, isActive: true },
          bookingId: b1.data.id,
          reason: 'Plans changed',
        });
        expect(cancelRes.ok).toBe(true);
      }

      const b2 = await createBooking({
        customerId: custB.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot,
      });
      expect(b2.ok).toBe(true);

      if (b2.ok) {
        await db.bookingItem.deleteMany({ where: { bookingId: b2.data.id } });
        await db.booking.delete({ where: { id: b2.data.id } });
      }
      if (b1.ok) {
        await db.bookingItem.deleteMany({ where: { bookingId: b1.data.id } });
        await db.booking.delete({ where: { id: b1.data.id } });
      }
    });

    it('Rule 16: double-submission guard: concurrent identical booking submissions produce exactly one booking', async () => {
      const doubleCust = await createFreshCustomer('Rule 16 Cust');
      const slot = istToUtcDate(targetDateIst, 1050);

      const [r1, r2] = await Promise.all([
        createBooking({
          customerId: doubleCust.id,
          salonId: testSalon.id,
          barberId: testBarber.id,
          serviceIds: [testService.id],
          startsAt: slot,
        }),
        createBooking({
          customerId: doubleCust.id,
          salonId: testSalon.id,
          barberId: testBarber.id,
          serviceIds: [testService.id],
          startsAt: slot,
        }),
      ]);

      const successes = [r1, r2].filter((r) => r.ok);
      const failures = [r1, r2].filter((r) => !r.ok);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      if (successes[0].ok) {
        await db.bookingItem.deleteMany({ where: { bookingId: successes[0].data.id } });
        await db.booking.delete({ where: { id: successes[0].data.id } });
      }
    });

    it('Rule 17: role validation in core service: rejects createBooking for non-customer roles directly in createBooking', async () => {
      const slot = istToUtcDate(targetDateIst, 1080);

      const barberRes = await createBooking({
        customerId: testBarberUser.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot,
      });
      expect(barberRes.ok).toBe(false);
      if (!barberRes.ok) {
        expect(barberRes.code).toBe('UNAUTHORIZED');
      }

      const ownerRes = await createBooking({
        customerId: testOwner.id,
        salonId: testSalon.id,
        barberId: testBarber.id,
        serviceIds: [testService.id],
        startsAt: slot,
      });
      expect(ownerRes.ok).toBe(false);
      if (!ownerRes.ok) {
        expect(ownerRes.code).toBe('UNAUTHORIZED');
      }
    });
  });
});
