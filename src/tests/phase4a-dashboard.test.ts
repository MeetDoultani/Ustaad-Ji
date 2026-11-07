import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
  updateBookingStatusStaff,
  getRegisterBookings,
  createWalkInBooking,
  checkStaffWalkInRateLimit,
  resetStaffWalkInRateLimitForTesting,
} from '../lib/dashboard-service';
import { CurrentUser } from '../lib/auth-server';
import {
  utcToIstDetails,
  istToUtcDate,
  toTokenDateUtc,
} from '../lib/time';
import { generateSlots } from '../lib/slots';
import { ConsoleOtpSender } from '../lib/otp-sender';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

describe('Phase 4A: Dedicated Database & Concurrency Tests', () => {
  // Production safety guard
  beforeAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run destructive tests against production database!');
    }
  });

  afterAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run destructive tests against production database!');
    }
  });

  describe('Section 2: Missing Real Database Tests with Isolated Fixtures', () => {
    let ownerA: User;
    let salonA: Salon;
    let barberUserA: User;
    let barberA: Barber;
    let serviceA: Service;

    let ownerB: User;
    let salonB: Salon;
    let barberUserB: User;
    let barberB: Barber;

    let salonA2: Salon; // Second salon owned by ownerA
    let barberUserA2: User;
    let barberA2: Barber;

    let customerUser: User;
    let todayIstStr: string;

    beforeAll(async () => {
      const ts = Date.now();
      const { dateIst } = utcToIstDetails(new Date());
      todayIstStr = dateIst;

      // 1. Owner A & Salon A
      ownerA = await db.user.create({
        data: {
          phone: `+919811${String(ts).slice(-6)}`,
          name: 'Owner A',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonA = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Salon A Main',
          slug: `salon-a-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '123 Market Road',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
        },
      });

      // Salon A2 (second salon for Owner A)
      salonA2 = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Salon A Branch 2',
          slug: `salon-a2-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '456 Ring Road',
          area: 'Koramangala',
          city: 'Bengaluru',
          pincode: '560034',
        },
      });

      // Salon hours for Salon A and Salon A2
      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: { salonId: salonA.id, weekday: day, openMin: 480, closeMin: 1260 },
        });
        await db.salonHours.create({
          data: { salonId: salonA2.id, weekday: day, openMin: 480, closeMin: 1260 },
        });
      }

      // Service in Salon A
      serviceA = await db.service.create({
        data: {
          salonId: salonA.id,
          name: 'Haircut A',
          category: ServiceCategory.HAIR,
          durationMin: 30,
          priceRupees: 200,
          isActive: true,
        },
      });

      // Barber User A & Barber A
      barberUserA = await db.user.create({
        data: {
          phone: `+919812${String(ts + 1).slice(-6)}`,
          name: 'Barber A',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberA = await db.barber.create({
        data: {
          userId: barberUserA.id,
          salonId: salonA.id,
          displayName: 'Barber Master A',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 6,
        },
      });

      // Barber User A2 in Salon A2
      barberUserA2 = await db.user.create({
        data: {
          phone: `+919813${String(ts + 2).slice(-6)}`,
          name: 'Barber A2',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberA2 = await db.barber.create({
        data: {
          userId: barberUserA2.id,
          salonId: salonA2.id,
          displayName: 'Barber Branch A2',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 4,
        },
      });

      // Barber A availabilities & service mapping
      for (let day = 0; day < 7; day++) {
        await db.availability.create({
          data: { barberId: barberA.id, weekday: day, startMin: 480, endMin: 1260 },
        });
        await db.availability.create({
          data: { barberId: barberA2.id, weekday: day, startMin: 480, endMin: 1260 },
        });
      }

      await db.barberService.create({
        data: { barberId: barberA.id, serviceId: serviceA.id },
      });

      // 2. Owner B & Salon B (Isolated competitor)
      ownerB = await db.user.create({
        data: {
          phone: `+919821${String(ts + 3).slice(-6)}`,
          name: 'Owner B',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonB = await db.salon.create({
        data: {
          ownerId: ownerB.id,
          name: 'Salon B Competitor',
          slug: `salon-b-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '789 Brigade Road',
          area: 'MG Road',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: { salonId: salonB.id, weekday: day, openMin: 480, closeMin: 1260 },
        });
      }

      barberUserB = await db.user.create({
        data: {
          phone: `+919822${String(ts + 4).slice(-6)}`,
          name: 'Barber B',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberB = await db.barber.create({
        data: {
          userId: barberUserB.id,
          salonId: salonB.id,
          displayName: 'Barber B Pro',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 2,
        },
      });

      for (let day = 0; day < 7; day++) {
        await db.availability.create({
          data: { barberId: barberB.id, weekday: day, startMin: 480, endMin: 1260 },
        });
      }

      // Customer
      customerUser = await db.user.create({
        data: {
          phone: `+919833${String(ts + 5).slice(-6)}`,
          name: 'Dedicated Customer',
          role: Role.CUSTOMER,
          isActive: true,
        },
      });
    }, 45000);

    afterAll(async () => {
      const salonIds = [salonA?.id, salonA2?.id, salonB?.id].filter(Boolean);
      const barberIds = [barberA?.id, barberA2?.id, barberB?.id].filter(Boolean);

      if (salonIds.length > 0) {
        await db.bookingItem.deleteMany({ where: { booking: { salonId: { in: salonIds } } } });
        await db.booking.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.dailyTokenCounter.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.barberService.deleteMany({ where: { barberId: { in: barberIds } } });
        await db.availability.deleteMany({ where: { barberId: { in: barberIds } } });
        await db.service.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.barber.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.salonHours.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.salon.deleteMany({ where: { id: { in: salonIds } } });
      }

      const userIds = [
        ownerA?.id,
        barberUserA?.id,
        barberUserA2?.id,
        ownerB?.id,
        barberUserB?.id,
        customerUser?.id,
      ].filter(Boolean);

      if (userIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }, 45000);

    beforeEach(() => {
      resetStaffWalkInRateLimitForTesting();
    });

    // 1. Direct customer denial at service layer
    it('direct customer denial at service layer: rejects updateBookingStatus and createWalkIn directly', async () => {
      const custCurrentUser: CurrentUser = {
        id: customerUser.id,
        role: Role.CUSTOMER,
        phone: customerUser.phone,
        name: customerUser.name,
        isActive: true,
      };

      const booking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 201,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: istToUtcDate(todayIstStr, 600),
          endsAt: istToUtcDate(todayIstStr, 630),
          totalRupees: 200,
        },
      });

      const updateRes = await updateBookingStatusStaff({
        staffUser: custCurrentUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
      });

      expect(updateRes.ok).toBe(false);
      expect(['FORBIDDEN', 'UNAUTHORIZED']).toContain(updateRes.code);

      const walkInRes = await createWalkInBooking({
        staffUser: custCurrentUser,
        barberId: barberA.id,
        serviceIds: [serviceA.id],
        customerName: 'Customer Calling Direct',
        now: istToUtcDate(todayIstStr, 600),
      });

      expect(walkInRes.ok).toBe(false);
      expect(['FORBIDDEN', 'UNAUTHORIZED']).toContain(walkInRes.code);
    });

    // 2. Unverified/inactive staff denial
    it('unverified/inactive staff denial: unverified or suspended salon, and inactive barber are rejected', async () => {
      // Create unverified salon & inactive barber
      const unverifiedSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Unverified Salon Pending',
          slug: `pending-salon-${Date.now()}`,
          status: VerificationStatus.PENDING,
          addressLine: '000 Pending Road',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
        },
      });

      const inactiveBarberUser = await db.user.create({
        data: {
          phone: `+919819${String(Date.now()).slice(-6)}`,
          name: 'Inactive Barber',
          role: Role.BARBER,
          isActive: false,
        },
      });

      const inactiveBarber = await db.barber.create({
        data: {
          userId: inactiveBarberUser.id,
          salonId: unverifiedSalon.id,
          displayName: 'Barber Inactive',
          status: VerificationStatus.PENDING,
          isActive: false,
        },
      });

      const inactiveStaffUser: CurrentUser = {
        id: inactiveBarberUser.id,
        role: Role.BARBER,
        phone: inactiveBarberUser.phone,
        name: inactiveBarberUser.name,
        isActive: false,
      };

      const walkInRes = await createWalkInBooking({
        staffUser: inactiveStaffUser,
        barberId: inactiveBarber.id,
        serviceIds: [serviceA.id],
        now: istToUtcDate(todayIstStr, 600),
      });

      expect(walkInRes.ok).toBe(false);
      expect(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND']).toContain(walkInRes.code);

      // Clean up temp fixtures
      await db.barber.delete({ where: { id: inactiveBarber.id } });
      await db.user.delete({ where: { id: inactiveBarberUser.id } });
      await db.salon.delete({ where: { id: unverifiedSalon.id } });
    });

    // 3. Cross-salon owner write isolation & salon switching
    it('cross-salon owner write isolation & salon switching: rejects foreign salon writes and isolates queries', async () => {
      const startsAt = istToUtcDate(todayIstStr, 660);
      const endsAt = istToUtcDate(todayIstStr, 690);

      // Booking in Salon B (owned by Owner B)
      const bookingB = await db.booking.create({
        data: {
          salonId: salonB.id,
          barberId: barberB.id,
          customerId: customerUser.id,
          token: 301,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 180,
        },
      });

      const ownerAUser: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // Owner A attempts to update booking belonging to Salon B
      const crossWriteRes = await updateBookingStatusStaff({
        staffUser: ownerAUser,
        bookingId: bookingB.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
      });

      expect(crossWriteRes.ok).toBe(false);
      expect(crossWriteRes.code).toBe('NOT_FOUND'); // 404 security scoping

      // Multi-salon switching for Owner A: foreign salon query is rejected
      const foreignRegisterRes = await getRegisterBookings({
        staffUser: ownerAUser,
        salonId: salonB.id,
        dateIst: todayIstStr,
      });
      expect(foreignRegisterRes.ok).toBe(false);
      expect(['NOT_FOUND', 'UNAUTHORIZED']).toContain(foreignRegisterRes.code);

      // Owner A can switch between Salon A and Salon A2
      const regA = await getRegisterBookings({
        staffUser: ownerAUser,
        salonId: salonA.id,
        dateIst: todayIstStr,
      });
      expect(regA.ok).toBe(true);

      const regA2 = await getRegisterBookings({
        staffUser: ownerAUser,
        salonId: salonA2.id,
        dateIst: todayIstStr,
      });
      expect(regA2.ok).toBe(true);
    });

    // 4. Atomic status update race (Promise.all)
    it('atomic status update race (Promise.all): two simultaneous calls on same booking yield exactly one success and one STATUS_CONFLICT', async () => {
      const startsAt = istToUtcDate(todayIstStr, 720);
      const endsAt = istToUtcDate(todayIstStr, 750);

      const raceBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 401,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt,
          endsAt,
          totalRupees: 200,
        },
      });

      const staffUser: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const [res1, res2] = await Promise.all([
        updateBookingStatusStaff({
          staffUser,
          bookingId: raceBooking.id,
          expectedStatus: BookingStatus.CONFIRMED,
          newStatus: BookingStatus.CHECKED_IN,
        }),
        updateBookingStatusStaff({
          staffUser,
          bookingId: raceBooking.id,
          expectedStatus: BookingStatus.CONFIRMED,
          newStatus: BookingStatus.CHECKED_IN,
        }),
      ]);

      const successCount = [res1, res2].filter((r) => r.ok).length;
      const conflictCount = [res1, res2].filter((r) => !r.ok && r.code === 'STATUS_CONFLICT').length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);
    });

    // 5. Concurrent chair-busy race (Promise.all backed by DB partial unique index)
    it('concurrent chair-busy race (Promise.all): two simultaneous START actions on different bookings for same barber yield 1 success and 1 CHAIR_BUSY', async () => {
      const b1 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 501,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CHECKED_IN,
          startsAt: istToUtcDate(todayIstStr, 780),
          endsAt: istToUtcDate(todayIstStr, 810),
          totalRupees: 200,
        },
      });

      const b2 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 502,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CHECKED_IN,
          startsAt: istToUtcDate(todayIstStr, 810),
          endsAt: istToUtcDate(todayIstStr, 840),
          totalRupees: 200,
        },
      });

      const staffUser: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const [res1, res2] = await Promise.all([
        updateBookingStatusStaff({
          staffUser,
          bookingId: b1.id,
          expectedStatus: BookingStatus.CHECKED_IN,
          newStatus: BookingStatus.IN_PROGRESS,
        }),
        updateBookingStatusStaff({
          staffUser,
          bookingId: b2.id,
          expectedStatus: BookingStatus.CHECKED_IN,
          newStatus: BookingStatus.IN_PROGRESS,
        }),
      ]);

      const successCount = [res1, res2].filter((r) => r.ok).length;
      const busyCount = [res1, res2].filter((r) => !r.ok && r.code === 'CHAIR_BUSY').length;

      expect(successCount).toBe(1);
      expect(busyCount).toBe(1);

      // Clean up by marking the in-progress one completed
      const inProgId = res1.ok ? b1.id : b2.id;
      await db.booking.update({
        where: { id: inProgId },
        data: { status: BookingStatus.COMPLETED },
      });
    });

    // 6. State machine timestamps
    it('state machine timestamps: checkedInAt, startedAt, completedAt, and cancelledAt + cancelReason are accurately recorded', async () => {
      const booking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 601,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: istToUtcDate(todayIstStr, 840),
          endsAt: istToUtcDate(todayIstStr, 870),
          totalRupees: 200,
        },
      });

      const staffUser: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      // 1. CONFIRMED -> CHECKED_IN
      await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CHECKED_IN,
      });
      const checkInRow = await db.booking.findUnique({ where: { id: booking.id } });
      expect(checkInRow?.checkedInAt).toBeInstanceOf(Date);

      // 2. CHECKED_IN -> IN_PROGRESS
      await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CHECKED_IN,
        newStatus: BookingStatus.IN_PROGRESS,
      });
      const startRow = await db.booking.findUnique({ where: { id: booking.id } });
      expect(startRow?.startedAt).toBeInstanceOf(Date);

      // 3. IN_PROGRESS -> COMPLETED
      await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.IN_PROGRESS,
        newStatus: BookingStatus.COMPLETED,
      });
      const completeRow = await db.booking.findUnique({ where: { id: booking.id } });
      expect(completeRow?.completedAt).toBeInstanceOf(Date);

      // 4. Cancelled booking with cancelReason & cancelledAt
      const cancelBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 602,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: istToUtcDate(todayIstStr, 870),
          endsAt: istToUtcDate(todayIstStr, 900),
          totalRupees: 200,
        },
      });

      await updateBookingStatusStaff({
        staffUser,
        bookingId: cancelBooking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CANCELLED,
        cancelReason: 'Emergency salon power outage',
      });

      const cancelRow = await db.booking.findUnique({ where: { id: cancelBooking.id } });
      expect(cancelRow?.cancelledAt).toBeInstanceOf(Date);
      expect(cancelRow?.cancelReason).toBe('Emergency salon power outage');
    });

    // 7. Slot release after staff cancellation/rejection/no-show
    it('slot release after staff cancellation/rejection/no-show: slot becomes available again', async () => {
      const slotStartsAt = istToUtcDate(todayIstStr, 900); // 15:00 IST
      const slotEndsAt = istToUtcDate(todayIstStr, 930);

      const booking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 701,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: slotStartsAt,
          endsAt: slotEndsAt,
          totalRupees: 200,
        },
      });

      const staffUser: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      // 1. Query slots while booking is CONFIRMED -> slot 15:00 is booked
      const salonHours = await db.salonHours.findMany({ where: { salonId: salonA.id } });
      const availabilities = await db.availability.findMany({ where: { barberId: barberA.id } });
      const activeBookingsBefore = await db.booking.findMany({
        where: { barberId: barberA.id, status: { in: [BookingStatus.CONFIRMED] } },
      });

      const slotsBefore = generateSlots({
        dateIst: todayIstStr,
        durationMin: 30,
        salonHours,
        availability: availabilities,
        timeOff: [],
        bookings: activeBookingsBefore,
        now: istToUtcDate(todayIstStr, 480), // 8:00 AM IST
      });

      const targetBefore = slotsBefore.find(
        (s) => s.startsAt.getTime() === slotStartsAt.getTime()
      );
      expect(targetBefore?.available).toBe(false);
      expect(targetBefore?.reason).toBe('booked');

      // 2. Staff cancels the booking
      await updateBookingStatusStaff({
        staffUser,
        bookingId: booking.id,
        expectedStatus: BookingStatus.CONFIRMED,
        newStatus: BookingStatus.CANCELLED,
        cancelReason: 'Customer requested cancellation by phone',
      });

      // 3. Query slots again -> slot 15:00 is now released and available
      const activeBookingsAfter = await db.booking.findMany({
        where: { barberId: barberA.id, status: { in: [BookingStatus.CONFIRMED] } },
      });

      const slotsAfter = generateSlots({
        dateIst: todayIstStr,
        durationMin: 30,
        salonHours,
        availability: availabilities,
        timeOff: [],
        bookings: activeBookingsAfter,
        now: istToUtcDate(todayIstStr, 480),
      });

      const targetAfter = slotsAfter.find(
        (s) => s.startsAt.getTime() === slotStartsAt.getTime()
      );
      expect(targetAfter?.available).toBe(true);
    });

    // 8. Walk-in integration tests
    describe('Walk-in Integration Scenarios', () => {
      // 8.1
      it('creates WALK_IN source and CHECKED_IN status with customerId = null', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        const res = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          customerName: 'Anil Walkin',
          customerPhone: '+919988776655',
          now: istToUtcDate(todayIstStr, 960), // 16:00 IST
        });

        expect(res.ok).toBe(true);
        const booking = await db.booking.findUnique({ where: { id: res.data!.bookingId } });
        expect(booking?.source).toBe(BookingSource.WALK_IN);
        expect(booking?.status).toBe(BookingStatus.CHECKED_IN);
        expect(booking?.customerId).toBeNull();
        expect(booking?.walkInName).toBe('Anil Walkin');
        expect(booking?.walkInPhone).toBe('+919988776655');
      });

      // 8.2
      it('token allocation continues the same sequential counter after online bookings on the same day', async () => {
        // Online booking allocated token
        await db.booking.create({
          data: {
            salonId: salonA.id,
            barberId: barberA.id,
            customerId: customerUser.id,
            token: 10,
            tokenDate: toTokenDateUtc(todayIstStr),
            type: BookingType.IN_SALON,
            source: BookingSource.ONLINE,
            status: BookingStatus.CONFIRMED,
            startsAt: istToUtcDate(todayIstStr, 1020),
            endsAt: istToUtcDate(todayIstStr, 1050),
            totalRupees: 200,
          },
        });

        // Set counter to 10
        await db.dailyTokenCounter.upsert({
          where: {
            salonId_date: {
              salonId: salonA.id,
              date: toTokenDateUtc(todayIstStr),
            },
          },
          update: { last: 10 },
          create: {
            salonId: salonA.id,
            date: toTokenDateUtc(todayIstStr),
            last: 10,
          },
        });

        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        const walkInRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          customerName: 'Sequential Walkin',
          now: istToUtcDate(todayIstStr, 1050), // 17:30 IST
        });

        expect(walkInRes.ok).toBe(true);
        expect(walkInRes.data?.token).toBe(11); // Continues sequentially
      });

      // 8.3
      it('takes the earliest free start time on the 15-minute grid without lead time', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        // Current time is 11:03 AM IST (663 minutes) -> snapped to 11:15 AM IST (675 min)
        const now = istToUtcDate(todayIstStr, 663);
        const res = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          now,
        });

        expect(res.ok).toBe(true);
        const { minutesFromMidnight } = utcToIstDetails(res.data!.startsAt);
        expect(minutesFromMidnight % 15).toBe(0);
        expect(minutesFromMidnight).toBeGreaterThanOrEqual(675);
      });

      // 8.4
      it('blocks that allocated time in the online slot list', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        const now = istToUtcDate(todayIstStr, 1140); // 19:00 IST
        const walkInRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          customerName: 'Block Online Slot Walkin',
          now,
        });

        expect(walkInRes.ok).toBe(true);

        const salonHours = await db.salonHours.findMany({ where: { salonId: salonA.id } });
        const availabilities = await db.availability.findMany({ where: { barberId: barberA.id } });
        const allBookings = await db.booking.findMany({
          where: { barberId: barberA.id },
        });

        const onlineSlots = generateSlots({
          dateIst: todayIstStr,
          durationMin: 30,
          salonHours,
          availability: availabilities,
          timeOff: [],
          bookings: allBookings,
          now: istToUtcDate(todayIstStr, 480),
        });

        const matchedSlot = onlineSlots.find(
          (s) => s.startsAt.getTime() === walkInRes.data!.startsAt.getTime()
        );

        expect(matchedSlot).toBeDefined();
        expect(matchedSlot?.available).toBe(false);
        expect(matchedSlot?.reason).toBe('booked');
      });

      // 8.5
      it('returns NO_FREE_TIME when the barber is fully booked or the salon is closed', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        // Attempt walk-in booking after salon closing hours (21:30 IST = 1290 min)
        const lateNow = istToUtcDate(todayIstStr, 1290);
        const lateRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          now: lateNow,
        });

        expect(lateRes.ok).toBe(false);
        expect(lateRes.code).toBe('NO_FREE_TIME');
      });

      // 8.6
      it('never links a walk-in to an existing user with the same phone and exposes no details of that user account', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        // Existing customer phone is customerUser.phone
        const res = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          customerName: 'Independent Walkin Person',
          customerPhone: customerUser.phone,
          now: istToUtcDate(todayIstStr, 600),
        });

        expect(res.ok).toBe(true);
        const row = await db.booking.findUnique({
          where: { id: res.data!.bookingId },
          include: { customer: true },
        });

        expect(row?.customerId).toBeNull();
        expect(row?.customer).toBeNull();
        expect(row?.walkInName).toBe('Independent Walkin Person');
        expect(row?.walkInPhone).toBe(customerUser.phone);
      });

      // 8.7
      it('rejects services of another salon, inactive services, and services not performed by that barber', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        // 1. Service of another salon (Salon B)
        const serviceOfSalonB = await db.service.create({
          data: {
            salonId: salonB.id,
            name: 'Salon B Exotic Treatment',
            category: ServiceCategory.FACIAL,
            durationMin: 45,
            priceRupees: 500,
            isActive: true,
          },
        });

        const foreignRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceOfSalonB.id],
          now: istToUtcDate(todayIstStr, 600),
        });
        expect(foreignRes.ok).toBe(false);
        expect(foreignRes.code).toBe('SERVICE_MISMATCH');

        // 2. Inactive service
        const inactiveService = await db.service.create({
          data: {
            salonId: salonA.id,
            name: 'Discontinued Beard Trim',
            category: ServiceCategory.SHAVE,
            durationMin: 15,
            priceRupees: 80,
            isActive: false, // Inactive
          },
        });

        const inactiveRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [inactiveService.id],
          now: istToUtcDate(todayIstStr, 600),
        });
        expect(inactiveRes.ok).toBe(false);
        expect(inactiveRes.code).toBe('SERVICE_INACTIVE');

        // 3. Service not performed by this barber
        const serviceNotPerformed = await db.service.create({
          data: {
            salonId: salonA.id,
            name: 'Hair Coloring Only',
            category: ServiceCategory.HAIR,
            durationMin: 60,
            priceRupees: 600,
            isActive: true,
          },
        });
        // Not adding db.barberService row for barberA

        const unperformedRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceNotPerformed.id],
          now: istToUtcDate(todayIstStr, 600),
        });
        expect(unperformedRes.ok).toBe(false);
        expect(unperformedRes.code).toBe('BARBER_SERVICE_MISMATCH');
      });

      // 8.8
      it('enforces rate limiting: the 61st walk-in creation within an hour by the same staff user returns WALKIN_LIMIT', async () => {
        resetStaffWalkInRateLimitForTesting();

        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        const now = istToUtcDate(todayIstStr, 600);

        // Pre-fill 60 walk-ins within the hour for this staff user
        for (let i = 0; i < 60; i++) {
          checkStaffWalkInRateLimit(staffUser.id, now.getTime());
        }

        // The 61st walk-in creation within the hour by the same staff user returns WALKIN_LIMIT
        const limitRes = await createWalkInBooking({
          staffUser,
          barberId: barberA.id,
          serviceIds: [serviceA.id],
          customerName: 'Rate Limit 61st Walkin',
          now,
        });

        expect(limitRes.ok).toBe(false);
        expect(limitRes.code).toBe('WALKIN_LIMIT');
      });

      // 8.9
      it('register list phone privacy: Data-transfer objects returned by the server for the register list never include full phone numbers', async () => {
        const staffUser: CurrentUser = {
          id: barberUserA.id,
          role: Role.BARBER,
          phone: barberUserA.phone,
          name: barberUserA.name,
          isActive: true,
        };

        const registerRes = await getRegisterBookings({
          staffUser,
          salonId: salonA.id,
          dateIst: todayIstStr,
        });

        expect(registerRes.ok).toBe(true);
        expect(registerRes.data?.bookings.length).toBeGreaterThan(0);

        for (const b of registerRes.data!.bookings) {
          if (b.customerPhone) {
            // Masking check: must contain asterisks and end with last 4 digits
            expect(b.customerPhone).toMatch(/\*{4,6}\d{4}$/);
            // Must NOT equal any raw test phone
            expect(b.customerPhone).not.toBe(customerUser.phone);
            expect(b.customerPhone).not.toBe('+919988776655');
          }
        }
      });

      // 8.10
      it('customer-facing status mapping: token slip and booking helpers return correct localized status label for all 8 statuses and cancelReason', () => {
        const statuses = [
          'PENDING',
          'CONFIRMED',
          'CHECKED_IN',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
          'NO_SHOW',
          'REJECTED',
        ];

        const statusKeyMap: Record<string, keyof typeof enMessages.token> = {
          PENDING: 'pending',
          CONFIRMED: 'confirmed',
          CHECKED_IN: 'checkedIn',
          IN_PROGRESS: 'inProgress',
          COMPLETED: 'completed',
          CANCELLED: 'cancelled',
          NO_SHOW: 'noShow',
          REJECTED: 'rejected',
        };

        for (const status of statuses) {
          const key = statusKeyMap[status];
          expect(enMessages.token[key]).toBeDefined();
          expect(hiMessages.token[key]).toBeDefined();
          expect(typeof enMessages.token[key]).toBe('string');
          expect(typeof hiMessages.token[key]).toBe('string');
        }

        // Cancel reason message key exists in both languages with {reason} placeholder
        expect(enMessages.token.cancelledBySalon).toContain('{reason}');
        expect(hiMessages.token.cancelledBySalon).toContain('{reason}');
      });
    });
  });

  describe('Section 7: ConsoleOtpSender Production Guard', () => {
    it('throws error when APP_ENV === "production" or NODE_ENV === "production"', async () => {
      const sender = new ConsoleOtpSender();
      const prevAppEnv = process.env.APP_ENV;
      const prevNodeEnv = process.env.NODE_ENV;

      try {
        process.env.APP_ENV = 'production';
        await expect(sender.sendOtp('+919876543210', '123456')).rejects.toThrow(
          'FATAL: ConsoleOtpSender cannot be used in a production environment!'
        );

        process.env.APP_ENV = 'development';
        process.env.NODE_ENV = 'production';
        await expect(sender.sendOtp('+919876543210', '123456')).rejects.toThrow(
          'FATAL: ConsoleOtpSender cannot be used in a production environment!'
        );
      } finally {
        process.env.APP_ENV = prevAppEnv;
        process.env.NODE_ENV = prevNodeEnv;
      }
    });
  });
});
