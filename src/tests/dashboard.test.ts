import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  BookingStatus,
  Role,
  VerificationStatus,
  BookingSource,
  BookingType,
  ServiceCategory,
  User,
  Salon,
  Barber,
  Service,
} from '@prisma/client';
import { db } from '../lib/db';
import {
  isValidTransition,
  getAllowedNextStatuses,
  isFinalStatus,
  validateBookingTransition,
} from '../lib/booking-status';
import {
  canViewStaffDashboard,
  canCreateWalkIn,
  PolicyUser,
  PolicyBarber,
} from '../lib/policies';
import {
  updateBookingStatusStaff,
  getRegisterBookings,
  getBookingDetailStaff,
  createWalkInBooking,
} from '../lib/dashboard-service';
import { CurrentUser } from '../lib/auth-server';
import {
  utcToIstDetails,
  istToUtcDate,
  toTokenDateUtc,
} from '../lib/time';

describe('Phase 4A: Staff Dashboard & State Machine Tests', () => {
  describe('Block E: Pure State Machine (booking-status.ts)', () => {
    it('allows all expected forward transitions', () => {
      // PENDING
      expect(isValidTransition(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toBe(true);
      expect(isValidTransition(BookingStatus.PENDING, BookingStatus.REJECTED)).toBe(true);
      expect(isValidTransition(BookingStatus.PENDING, BookingStatus.CANCELLED)).toBe(true);

      // CONFIRMED
      expect(isValidTransition(BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN)).toBe(true);
      expect(isValidTransition(BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS)).toBe(true);
      expect(isValidTransition(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW)).toBe(true);
      expect(isValidTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)).toBe(true);

      // CHECKED_IN
      expect(isValidTransition(BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS)).toBe(true);
      expect(isValidTransition(BookingStatus.CHECKED_IN, BookingStatus.NO_SHOW)).toBe(true);
      expect(isValidTransition(BookingStatus.CHECKED_IN, BookingStatus.CANCELLED)).toBe(true);

      // IN_PROGRESS
      expect(isValidTransition(BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED)).toBe(true);
    });

    it('rejects forbidden or backward transitions with INVALID_TRANSITION', () => {
      const terminalStatuses = [
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.REJECTED,
        BookingStatus.NO_SHOW,
      ];

      for (const terminal of terminalStatuses) {
        expect(isFinalStatus(terminal)).toBe(true);
        expect(getAllowedNextStatuses(terminal)).toEqual([]);

        for (const anyStatus of Object.values(BookingStatus)) {
          expect(isValidTransition(terminal, anyStatus)).toBe(false);
          const res = validateBookingTransition({
            from: terminal,
            to: anyStatus,
            startsAt: new Date('2026-11-05T10:00:00Z'),
            now: new Date('2026-11-05T10:00:00Z'),
          });
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.code).toBe('INVALID_TRANSITION');
          }
        }
      }

      expect(isValidTransition(BookingStatus.PENDING, BookingStatus.IN_PROGRESS)).toBe(false);
      expect(isValidTransition(BookingStatus.PENDING, BookingStatus.COMPLETED)).toBe(false);
      expect(isValidTransition(BookingStatus.IN_PROGRESS, BookingStatus.PENDING)).toBe(false);
      expect(isValidTransition(BookingStatus.IN_PROGRESS, BookingStatus.CONFIRMED)).toBe(false);
      expect(isValidTransition(BookingStatus.CHECKED_IN, BookingStatus.CONFIRMED)).toBe(false);
    });

    it('enforces NO_SHOW timing rule (only allowed at or after startsAt)', () => {
      const now = new Date('2026-11-05T10:00:00Z');
      const futureStartsAt = new Date('2026-11-05T10:15:00Z');
      const pastStartsAt = new Date('2026-11-05T09:45:00Z');

      const earlyRes = validateBookingTransition({
        from: BookingStatus.CONFIRMED,
        to: BookingStatus.NO_SHOW,
        startsAt: futureStartsAt,
        now,
      });
      expect(earlyRes).toEqual({ ok: false, code: 'NO_SHOW_TOO_EARLY' });

      const validRes = validateBookingTransition({
        from: BookingStatus.CONFIRMED,
        to: BookingStatus.NO_SHOW,
        startsAt: pastStartsAt,
        now,
      });
      expect(validRes).toEqual({ ok: true });
    });

    it('enforces CHAIR_BUSY rule (at most one IN_PROGRESS per barber chair)', () => {
      const now = new Date('2026-11-05T10:00:00Z');
      const startsAt = new Date('2026-11-05T09:50:00Z');

      const busyRes = validateBookingTransition({
        from: BookingStatus.CHECKED_IN,
        to: BookingStatus.IN_PROGRESS,
        startsAt,
        now,
        isChairBusy: true,
      });
      expect(busyRes).toEqual({ ok: false, code: 'CHAIR_BUSY' });

      const freeRes = validateBookingTransition({
        from: BookingStatus.CHECKED_IN,
        to: BookingStatus.IN_PROGRESS,
        startsAt,
        now,
        isChairBusy: false,
      });
      expect(freeRes).toEqual({ ok: true });
    });

    it('enforces WRONG_DAY rule on CONFIRMED -> CHECKED_IN and CONFIRMED -> IN_PROGRESS', () => {
      const fixedTodayUtc = istToUtcDate('2026-11-05', 600); // 10:00 AM IST on 2026-11-05
      const tomorrowStartsAt = istToUtcDate('2026-11-06', 600); // 10:00 AM IST on 2026-11-06
      const yesterdayStartsAt = istToUtcDate('2026-11-04', 600); // 10:00 AM IST on 2026-11-04
      const todayStartsAt = istToUtcDate('2026-11-05', 660); // 11:00 AM IST on 2026-11-05

      // Tomorrow rejected with WRONG_DAY
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: tomorrowStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.IN_PROGRESS,
          startsAt: tomorrowStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      // Today allowed
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: todayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: true });

      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.IN_PROGRESS,
          startsAt: todayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: true });

      // Yesterday rejected with WRONG_DAY
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: yesterdayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.IN_PROGRESS,
          startsAt: yesterdayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      // IST Midnight boundaries:
      // Booking at 23:59 IST today (1439 min) vs now at 00:01 IST tomorrow (1 min next day)
      const todayLate = istToUtcDate('2026-11-05', 1439);
      const tomorrowEarly = istToUtcDate('2026-11-06', 1);
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: todayLate,
          now: tomorrowEarly,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      // Booking at 00:01 IST tomorrow vs now at 23:59 IST today
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: tomorrowEarly,
          now: todayLate,
        })
      ).toEqual({ ok: false, code: 'WRONG_DAY' });

      // UTC midnight vs IST same-day test:
      // 00:30 IST is 19:00 UTC previous day; 01:00 IST is 19:30 UTC previous day.
      // Both are on IST date 2026-11-05 -> same day in IST -> allowed
      const booking0030Ist = istToUtcDate('2026-11-05', 30);
      const now0100Ist = istToUtcDate('2026-11-05', 60);
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CHECKED_IN,
          startsAt: booking0030Ist,
          now: now0100Ist,
        })
      ).toEqual({ ok: true });

      // Past day confirmed booking: CANCELLED or NO_SHOW is allowed, but NEVER CHECKED_IN or IN_PROGRESS
      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.NO_SHOW,
          startsAt: yesterdayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: true });

      expect(
        validateBookingTransition({
          from: BookingStatus.CONFIRMED,
          to: BookingStatus.CANCELLED,
          startsAt: yesterdayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: true });

      // CHECKED_IN -> IN_PROGRESS transition is not subject to WRONG_DAY
      expect(
        validateBookingTransition({
          from: BookingStatus.CHECKED_IN,
          to: BookingStatus.IN_PROGRESS,
          startsAt: yesterdayStartsAt,
          now: fixedTodayUtc,
        })
      ).toEqual({ ok: true });
    });
  });

  describe('Block D: Staff Policies & Scoping Rules (policies.ts)', () => {
    const barberUser: PolicyUser = { id: 'user-barber-1', role: Role.BARBER, isActive: true };
    const ownerUser: PolicyUser = { id: 'user-owner-1', role: Role.OWNER, isActive: true };
    const adminUser: PolicyUser = { id: 'user-admin-1', role: Role.ADMIN, isActive: true };
    const customerUser: PolicyUser = { id: 'user-customer-1', role: Role.CUSTOMER, isActive: true };
    const inactiveBarber: PolicyUser = { id: 'user-barber-2', role: Role.BARBER, isActive: false };

    const barberProfileOwn: PolicyBarber = {
      id: 'barber-profile-1',
      userId: 'user-barber-1',
      salonId: 'salon-1',
      salonOwnerId: 'user-owner-1',
    };

    const barberProfileOther: PolicyBarber = {
      id: 'barber-profile-2',
      userId: 'user-barber-2',
      salonId: 'salon-2',
      salonOwnerId: 'user-owner-2',
    };

    it('canViewStaffDashboard allows only active BARBER and OWNER', () => {
      expect(canViewStaffDashboard(barberUser)).toBe(true);
      expect(canViewStaffDashboard(ownerUser)).toBe(true);
      expect(canViewStaffDashboard(customerUser)).toBe(false);
      expect(canViewStaffDashboard(inactiveBarber)).toBe(false);
      expect(canViewStaffDashboard(null)).toBe(false);
    });

    it('canCreateWalkIn enforces chair operation authorization', () => {
      expect(canCreateWalkIn(barberUser, barberProfileOwn)).toBe(true);
      expect(canCreateWalkIn(barberUser, barberProfileOther)).toBe(false);
      expect(canCreateWalkIn(ownerUser, barberProfileOwn)).toBe(true);
      expect(canCreateWalkIn(ownerUser, barberProfileOther)).toBe(false);
      expect(canCreateWalkIn(adminUser, barberProfileOwn)).toBe(false);
      expect(canCreateWalkIn(customerUser, barberProfileOwn)).toBe(false);
    });
  });

  describe('Integration: Staff Actions & Register Scoping (Database)', () => {
    let testOwner: User;
    let testSalon: Salon;
    let testBarberUser1: User;
    let testBarber1: Barber;
    let testBarberUser2: User;
    let testBarber2: Barber;
    let testCustomer: User;
    let testService: Service;
    let todayIstStr: string;

    beforeAll(async () => {
      const ts = Date.now();
      const { dateIst } = utcToIstDetails(new Date());
      todayIstStr = dateIst;

      // 1. Owner
      testOwner = await db.user.create({
        data: {
          phone: `+919871${String(ts).slice(-6)}`,
          name: 'Owner Dash Test',
          role: Role.OWNER,
          isActive: true,
        },
      });

      // 2. Salon
      testSalon = await db.salon.create({
        data: {
          ownerId: testOwner.id,
          name: 'Dashboard Test Salon',
          slug: `dash-test-salon-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '123 Test Street',
          area: 'Test Area',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      // Salon hours (open 7 days a week, 08:00 to 21:00)
      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: {
            salonId: testSalon.id,
            weekday: day,
            openMin: 480,
            closeMin: 1260,
          },
        });
      }

      // 3. Service
      testService = await db.service.create({
        data: {
          salonId: testSalon.id,
          name: 'Dash Haircut',
          category: ServiceCategory.HAIR,
          durationMin: 30,
          priceRupees: 150,
          isActive: true,
        },
      });

      // 4. Barbers
      testBarberUser1 = await db.user.create({
        data: {
          phone: `+919872${String(ts + 1).slice(-6)}`,
          name: 'Barber Dash 1',
          role: Role.BARBER,
          isActive: true,
        },
      });

      testBarber1 = await db.barber.create({
        data: {
          userId: testBarberUser1.id,
          salonId: testSalon.id,
          displayName: 'Dash Barber 1',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 5,
        },
      });

      testBarberUser2 = await db.user.create({
        data: {
          phone: `+919873${String(ts + 2).slice(-6)}`,
          name: 'Barber Dash 2',
          role: Role.BARBER,
          isActive: true,
        },
      });

      testBarber2 = await db.barber.create({
        data: {
          userId: testBarberUser2.id,
          salonId: testSalon.id,
          displayName: 'Dash Barber 2',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 3,
        },
      });

      // Availabilities
      for (let day = 0; day < 7; day++) {
        await db.availability.create({
          data: {
            barberId: testBarber1.id,
            weekday: day,
            startMin: 480,
            endMin: 1260,
          },
        });
        await db.availability.create({
          data: {
            barberId: testBarber2.id,
            weekday: day,
            startMin: 480,
            endMin: 1260,
          },
        });
      }

      // Barber Services mapping
      await db.barberService.create({
        data: {
          barberId: testBarber1.id,
          serviceId: testService.id,
        },
      });
      await db.barberService.create({
        data: {
          barberId: testBarber2.id,
          serviceId: testService.id,
        },
      });

      // Customer
      testCustomer = await db.user.create({
        data: {
          phone: `+919874${String(ts + 3).slice(-6)}`,
          name: 'Customer Dash',
          role: Role.CUSTOMER,
          isActive: true,
        },
      });
    }, 30000);

    afterAll(async () => {
      if (testSalon?.id) {
        await db.bookingItem.deleteMany({ where: { booking: { salonId: testSalon.id } } });
        await db.booking.deleteMany({ where: { salonId: testSalon.id } });
        await db.dailyTokenCounter.deleteMany({ where: { salonId: testSalon.id } });
        await db.barberService.deleteMany({ where: { barberId: { in: [testBarber1?.id, testBarber2?.id].filter(Boolean) } } });
        await db.availability.deleteMany({ where: { barberId: { in: [testBarber1?.id, testBarber2?.id].filter(Boolean) } } });
        await db.service.deleteMany({ where: { salonId: testSalon.id } });
        await db.barber.deleteMany({ where: { salonId: testSalon.id } });
        await db.salonHours.deleteMany({ where: { salonId: testSalon.id } });
        await db.salon.deleteMany({ where: { id: testSalon.id } });
      }

      const usersToDelete = [
        testOwner?.id,
        testBarberUser1?.id,
        testBarberUser2?.id,
        testCustomer?.id,
      ].filter(Boolean);

      if (usersToDelete.length > 0) {
        await db.user.deleteMany({ where: { id: { in: usersToDelete } } });
      }
    }, 30000);

    it('executes atomic status updates and detects race condition conflicts', async () => {
      const startsAt = istToUtcDate(todayIstStr, 600); // 10:00 AM IST
      const endsAt = istToUtcDate(todayIstStr, 630);
      const tokenDate = toTokenDateUtc(todayIstStr);

      const booking = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber1.id,
          customerId: testCustomer.id,
          token: 101,
          tokenDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      const staffUser: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      // 1. Valid update to CHECKED_IN
      const checkInRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
      });

      expect(checkInRes.ok).toBe(true);
      expect(checkInRes.data?.status).toBe(BookingStatus.CHECKED_IN);

      // Verify checkedInAt was set
      const updated1 = await db.booking.findUnique({ where: { id: booking.id } });
      expect(updated1?.checkedInAt).toBeDefined();

      // 2. Race condition conflict: trying to update with stale expectedStatus (CONFIRMED)
      const conflictRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED, // Stale!
        newStatus: BookingStatus.IN_PROGRESS,
      });

      expect(conflictRes.ok).toBe(false);
      expect(conflictRes.code).toBe('STATUS_CONFLICT');
    });

    it('auto-backfills checkedInAt if skipped when transitioning directly to IN_PROGRESS', async () => {
      const startsAt = istToUtcDate(todayIstStr, 660); // 11:00 AM IST
      const endsAt = istToUtcDate(todayIstStr, 690);
      const tokenDate = toTokenDateUtc(todayIstStr);

      const booking = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber2.id,
          customerId: testCustomer.id,
          token: 102,
          tokenDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      const staffUser: CurrentUser = {
        id: testBarberUser2.id,
        role: Role.BARBER,
        phone: testBarberUser2.phone,
        name: testBarberUser2.name,
        isActive: true,
      };

      const res = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.IN_PROGRESS,
      });

      expect(res.ok).toBe(true);
      const row = await db.booking.findUnique({ where: { id: booking.id } });
      expect(row?.startedAt).toBeDefined();
      expect(row?.checkedInAt).toBeDefined(); // Auto-backfilled!
    });

    it('enforces chair busy and prevents two concurrent IN_PROGRESS bookings for the same barber', async () => {
      // testBarber2 already has booking 102 IN_PROGRESS from previous test
      const startsAt = istToUtcDate(todayIstStr, 720); // 12:00 PM IST
      const endsAt = istToUtcDate(todayIstStr, 750);
      const tokenDate = toTokenDateUtc(todayIstStr);

      const booking2 = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber2.id,
          customerId: testCustomer.id,
          token: 103,
          tokenDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CHECKED_IN,
          startsAt,
          endsAt,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      const staffUser: CurrentUser = {
        id: testBarberUser2.id,
        role: Role.BARBER,
        phone: testBarberUser2.phone,
        name: testBarberUser2.name,
        isActive: true,
      };

      const res = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking2.id,
        expectedStatus: BookingStatus.CHECKED_IN,
        newStatus: BookingStatus.IN_PROGRESS,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('CHAIR_BUSY');
    });

    it('requires a 3 to 200 character cancellation reason for staff cancellations', async () => {
      const startsAt = istToUtcDate(todayIstStr, 780);
      const endsAt = istToUtcDate(todayIstStr, 810);
      const tokenDate = toTokenDateUtc(todayIstStr);

      const booking = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber1.id,
          customerId: testCustomer.id,
          token: 104,
          tokenDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      const staffUser: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      // Empty reason
      const emptyRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CANCELLED,
        cancelReason: '',
      });
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.code).toBe('INVALID_INPUT');

      // Too short (2 characters)
      const shortRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CANCELLED,
        cancelReason: 'no',
      });
      expect(shortRes.ok).toBe(false);
      expect(shortRes.code).toBe('INVALID_INPUT');

      // Valid reason (3 chars or more)
      const validRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CANCELLED,
        cancelReason: 'Customer called to cancel',
      });
      expect(validRes.ok).toBe(true);

      const row = await db.booking.findUnique({ where: { id: booking.id } });
      expect(row?.status).toBe(BookingStatus.CANCELLED);
      expect(row?.cancelledAt).toBeDefined();
      expect(row?.cancelReason).toBe('Customer called to cancel');
    });

    it('enforces barber scoping: barber cannot modify another barber booking', async () => {
      const startsAt = istToUtcDate(todayIstStr, 840);
      const endsAt = istToUtcDate(todayIstStr, 870);
      const tokenDate = toTokenDateUtc(todayIstStr);

      const bookingBarber1 = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber1.id,
          customerId: testCustomer.id,
          token: 105,
          tokenDate,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      // Barber 2 tries to update Barber 1's booking
      const barber2User: CurrentUser = {
        id: testBarberUser2.id,
        role: Role.BARBER,
        phone: testBarberUser2.phone,
        name: testBarberUser2.name,
        isActive: true,
      };

      const res = await updateBookingStatusStaff({
        staffUser: barber2User,
        bookingId: bookingBarber1.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('NOT_FOUND'); // 404 security scoping
    });

    it('rejects checking in or starting a booking on the wrong day with WRONG_DAY at service level', async () => {
      const tomorrowIstStr = '2026-11-06';
      const startsAtTomorrow = istToUtcDate(tomorrowIstStr, 600);
      const endsAtTomorrow = istToUtcDate(tomorrowIstStr, 630);
      const tokenDateTomorrow = toTokenDateUtc(tomorrowIstStr);
      const fixedNowToday = istToUtcDate('2026-11-05', 600);

      const bookingTomorrow = await db.booking.create({
        data: {
          salonId: testSalon.id,
          barberId: testBarber1.id,
          customerId: testCustomer.id,
          token: 201,
          tokenDate: tokenDateTomorrow,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: startsAtTomorrow,
          endsAt: endsAtTomorrow,
          totalRupees: 150,
          items: {
            create: [{ serviceId: testService.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      const staffUser: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      // Check-in tomorrow booking today -> rejected with WRONG_DAY
      const checkInRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: bookingTomorrow.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
        now: fixedNowToday,
      });

      expect(checkInRes.ok).toBe(false);
      expect(checkInRes.code).toBe('WRONG_DAY');
      expect(checkInRes.message).toBe('You can check in only on the day of the booking.');

      // Start tomorrow booking today -> rejected with WRONG_DAY
      const startRes = await updateBookingStatusStaff({
        staffUser,
        bookingId: bookingTomorrow.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.IN_PROGRESS,
        now: fixedNowToday,
      });

      expect(startRes.ok).toBe(false);
      expect(startRes.code).toBe('WRONG_DAY');

      // Next customer test: a tomorrow booking or past booking must NEVER appear as nextCustomer on today's dashboard
      const registerRes = await getRegisterBookings({
        staffUser,
        salonId: testSalon.id,
        barberId: testBarber1.id,
        dateIst: '2026-11-05',
        now: fixedNowToday,
      });
      expect(registerRes.ok).toBe(true);
      if (registerRes.data?.nextCustomer) {
        expect(utcToIstDetails(registerRes.data.nextCustomer.startsAt).dateIst).toBe('2026-11-05');
      }
    });

    it('creates a walk-in token and allocates sequential token number', async () => {
      const staffUser: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      const walkInRes = await createWalkInBooking({
        staffUser,
        barberId: testBarber1.id,
        serviceIds: [testService.id],
        customerName: 'Ramesh Walkin',
        customerPhone: '+919999911111',
        now: istToUtcDate(todayIstStr, 600), // 10:00 AM IST
      });

      expect(walkInRes.ok).toBe(true);
      expect(walkInRes.data).toBeDefined();
      expect(walkInRes.data?.token).toBeGreaterThan(0);

      const walkInBooking = await db.booking.findUnique({
        where: { id: walkInRes.data!.bookingId },
      });
      expect(walkInBooking?.source).toBe(BookingSource.WALK_IN);
      expect(walkInBooking?.status).toBe(BookingStatus.CHECKED_IN);
      expect(walkInBooking?.customerId).toBeNull();
      expect(walkInBooking?.walkInName).toBe('Ramesh Walkin');
      expect(walkInBooking?.checkedInAt).toBeDefined();
    });

    it('scoping in getRegisterBookings: barber sees only their own; owner sees all', async () => {
      const barber1User: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      const ownerUser: CurrentUser = {
        id: testOwner.id,
        role: Role.OWNER,
        phone: testOwner.phone,
        name: testOwner.name,
        isActive: true,
      };

      // Barber 1 query
      const barberRes = await getRegisterBookings({
        staffUser: barber1User,
        salonId: testSalon.id,
        dateIst: todayIstStr,
      });

      expect(barberRes.ok).toBe(true);
      for (const b of barberRes.data!.bookings) {
        expect(b.barberId).toBe(testBarber1.id); // Strictly isolated to Barber 1
      }

      // Owner query
      const ownerRes = await getRegisterBookings({
        staffUser: ownerUser,
        salonId: testSalon.id,
        dateIst: todayIstStr,
      });

      expect(ownerRes.ok).toBe(true);
      expect(ownerRes.data!.summary.todayTokens).toBeGreaterThanOrEqual(barberRes.data!.summary.todayTokens);
    });

    it('getBookingDetailStaff returns full staff booking details and enforces 404 security', async () => {
      const barber1User: CurrentUser = {
        id: testBarberUser1.id,
        role: Role.BARBER,
        phone: testBarberUser1.phone,
        name: testBarberUser1.name,
        isActive: true,
      };

      const barber2User: CurrentUser = {
        id: testBarberUser2.id,
        role: Role.BARBER,
        phone: testBarberUser2.phone,
        name: testBarberUser2.name,
        isActive: true,
      };

      // Query bookings for Barber 1
      const registerRes = await getRegisterBookings({
        staffUser: barber1User,
        salonId: testSalon.id,
        dateIst: todayIstStr,
      });

      const firstBooking = registerRes.data!.bookings[0];
      expect(firstBooking).toBeDefined();

      // Barber 1 accesses own booking -> 200 OK
      const detailRes = await getBookingDetailStaff({
        staffUser: barber1User,
        bookingId: firstBooking.id,
      });
      expect(detailRes.ok).toBe(true);
      expect(detailRes.data?.id).toBe(firstBooking.id);
      expect(detailRes.data?.customerPhone).toBeDefined();

      // Barber 2 accesses Barber 1's booking -> NOT_FOUND (404)
      const deniedRes = await getBookingDetailStaff({
        staffUser: barber2User,
        bookingId: firstBooking.id,
      });
      expect(deniedRes.ok).toBe(false);
      expect(deniedRes.code).toBe('NOT_FOUND');
    });
  });
});
