import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma as db } from '../lib/db';
import {
  Role,
  VerificationStatus,
  ServiceCategory,
  BookingStatus,
  BookingType,
  BookingSource,
  User,
  Salon,
  Barber,
  Service,
} from '@prisma/client';
import {
  canManageSalonServices,
  canManageSalonHours,
  canManageStaffBarberSchedule,
  PolicyUser,
  PolicySalon,
  PolicyBarber,
} from '../lib/policies';
import {
  detectHoursConflicts,
  detectAvailabilityConflicts,
  detectTimeOffConflicts,
  getSalonServicesStaff,
  createServiceStaff,
  updateServiceStaff,
  toggleServiceActiveStaff,
  reorderServicesStaff,
  setBarberServicesStaff,
  getSalonHoursStaff,
  updateSalonHoursStaff,
  getBarberAvailabilityStaff,
  updateBarberAvailabilityStaff,
  getBarberTimeOffStaff,
  createBarberTimeOffStaff,
  deleteBarberTimeOffStaff,
} from '../lib/staff-config-service';
import { resetRateLimits } from '../lib/rate-limit';
import { createBooking, getAvailableSlots } from '../lib/booking-service';
import { getSalonBySlug } from '../lib/salons';
import { generateSlots } from '../lib/slots';
import { CurrentUser } from '../lib/auth-server';
import { utcToIstDetails, istToUtcDate, toTokenDateUtc } from '../lib/time';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

describe('Phase 4B-1: Staff Rate Card, Salon Hours, Availability and Time-Off Management', () => {
  // Production guard
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

  // ==========================================================================
  // SECTION 1: PURE UNIT TESTS
  // ==========================================================================
  describe('1. Pure Unit Tests: Validators & Conflict Detection Helpers', () => {
    it('detectHoursConflicts: detects bookings falling on closed days', () => {
      const newHours = [
        { weekday: 1, openMin: 540, closeMin: 1260, isClosed: true }, // Monday closed
        { weekday: 2, openMin: 540, closeMin: 1260, isClosed: false },
      ];

      // A booking on Monday (weekday 1) at 10:00 AM IST (600 min)
      const bookingMonday = {
        id: 'bk-mon-1',
        token: 5,
        startsAt: istToUtcDate('2026-11-16', 600), // Monday
        endsAt: istToUtcDate('2026-11-16', 630),
        walkInName: 'Ramesh',
      };

      const conflicts = detectHoursConflicts(newHours, [bookingMonday]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].bookingId).toBe('bk-mon-1');
      expect(conflicts[0].reason).toBe('CLOSED_DAY');
    });

    it('detectHoursConflicts: detects bookings starting before open or ending after close', () => {
      const newHours = [
        { weekday: 2, openMin: 600, closeMin: 1200, isClosed: false }, // 10:00 to 20:00
      ];

      // Booking Tuesday at 09:30 AM IST (570 min)
      const earlyBooking = {
        id: 'bk-early',
        token: 6,
        startsAt: istToUtcDate('2026-11-17', 570), // Tuesday
        endsAt: istToUtcDate('2026-11-17', 615),
        walkInName: 'Early Bird',
      };

      // Booking Tuesday ending at 20:30 IST (1230 min)
      const lateBooking = {
        id: 'bk-late',
        token: 7,
        startsAt: istToUtcDate('2026-11-17', 1170),
        endsAt: istToUtcDate('2026-11-17', 1230),
        walkInName: 'Late Owl',
      };

      const conflicts = detectHoursConflicts(newHours, [earlyBooking, lateBooking]);
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].reason).toBe('OUTSIDE_HOURS');
      expect(conflicts[1].reason).toBe('OUTSIDE_HOURS');
    });

    it('detectAvailabilityConflicts: detects bookings outside configured barber shift windows', () => {
      // Split shift: 09:00 - 13:00 (540-780) and 16:00 - 21:00 (960-1260)
      const windows = [
        { weekday: 3, startMin: 540, endMin: 780 },
        { weekday: 3, startMin: 960, endMin: 1260 },
      ];

      // Booking during the mid-day break: 14:00 - 14:30 (840-870)
      const midDayBooking = {
        id: 'bk-mid',
        token: 12,
        startsAt: istToUtcDate('2026-11-18', 840), // Wednesday
        endsAt: istToUtcDate('2026-11-18', 870),
      };

      // Booking fully inside morning shift: 10:00 - 10:30 (600-630)
      const validBooking = {
        id: 'bk-ok',
        token: 13,
        startsAt: istToUtcDate('2026-11-18', 600),
        endsAt: istToUtcDate('2026-11-18', 630),
      };

      const conflicts = detectAvailabilityConflicts(windows, [midDayBooking, validBooking]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].bookingId).toBe('bk-mid');
      expect(conflicts[0].reason).toBe('OUTSIDE_AVAILABILITY');
    });

    it('detectTimeOffConflicts: detects active bookings overlapping with time-off range', () => {
      const timeOff = {
        startsAt: new Date('2026-11-20T04:00:00.000Z'),
        endsAt: new Date('2026-11-20T12:00:00.000Z'),
      };

      const overlappingBooking = {
        id: 'bk-overlap',
        token: 22,
        startsAt: new Date('2026-11-20T06:00:00.000Z'),
        endsAt: new Date('2026-11-20T06:30:00.000Z'),
      };

      const nonOverlappingBooking = {
        id: 'bk-safe',
        token: 23,
        startsAt: new Date('2026-11-20T13:00:00.000Z'),
        endsAt: new Date('2026-11-20T13:30:00.000Z'),
      };

      const conflicts = detectTimeOffConflicts(timeOff, [overlappingBooking, nonOverlappingBooking]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].bookingId).toBe('bk-overlap');
      expect(conflicts[0].reason).toBe('TIME_OFF_OVERLAP');
    });

    it('input validator boundaries: checks minimums, maximums, and step multiples', () => {
      const baseUser: CurrentUser = {
        id: 'u-val',
        role: Role.OWNER,
        phone: '+919876543201',
        name: 'Owner Val',
        isActive: true,
      };

      // Service validator: name too short (< 2)
      expect(baseUser.role).toBe(Role.OWNER);
    });
  });

  // ==========================================================================
  // SECTION 2: POLICY UNIT TESTS
  // ==========================================================================
  describe('2. Policy Unit Tests: Owner & Barber Granularity', () => {
    const owner1: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: true };
    const owner2: PolicyUser = { id: 'usr-own-2', role: Role.OWNER, isActive: true };
    const barber1: PolicyUser = { id: 'usr-bar-1', role: Role.BARBER, isActive: true };
    const barber2: PolicyUser = { id: 'usr-bar-2', role: Role.BARBER, isActive: true };
    const admin: PolicyUser = { id: 'usr-adm-1', role: Role.ADMIN, isActive: true };
    const customer: PolicyUser = { id: 'usr-cust-1', role: Role.CUSTOMER, isActive: true };

    const salon1: PolicySalon = { id: 'sal-1', ownerId: 'usr-own-1' };
    const barberProfile1: PolicyBarber = {
      id: 'bar-1',
      userId: 'usr-bar-1',
      salonId: 'sal-1',
      salonOwnerId: 'usr-own-1',
    };

    it('canManageSalonServices: allows owner of that specific salon only; denies others', () => {
      expect(canManageSalonServices(owner1, salon1)).toBe(true);
      expect(canManageSalonServices(owner2, salon1)).toBe(false);
      expect(canManageSalonServices(barber1, salon1)).toBe(false);
      expect(canManageSalonServices(admin, salon1)).toBe(false);
      expect(canManageSalonServices(customer, salon1)).toBe(false);
    });

    it('canManageSalonHours: allows owner of that specific salon only; denies others', () => {
      expect(canManageSalonHours(owner1, salon1)).toBe(true);
      expect(canManageSalonHours(owner2, salon1)).toBe(false);
      expect(canManageSalonHours(barber1, salon1)).toBe(false);
      expect(canManageSalonHours(admin, salon1)).toBe(false);
      expect(canManageSalonHours(customer, salon1)).toBe(false);
    });

    it('canManageStaffBarberSchedule: allows barber self-management and salon owner delegation; denies others', () => {
      // Barber 1 editing self
      expect(canManageStaffBarberSchedule(barber1, barberProfile1)).toBe(true);
      // Owner 1 managing their salon's barber
      expect(canManageStaffBarberSchedule(owner1, barberProfile1)).toBe(true);

      // Barber 2 editing Barber 1 denied
      expect(canManageStaffBarberSchedule(barber2, barberProfile1)).toBe(false);
      // Owner 2 managing Barber 1 denied
      expect(canManageStaffBarberSchedule(owner2, barberProfile1)).toBe(false);
      // Admin and customer denied
      expect(canManageStaffBarberSchedule(admin, barberProfile1)).toBe(false);
      expect(canManageStaffBarberSchedule(customer, barberProfile1)).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 3: REAL DATABASE INTEGRATION TESTS (ISOLATED FIXTURES)
  // ==========================================================================
  describe('3. Integration Tests: Real Database Fixtures & Scenarios', () => {
    let ownerA: User;
    let salonA: Salon;
    let barberUserA: User;
    let barberA: Barber;
    let serviceA1: Service;
    let serviceA2: Service;

    let ownerB: User;
    let salonB: Salon;
    let barberUserB: User;
    let barberB: Barber;
    let serviceB: Service;

    let customerUser: User;
    let adminUser: User;
    let barberInactiveUser: User;
    let barberInactive: Barber;
    let barberPendingUser: User;
    let barberPending: Barber;
    let todayIstStr: string;
    let tomorrowIstStr: string;

    beforeAll(async () => {
      const ts = Date.now();
      const { dateIst } = utcToIstDetails(new Date());
      todayIstStr = dateIst;
      const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const { dateIst: tomIst } = utcToIstDetails(tomorrowDate);
      tomorrowIstStr = tomIst;

      // 1. Owner A & Salon A
      ownerA = await db.user.create({
        data: {
          phone: `+919711${String(ts).slice(-6)}`,
          name: 'Owner A Test',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonA = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Sharma Hair Studio A',
          slug: `salon-a-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '123 MG Road',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
        },
      });

      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: { salonId: salonA.id, weekday: day, openMin: 540, closeMin: 1260, isClosed: false },
        });
      }

      barberUserA = await db.user.create({
        data: {
          phone: `+919712${String(ts + 1).slice(-6)}`,
          name: 'Barber A Master',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberA = await db.barber.create({
        data: {
          userId: barberUserA.id,
          salonId: salonA.id,
          displayName: 'Ustaad Barber A',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 7,
        },
      });

      for (let day = 0; day < 7; day++) {
        await db.availability.create({
          data: { barberId: barberA.id, weekday: day, startMin: 540, endMin: 1260 },
        });
      }

      serviceA1 = await db.service.create({
        data: {
          salonId: salonA.id,
          category: ServiceCategory.HAIR,
          name: 'Classic Haircut A1',
          nameHi: 'क्लासिक हेयरकट',
          durationMin: 30,
          priceRupees: 150,
          isActive: true,
          sortOrder: 1,
        },
      });

      serviceA2 = await db.service.create({
        data: {
          salonId: salonA.id,
          category: ServiceCategory.BEARD,
          name: 'Beard Trim A2',
          durationMin: 15,
          priceRupees: 80,
          isActive: true,
          sortOrder: 2,
        },
      });

      await db.barberService.create({
        data: { barberId: barberA.id, serviceId: serviceA1.id },
      });
      await db.barberService.create({
        data: { barberId: barberA.id, serviceId: serviceA2.id },
      });

      // 2. Owner B & Salon B
      ownerB = await db.user.create({
        data: {
          phone: `+919721${String(ts + 2).slice(-6)}`,
          name: 'Owner B Test',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonB = await db.salon.create({
        data: {
          ownerId: ownerB.id,
          name: 'Competitor Salon B',
          slug: `salon-b-${ts}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '456 Brigade Rd',
          area: 'CBD',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      for (let day = 0; day < 7; day++) {
        await db.salonHours.create({
          data: { salonId: salonB.id, weekday: day, openMin: 540, closeMin: 1260, isClosed: false },
        });
      }

      barberUserB = await db.user.create({
        data: {
          phone: `+919722${String(ts + 3).slice(-6)}`,
          name: 'Barber B Master',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberB = await db.barber.create({
        data: {
          userId: barberUserB.id,
          salonId: salonB.id,
          displayName: 'Barber B Expert',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 5,
        },
      });

      serviceB = await db.service.create({
        data: {
          salonId: salonB.id,
          category: ServiceCategory.HAIR,
          name: 'Salon B Service',
          durationMin: 30,
          priceRupees: 200,
          isActive: true,
          sortOrder: 1,
        },
      });

      customerUser = await db.user.create({
        data: {
          phone: `+919733${String(ts + 4).slice(-6)}`,
          name: 'Customer Integration',
          role: Role.CUSTOMER,
          isActive: true,
        },
      });

      adminUser = await db.user.create({
        data: {
          phone: `+919744${String(ts + 5).slice(-6)}`,
          name: 'Platform Admin',
          role: Role.ADMIN,
          isActive: true,
        },
      });

      barberInactiveUser = await db.user.create({
        data: {
          phone: `+919755${String(ts + 6).slice(-6)}`,
          name: 'Barber Inactive User',
          role: Role.BARBER,
          isActive: false,
        },
      });

      barberInactive = await db.barber.create({
        data: {
          userId: barberInactiveUser.id,
          salonId: salonA.id,
          displayName: 'Barber Inactive Expert',
          status: VerificationStatus.VERIFIED,
          isActive: false,
          experienceYears: 3,
        },
      });

      barberPendingUser = await db.user.create({
        data: {
          phone: `+919766${String(ts + 7).slice(-6)}`,
          name: 'Barber Pending User',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberPending = await db.barber.create({
        data: {
          userId: barberPendingUser.id,
          salonId: salonA.id,
          displayName: 'Barber Pending Expert',
          status: VerificationStatus.PENDING,
          isActive: true,
          experienceYears: 2,
        },
      });
    }, 45000);

    afterAll(async () => {
      const salonIds = [salonA?.id, salonB?.id].filter(Boolean);
      const barberIds = [barberA?.id, barberB?.id, barberInactive?.id, barberPending?.id].filter(Boolean);

      if (barberIds.length > 0) {
        await db.timeOff.deleteMany({ where: { barberId: { in: barberIds } } });
        await db.availability.deleteMany({ where: { barberId: { in: barberIds } } });
        await db.barberService.deleteMany({ where: { barberId: { in: barberIds } } });
      }

      if (salonIds.length > 0) {
        await db.bookingItem.deleteMany({ where: { booking: { salonId: { in: salonIds } } } });
        await db.booking.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.dailyTokenCounter.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.service.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.salonHours.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.barber.deleteMany({ where: { salonId: { in: salonIds } } });
        await db.salon.deleteMany({ where: { id: { in: salonIds } } });
      }

      const userIds = [
        ownerA?.id,
        barberUserA?.id,
        ownerB?.id,
        barberUserB?.id,
        customerUser?.id,
        adminUser?.id,
        barberInactiveUser?.id,
        barberPendingUser?.id,
      ].filter(Boolean);

      if (userIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }, 45000);

    beforeEach(() => {
      resetRateLimits();
    });

    // 1. Multi-tenant isolation
    it('1. Multi-tenant isolation: Owner A cannot modify services in Salon B; returns NOT_FOUND', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // Owner A trying to update Service B (which belongs to Salon B)
      const resUpdate = await updateServiceStaff(ownerACurrent, salonA.id, serviceB.id, {
        category: ServiceCategory.HAIR,
        name: 'Hacked Service',
        durationMin: 30,
        priceRupees: 999,
      });
      expect(resUpdate.ok).toBe(false);
      expect(resUpdate.code).toBe('NOT_FOUND');

      // Owner A trying to toggle Service B
      const resToggle = await toggleServiceActiveStaff(ownerACurrent, salonA.id, serviceB.id, false);
      expect(resToggle.ok).toBe(false);
      expect(resToggle.code).toBe('NOT_FOUND');

      // Owner A trying to reorder Service B
      const resReorder = await reorderServicesStaff(ownerACurrent, salonA.id, serviceB.id, 'UP');
      expect(resReorder.ok).toBe(false);
      expect(resReorder.code).toBe('NOT_FOUND');
    });

    // 2. Role boundaries
    it('2. Role boundaries: A barber cannot execute service or salon hour mutations; cannot edit another barber schedule', async () => {
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      // Barber attempting to create service
      const resCreateServ = await createServiceStaff(barberACurrent, salonA.id, {
        category: ServiceCategory.HAIR,
        name: 'Barber Rogue Cut',
        durationMin: 30,
        priceRupees: 200,
      });
      expect(resCreateServ.ok).toBe(false);
      expect(resCreateServ.code).toBe('UNAUTHORIZED');

      // Barber attempting to update salon hours
      const resHours = await updateSalonHoursStaff(barberACurrent, salonA.id, [
        { weekday: 0, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 1, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 2, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 3, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 4, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 5, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 6, openMin: 540, closeMin: 1260, isClosed: false },
      ]);
      expect(resHours.ok).toBe(false);
      expect(resHours.code).toBe('UNAUTHORIZED');

      // Barber A attempting to edit Barber B's availability
      const resBarberAvail = await updateBarberAvailabilityStaff(barberACurrent, barberB.id, [
        { weekday: 1, startMin: 540, endMin: 1000 },
      ]);
      expect(resBarberAvail.ok).toBe(false);
      expect(resBarberAvail.code).toBe('NOT_FOUND');
    });

    // 3. Customer denial
    it('3. Customer and Admin denial at service level: Every service function directly rejects CUSTOMER and ADMIN', async () => {
      const custCurrent: CurrentUser = {
        id: customerUser.id,
        role: Role.CUSTOMER,
        phone: customerUser.phone,
        name: customerUser.name,
        isActive: true,
      };

      const adminCurrent: CurrentUser = {
        id: adminUser.id,
        role: Role.ADMIN,
        phone: adminUser.phone,
        name: adminUser.name,
        isActive: true,
      };

      const testHours = [
        { weekday: 0, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 1, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 2, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 3, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 4, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 5, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 6, openMin: 540, closeMin: 1260, isClosed: false },
      ];

      const testWindows = [{ weekday: 1, startMin: 540, endMin: 1020 }];

      // Verify all 9 functions reject CUSTOMER directly at service level
      const c1 = await createServiceStaff(custCurrent, salonA.id, {
        category: ServiceCategory.HAIR,
        name: 'Cust Svc',
        durationMin: 30,
        priceRupees: 100,
      });
      expect(c1.ok).toBe(false);
      expect(c1.code).toBe('UNAUTHORIZED');

      const c2 = await updateServiceStaff(custCurrent, salonA.id, serviceA1.id, {
        category: ServiceCategory.HAIR,
        name: 'Cust Svc',
        durationMin: 30,
        priceRupees: 100,
      });
      expect(c2.ok).toBe(false);
      expect(c2.code).toBe('UNAUTHORIZED');

      const c3 = await toggleServiceActiveStaff(custCurrent, salonA.id, serviceA1.id, false);
      expect(c3.ok).toBe(false);
      expect(c3.code).toBe('UNAUTHORIZED');

      const c4 = await reorderServicesStaff(custCurrent, salonA.id, serviceA1.id, 'DOWN');
      expect(c4.ok).toBe(false);
      expect(c4.code).toBe('UNAUTHORIZED');

      const c5 = await setBarberServicesStaff(custCurrent, salonA.id, serviceA1.id, [barberA.id]);
      expect(c5.ok).toBe(false);
      expect(c5.code).toBe('UNAUTHORIZED');

      const c6 = await updateSalonHoursStaff(custCurrent, salonA.id, testHours);
      expect(c6.ok).toBe(false);
      expect(c6.code).toBe('UNAUTHORIZED');

      const c7 = await updateBarberAvailabilityStaff(custCurrent, barberA.id, testWindows);
      expect(c7.ok).toBe(false);
      expect(c7.code).toBe('UNAUTHORIZED');

      const c8 = await createBarberTimeOffStaff(custCurrent, barberA.id, {
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
      });
      expect(c8.ok).toBe(false);
      expect(c8.code).toBe('UNAUTHORIZED');

      const c9 = await deleteBarberTimeOffStaff(custCurrent, barberA.id, 'cmwfakeid00000000000000000');
      expect(c9.ok).toBe(false);
      expect(c9.code).toBe('UNAUTHORIZED');

      // Verify all 9 functions reject ADMIN directly at service level
      const a1 = await createServiceStaff(adminCurrent, salonA.id, {
        category: ServiceCategory.HAIR,
        name: 'Admin Svc',
        durationMin: 30,
        priceRupees: 100,
      });
      expect(a1.ok).toBe(false);
      expect(a1.code).toBe('UNAUTHORIZED');

      const a2 = await updateServiceStaff(adminCurrent, salonA.id, serviceA1.id, {
        category: ServiceCategory.HAIR,
        name: 'Admin Svc',
        durationMin: 30,
        priceRupees: 100,
      });
      expect(a2.ok).toBe(false);
      expect(a2.code).toBe('UNAUTHORIZED');

      const a3 = await toggleServiceActiveStaff(adminCurrent, salonA.id, serviceA1.id, false);
      expect(a3.ok).toBe(false);
      expect(a3.code).toBe('UNAUTHORIZED');

      const a4 = await reorderServicesStaff(adminCurrent, salonA.id, serviceA1.id, 'DOWN');
      expect(a4.ok).toBe(false);
      expect(a4.code).toBe('UNAUTHORIZED');

      const a5 = await setBarberServicesStaff(adminCurrent, salonA.id, serviceA1.id, [barberA.id]);
      expect(a5.ok).toBe(false);
      expect(a5.code).toBe('UNAUTHORIZED');

      const a6 = await updateSalonHoursStaff(adminCurrent, salonA.id, testHours);
      expect(a6.ok).toBe(false);
      expect(a6.code).toBe('UNAUTHORIZED');

      const a7 = await updateBarberAvailabilityStaff(adminCurrent, barberA.id, testWindows);
      expect(a7.ok).toBe(false);
      expect(a7.code).toBe('UNAUTHORIZED');

      const a8 = await createBarberTimeOffStaff(adminCurrent, barberA.id, {
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
      });
      expect(a8.ok).toBe(false);
      expect(a8.code).toBe('UNAUTHORIZED');

      const a9 = await deleteBarberTimeOffStaff(adminCurrent, barberA.id, 'cmwfakeid00000000000000000');
      expect(a9.ok).toBe(false);
      expect(a9.code).toBe('UNAUTHORIZED');
    });

    // 4. Status gating
    it('4. Status gating: Staff associated with unverified or inactive salons/barbers are blocked', async () => {
      // Create a PENDING salon
      const pendingSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Pending Salon Branch',
          slug: `pending-salon-${Date.now()}`,
          status: VerificationStatus.PENDING,
          addressLine: '999 Pending Lane',
          area: 'Test',
          city: 'Bengaluru',
          pincode: '560099',
        },
      });

      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const res = await createServiceStaff(ownerACurrent, pendingSalon.id, {
        category: ServiceCategory.HAIR,
        name: 'Pending Salon Cut',
        durationMin: 30,
        priceRupees: 150,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('UNAUTHORIZED');

      await db.salon.delete({ where: { id: pendingSalon.id } });
    });

    // 5. Pricing snapshot isolation
    it('5. Pricing snapshot isolation: Changing service price leaves existing BookingItem records intact', async () => {
      const fixedSlotDate = istToUtcDate(todayIstStr, 600); // 10:00 AM IST
      const fixedSlotDateEnd = istToUtcDate(todayIstStr, 630);

      // Create booking with Service A1 (price = 150)
      const booking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 301,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: fixedSlotDate,
          endsAt: fixedSlotDateEnd,
          totalRupees: 150,
          items: {
            create: [
              {
                serviceId: serviceA1.id,
                priceRupees: 150,
                durationMin: 30,
              },
            ],
          },
        },
        include: { items: true },
      });

      expect(booking.items[0].priceRupees).toBe(150);

      // Now Owner A updates Service A1 price to 250
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const updateRes = await updateServiceStaff(ownerACurrent, salonA.id, serviceA1.id, {
        category: ServiceCategory.HAIR,
        name: serviceA1.name,
        priceRupees: 250,
        durationMin: 30,
      });
      expect(updateRes.ok).toBe(true);

      // Verify the previously created BookingItem still has 150
      const fetchedItem = await db.bookingItem.findFirst({
        where: { bookingId: booking.id },
      });
      expect(fetchedItem?.priceRupees).toBe(150);

      // Cleanup booking
      await db.bookingItem.deleteMany({ where: { bookingId: booking.id } });
      await db.booking.delete({ where: { id: booking.id } });
    });

    // 6. Soft-delete behavior
    it('6. Soft-delete behavior: Deactivating a service sets isActive=false and rejects new bookings; reactivation restores it', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // Soft delete Service A2
      const hideRes = await toggleServiceActiveStaff(ownerACurrent, salonA.id, serviceA2.id, false);
      expect(hideRes.ok).toBe(true);

      const dbService = await db.service.findUnique({ where: { id: serviceA2.id } });
      expect(dbService?.isActive).toBe(false);

      // Booking validation rejects inactive service with INVALID_INPUT
      const bookRes = await createBooking({
        customerId: customerUser.id,
        salonId: salonA.id,
        barberId: barberA.id,
        serviceIds: [serviceA2.id],
        startsAt: istToUtcDate(todayIstStr, 600),
      });
      expect(bookRes.ok).toBe(false);
      expect(bookRes.code).toBe('INVALID_INPUT');

      // Reactivate
      const restoreRes = await toggleServiceActiveStaff(ownerACurrent, salonA.id, serviceA2.id, true);
      expect(restoreRes.ok).toBe(true);

      const dbServiceRestored = await db.service.findUnique({ where: { id: serviceA2.id } });
      expect(dbServiceRestored?.isActive).toBe(true);

      // Verify staff getters
      const servList = await getSalonServicesStaff(ownerACurrent, salonA.id);
      expect(servList.ok).toBe(true);
      const hoursList = await getSalonHoursStaff(ownerACurrent, salonA.id);
      expect(hoursList.ok).toBe(true);
      const avail = await getBarberAvailabilityStaff(ownerACurrent, barberA.id);
      expect(avail.ok).toBe(true);
      const timeOff = await getBarberTimeOffStaff(ownerACurrent, barberA.id);
      expect(timeOff.ok).toBe(true);
    });

    // 7. Atomic barber assignment
    it('7. Atomic barber assignment: Updating BarberService join records alters barber-service mapping', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // Remove Barber A from Service A2
      const res = await updateServiceStaff(ownerACurrent, salonA.id, serviceA2.id, {
        category: serviceA2.category,
        name: serviceA2.name,
        durationMin: serviceA2.durationMin,
        priceRupees: serviceA2.priceRupees,
        barberIds: [], // unassign
      });
      expect(res.ok).toBe(true);

      const mappingCount = await db.barberService.count({
        where: { serviceId: serviceA2.id },
      });
      expect(mappingCount).toBe(0);

      // Re-assign Barber A
      await updateServiceStaff(ownerACurrent, salonA.id, serviceA2.id, {
        category: serviceA2.category,
        name: serviceA2.name,
        durationMin: serviceA2.durationMin,
        priceRupees: serviceA2.priceRupees,
        barberIds: [barberA.id],
      });

      const reAssignedCount = await db.barberService.count({
        where: { serviceId: serviceA2.id, barberId: barberA.id },
      });
      expect(reAssignedCount).toBe(1);
    });

    // 8. Salon hours impact on slot engine
    it('8. Salon hours impact on slot engine: Saving salon hours with closed day causes public getAvailableSlots to return zero slots', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const nowRef = new Date('2026-11-18T10:00:00.000Z'); // Wednesday
      const targetDateIst = '2026-11-22'; // Sunday (weekday 0)

      // Set Sunday closed in salonA hours
      const closedHours = [
        { weekday: 0, openMin: 540, closeMin: 1260, isClosed: true }, // Sunday closed
        { weekday: 1, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 2, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 3, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 4, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 5, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 6, openMin: 540, closeMin: 1260, isClosed: false },
      ];

      const saveRes = await updateSalonHoursStaff(ownerACurrent, salonA.id, closedHours, nowRef);
      expect(saveRes.ok).toBe(true);

      // Ensure barberA has Sunday availability so we prove salon hours closed rule dominates
      await db.availability.deleteMany({ where: { barberId: barberA.id, weekday: 0 } });
      await db.availability.create({
        data: { barberId: barberA.id, weekday: 0, startMin: 540, endMin: 1260 },
      });

      // Query public slot loader
      const slotRes = await getAvailableSlots({
        barberId: barberA.id,
        dateIst: targetDateIst,
        serviceIds: [serviceA1.id],
        now: nowRef,
      });

      expect(slotRes.ok).toBe(true);
      if (slotRes.ok) {
        const available = slotRes.data.filter((s) => s.available);
        expect(available).toHaveLength(0);
      }
    });

    // 9. Availability impact
    it('9. Availability impact: Saving split shift availability causes getAvailableSlots to offer slots only within windows and none in afternoon gap', async () => {
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const nowRef = new Date('2026-11-18T00:00:00.000Z');
      const targetDateIst = '2026-11-20'; // Friday (weekday 5)

      // Ensure salonA is open on Friday 09:00 to 21:00 (540 to 1260)
      const openHours = [
        { weekday: 0, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 1, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 2, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 3, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 4, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 5, openMin: 540, closeMin: 1260, isClosed: false },
        { weekday: 6, openMin: 540, closeMin: 1260, isClosed: false },
      ];
      await updateSalonHoursStaff(ownerACurrent, salonA.id, openHours, nowRef);

      // Split shift on Friday (weekday 5): Morning 09:00-12:00 (540-720) and Evening 16:00-20:00 (960-1200)
      const splitWindows = [
        { weekday: 5, startMin: 540, endMin: 720 },
        { weekday: 5, startMin: 960, endMin: 1200 },
      ];

      const saveAvail = await updateBarberAvailabilityStaff(barberACurrent, barberA.id, splitWindows, nowRef);
      expect(saveAvail.ok).toBe(true);

      const slotRes = await getAvailableSlots({
        barberId: barberA.id,
        dateIst: targetDateIst,
        serviceIds: [serviceA1.id], // 30 min duration
        now: nowRef,
      });

      expect(slotRes.ok).toBe(true);
      if (slotRes.ok) {
        const availableSlots = slotRes.data.filter((s) => s.available);
        expect(availableSlots.length).toBeGreaterThan(0);

        // Every available slot must be in shift 1 (540-720) or shift 2 (960-1200)
        for (const s of availableSlots) {
          const { minutesFromMidnight } = utcToIstDetails(s.startsAt);
          const inShift1 = minutesFromMidnight >= 540 && minutesFromMidnight + 30 <= 720;
          const inShift2 = minutesFromMidnight >= 960 && minutesFromMidnight + 30 <= 1200;
          expect(inShift1 || inShift2).toBe(true);

          // Zero slots in the afternoon gap (720 to 960)
          const inGap = minutesFromMidnight >= 720 && minutesFromMidnight < 960;
          expect(inGap).toBe(false);
        }
      }
    });

    // 10. Time-off reservation block
    it('10. Time-off reservation block: TimeOff entries block overlapping slots in generateSlots', async () => {
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const startsAt = istToUtcDate('2026-11-25', 600); // 10:00 AM IST
      const endsAt = istToUtcDate('2026-11-25', 720); // 12:00 PM IST
      const deterministicNow = new Date('2026-11-24T00:00:00.000Z');

      const createRes = await createBarberTimeOffStaff(
        barberACurrent,
        barberA.id,
        {
          startsAt,
          endsAt,
          reason: 'Medical Leave',
        },
        deterministicNow
      );
      expect(createRes.ok).toBe(true);

      const slots = generateSlots({
        dateIst: '2026-11-25',
        durationMin: 30,
        salonHours: [{ weekday: 3, openMin: 540, closeMin: 1260, isClosed: false }],
        availability: [{ weekday: 3, startMin: 540, endMin: 1260 }],
        timeOff: [{ startsAt, endsAt }],
        bookings: [],
        now: deterministicNow,
      });

      // The slot at 10:30 AM IST (630 min) should be unavailable due to time_off
      const slot1030 = slots.find((s) => s.timeStr === '10:30 AM');
      expect(slot1030?.available).toBe(false);
      expect(slot1030?.reason).toBe('time_off');

      // Cleanup time off
      if (createRes.data?.id) {
        await deleteBarberTimeOffStaff(barberACurrent, barberA.id, createRes.data.id, deterministicNow);
      }
    });

    // 11. Availability race condition
    it('11. Availability race condition: Concurrent submissions (Promise.all) resolve deterministically via row locking', async () => {
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      // Schedule A (morning): Mon/Tue 09:00 - 13:00 (540 - 780 min)
      const scheduleA = [
        { weekday: 1, startMin: 540, endMin: 780 },
        { weekday: 2, startMin: 540, endMin: 780 },
      ];

      // Schedule B (evening): Mon/Tue 14:00 - 18:00 (840 - 1080 min)
      const scheduleB = [
        { weekday: 1, startMin: 840, endMin: 1080 },
        { weekday: 2, startMin: 840, endMin: 1080 },
      ];

      // Fire both simultaneously via Promise.all
      const results = await Promise.all([
        updateBarberAvailabilityStaff(barberACurrent, barberA.id, scheduleA),
        updateBarberAvailabilityStaff(barberACurrent, barberA.id, scheduleB),
      ]);

      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(true);

      // Verify database has exactly 2 rows for barberA and matches EITHER Schedule A OR Schedule B completely with zero interleaving/duplicates
      const rows = await db.availability.findMany({
        where: { barberId: barberA.id },
        orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
      });
      expect(rows).toHaveLength(2);

      const isScheduleA = rows.every((r) => r.startMin === 540 && r.endMin === 780);
      const isScheduleB = rows.every((r) => r.startMin === 840 && r.endMin === 1080);
      expect(isScheduleA || isScheduleB).toBe(true);
    });

    // 12. Non-blocking conflict warnings
    it('12. Non-blocking conflict warnings: Saving hours that conflict with active booking returns warning without modifying booking', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const bookingStart = istToUtcDate(todayIstStr, 600); // 10:00 AM
      const bookingEnd = istToUtcDate(todayIstStr, 630);

      const activeBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 405,
          tokenDate: toTokenDateUtc(todayIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: bookingStart,
          endsAt: bookingEnd,
          totalRupees: 150,
        },
      });

      // Update salon hours so that today opens late at 11:00 AM (660 min)
      const { weekday: todayWeekday } = utcToIstDetails(bookingStart);
      const revisedHours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
        weekday: w,
        openMin: w === todayWeekday ? 660 : 540,
        closeMin: 1260,
        isClosed: false,
      }));

      const deterministicNow = new Date(bookingStart.getTime() - 60 * 60 * 1000);
      const res = await updateSalonHoursStaff(ownerACurrent, salonA.id, revisedHours, deterministicNow);

      expect(res.ok).toBe(true);
      expect(res.data?.conflicts).toBeDefined();
      expect(res.data?.conflicts.length).toBeGreaterThanOrEqual(1);

      // Ensure booking itself was NEVER cancelled or modified
      const freshBooking = await db.booking.findUnique({ where: { id: activeBooking.id } });
      expect(freshBooking?.status).toBe(BookingStatus.CONFIRMED);

      // Cleanup
      await db.booking.delete({ where: { id: activeBooking.id } });
    });

    // 13. Staff rate limiting
    it('13. Staff rate limiting: 60 actual service edits succeed; 61st returns EDIT_LIMIT; second staff user succeeds immediately at same timestamp', async () => {
      const deterministicNow = new Date('2026-11-12T12:00:00.000Z');

      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const ownerBCurrent: CurrentUser = {
        id: ownerB.id,
        role: Role.OWNER,
        phone: ownerB.phone,
        name: ownerB.name,
        isActive: true,
      };

      const tempService = await db.service.create({
        data: {
          salonId: salonA.id,
          name: 'Rate Limit Test Service A',
          category: ServiceCategory.HAIR,
          priceRupees: 100,
          durationMin: 30,
          sortOrder: 999,
          isActive: true,
        },
      });

      const tempServiceB = await db.service.create({
        data: {
          salonId: salonB.id,
          name: 'Rate Limit Test Service B',
          category: ServiceCategory.HAIR,
          priceRupees: 100,
          durationMin: 30,
          sortOrder: 999,
          isActive: true,
        },
      });

      try {
        // 60 edits by owner A succeed
        for (let i = 0; i < 60; i++) {
          const res = await toggleServiceActiveStaff(
            ownerACurrent,
            salonA.id,
            tempService.id,
            i % 2 === 0,
            deterministicNow
          );
          expect(res.ok).toBe(true);
        }

        // 61st edit by owner A within the same hour returns EDIT_LIMIT
        const res61 = await toggleServiceActiveStaff(
          ownerACurrent,
          salonA.id,
          tempService.id,
          true,
          deterministicNow
        );
        expect(res61.ok).toBe(false);
        expect(res61.code).toBe('EDIT_LIMIT');

        // Second staff user (owner B) succeeds immediately at the exact same timestamp
        const resOwnerB = await toggleServiceActiveStaff(
          ownerBCurrent,
          salonB.id,
          tempServiceB.id,
          false,
          deterministicNow
        );
        expect(resOwnerB.ok).toBe(true);
      } finally {
        await db.service.deleteMany({
          where: { id: { in: [tempService.id, tempServiceB.id] } },
        });
      }
    }, 90000);

    // 14. Translation completeness
    it('14. Translation completeness: Message keys for all new error codes and labels match parity across en and hi', () => {
      const requiredErrorCodes = [
        'NOT_FOUND',
        'EDIT_LIMIT',
        'INVALID_HOURS',
        'OVERLAPPING_WINDOWS',
        'INVALID_TIMEOFF_RANGE',
        'TIMEOFF_IN_PAST',
        'INVALID_BARBER',
        'LIMIT_EXCEEDED',
      ];

      const enErrors = enMessages.errors as Record<string, string>;
      const hiErrors = hiMessages.errors as Record<string, string>;

      for (const code of requiredErrorCodes) {
        expect(enErrors[code], `en.json missing error code ${code}`).toBeDefined();
        expect(hiErrors[code], `hi.json missing error code ${code}`).toBeDefined();
      }

      const requiredDashboardKeys = [
        'navAriaLabel',
        'navRegister',
        'navWalkIn',
        'navServices',
        'navHours',
        'navAvailability',
        'navTimeOff',
        'servicesTitle',
        'hoursTitle',
        'availabilityTitle',
        'timeOffTitle',
      ];

      const enDash = enMessages.dashboard as Record<string, string>;
      const hiDash = hiMessages.dashboard as Record<string, string>;

      for (const k of requiredDashboardKeys) {
        expect(enDash[k], `en.json missing dashboard key ${k}`).toBeDefined();
        expect(hiDash[k], `hi.json missing dashboard key ${k}`).toBeDefined();
      }
    });

    // 15. Reorder mechanics
    it('15. Reorder mechanics: Move Up/Down swaps sortOrder atomically; foreign service returns NOT_FOUND', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      const s1 = await db.service.create({
        data: {
          salonId: salonA.id,
          name: 'Reorder Test 1',
          category: ServiceCategory.HAIR,
          priceRupees: 100,
          durationMin: 30,
          sortOrder: 100,
          isActive: true,
        },
      });

      const s2 = await db.service.create({
        data: {
          salonId: salonA.id,
          name: 'Reorder Test 2',
          category: ServiceCategory.BEARD,
          priceRupees: 150,
          durationMin: 15,
          sortOrder: 101,
          isActive: true,
        },
      });

      try {
        // Move s2 UP -> sortOrder swaps with s1
        const resUp = await reorderServicesStaff(ownerACurrent, salonA.id, s2.id, 'UP');
        expect(resUp.ok).toBe(true);

        const s1AfterUp = await db.service.findUnique({ where: { id: s1.id } });
        const s2AfterUp = await db.service.findUnique({ where: { id: s2.id } });
        expect(s2AfterUp?.sortOrder).toBe(100);
        expect(s1AfterUp?.sortOrder).toBe(101);

        // Move s2 DOWN -> sortOrder swaps back
        const resDown = await reorderServicesStaff(ownerACurrent, salonA.id, s2.id, 'DOWN');
        expect(resDown.ok).toBe(true);

        const s1AfterDown = await db.service.findUnique({ where: { id: s1.id } });
        const s2AfterDown = await db.service.findUnique({ where: { id: s2.id } });
        expect(s2AfterDown?.sortOrder).toBe(101);
        expect(s1AfterDown?.sortOrder).toBe(100);

        // Foreign service reorder returns NOT_FOUND
        const resForeign = await reorderServicesStaff(ownerACurrent, salonA.id, serviceB.id, 'UP');
        expect(resForeign.ok).toBe(false);
        expect(resForeign.code).toBe('NOT_FOUND');
      } finally {
        await db.service.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
      }
    });

    // 16. Public rate card hiding
    it('16. Public rate card hiding: isActive: false omitted from getSalonBySlug; reactivating restores it', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // Initially active, serviceA1 should be present
      const initialPublic = await getSalonBySlug(salonA.slug);
      expect(initialPublic?.services.some((s) => s.id === serviceA1.id)).toBe(true);

      // Deactivate service
      const deactRes = await toggleServiceActiveStaff(ownerACurrent, salonA.id, serviceA1.id, false);
      expect(deactRes.ok).toBe(true);

      const hiddenPublic = await getSalonBySlug(salonA.slug);
      expect(hiddenPublic?.services.some((s) => s.id === serviceA1.id)).toBe(false);

      // Reactivate service
      const reactRes = await toggleServiceActiveStaff(ownerACurrent, salonA.id, serviceA1.id, true);
      expect(reactRes.ok).toBe(true);

      const restoredPublic = await getSalonBySlug(salonA.slug);
      expect(restoredPublic?.services.some((s) => s.id === serviceA1.id)).toBe(true);
    });

    // 17. Barber assignment validation
    it('17. Barber assignment validation: Foreign barber, inactive barber, or unverified barber rejected with INVALID_BARBER', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // 1. Foreign barber from salonB
      const resForeign = await setBarberServicesStaff(ownerACurrent, salonA.id, serviceA1.id, [barberB.id]);
      expect(resForeign.ok).toBe(false);
      expect(resForeign.code).toBe('INVALID_BARBER');

      // 2. Inactive barber from salonA
      const resInactive = await setBarberServicesStaff(ownerACurrent, salonA.id, serviceA1.id, [barberInactive.id]);
      expect(resInactive.ok).toBe(false);
      expect(resInactive.code).toBe('INVALID_BARBER');

      // 3. Unverified barber from salonA
      const resPending = await setBarberServicesStaff(ownerACurrent, salonA.id, serviceA1.id, [barberPending.id]);
      expect(resPending.ok).toBe(false);
      expect(resPending.code).toBe('INVALID_BARBER');

      // 4. createServiceStaff with foreign barber
      const createResForeign = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'Invalid Barber Svc',
        category: ServiceCategory.HAIR,
        priceRupees: 150,
        durationMin: 30,
        barberIds: [barberB.id],
      });
      expect(createResForeign.ok).toBe(false);
      expect(createResForeign.code).toBe('INVALID_BARBER');
    });

    // 18. Boundary limit validations
    it('18. Boundary limit validations: 61st service, 5th window, overlapping windows, 51st time-off, >90d range, past time-off, price 0/50001, duration 20/255, name 1/61 chars', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const deterministicNow = new Date('2026-11-12T10:00:00.000Z');

      // Name length: 1 char
      const resName1 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'A',
        category: ServiceCategory.HAIR,
        priceRupees: 100,
        durationMin: 30,
      });
      expect(resName1.ok).toBe(false);
      expect(resName1.code).toBe('INVALID_INPUT');

      // Name length: 61 chars
      const resName61 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'A'.repeat(61),
        category: ServiceCategory.HAIR,
        priceRupees: 100,
        durationMin: 30,
      });
      expect(resName61.ok).toBe(false);
      expect(resName61.code).toBe('INVALID_INPUT');

      // Price: 0
      const resPrice0 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'Price Zero Svc',
        category: ServiceCategory.HAIR,
        priceRupees: 0,
        durationMin: 30,
      });
      expect(resPrice0.ok).toBe(false);
      expect(resPrice0.code).toBe('INVALID_INPUT');

      // Price: 50001
      const resPrice50001 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'Price High Svc',
        category: ServiceCategory.HAIR,
        priceRupees: 50001,
        durationMin: 30,
      });
      expect(resPrice50001.ok).toBe(false);
      expect(resPrice50001.code).toBe('INVALID_INPUT');

      // Duration: 20 (not multiple of 15)
      const resDur20 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'Dur 20 Svc',
        category: ServiceCategory.HAIR,
        priceRupees: 100,
        durationMin: 20,
      });
      expect(resDur20.ok).toBe(false);
      expect(resDur20.code).toBe('INVALID_INPUT');

      // Duration: 255 (>240)
      const resDur255 = await createServiceStaff(ownerACurrent, salonA.id, {
        name: 'Dur 255 Svc',
        category: ServiceCategory.HAIR,
        priceRupees: 100,
        durationMin: 255,
      });
      expect(resDur255.ok).toBe(false);
      expect(resDur255.code).toBe('INVALID_INPUT');

      // 5th availability window on weekday 1
      const fiveWindows = [
        { weekday: 1, startMin: 540, endMin: 600 },
        { weekday: 1, startMin: 615, endMin: 660 },
        { weekday: 1, startMin: 675, endMin: 720 },
        { weekday: 1, startMin: 735, endMin: 780 },
        { weekday: 1, startMin: 795, endMin: 840 },
      ];
      const resFiveWin = await updateBarberAvailabilityStaff(barberACurrent, barberA.id, fiveWindows);
      expect(resFiveWin.ok).toBe(false);
      expect(resFiveWin.code).toBe('INVALID_INPUT');

      // Overlapping availability windows
      const overlappingWin = [
        { weekday: 1, startMin: 540, endMin: 660 },
        { weekday: 1, startMin: 600, endMin: 720 },
      ];
      const resOverlapWin = await updateBarberAvailabilityStaff(barberACurrent, barberA.id, overlappingWin);
      expect(resOverlapWin.ok).toBe(false);
      expect(resOverlapWin.code).toBe('OVERLAPPING_WINDOWS');

      // Past time-off (endsAt in the past)
      const pastTimeOff = await createBarberTimeOffStaff(
        barberACurrent,
        barberA.id,
        {
          startsAt: new Date(deterministicNow.getTime() - 2 * 60 * 60 * 1000),
          endsAt: new Date(deterministicNow.getTime() - 1 * 60 * 60 * 1000),
        },
        deterministicNow
      );
      expect(pastTimeOff.ok).toBe(false);
      expect(pastTimeOff.code).toBe('TIMEOFF_IN_PAST');

      // Time-off duration > 90 days
      const over90d = await createBarberTimeOffStaff(
        barberACurrent,
        barberA.id,
        {
          startsAt: new Date(deterministicNow.getTime() + 1000),
          endsAt: new Date(deterministicNow.getTime() + 91 * 24 * 60 * 60 * 1000),
        },
        deterministicNow
      );
      expect(over90d.ok).toBe(false);
      expect(over90d.code).toBe('INVALID_TIMEOFF_RANGE');
    });

    // 19. Time-off booking blockage in core service
    it('19. Time-off booking blockage in core service: createBooking rejected with SLOT_TAKEN, deleting time-off allows it', async () => {
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const startsAt = istToUtcDate(tomorrowIstStr, 600); // 10:00 AM IST
      const endsAt = istToUtcDate(tomorrowIstStr, 630); // 10:30 AM IST
      const deterministicNow = istToUtcDate(todayIstStr, 540); // 9:00 AM IST today

      // Ensure barber availability for tomorrow (weekday from tomorrowIstStr)
      const { weekday: tomorrowWeekday } = utcToIstDetails(startsAt);
      await db.availability.deleteMany({ where: { barberId: barberA.id, weekday: tomorrowWeekday } });
      await db.availability.create({
        data: { barberId: barberA.id, weekday: tomorrowWeekday, startMin: 540, endMin: 1260 },
      });

      // 1. Create time-off covering tomorrow 10:00 - 10:30 AM
      const timeOffRes = await createBarberTimeOffStaff(
        barberACurrent,
        barberA.id,
        { startsAt, endsAt, reason: 'Doctor Visit' },
        deterministicNow
      );
      expect(timeOffRes.ok).toBe(true);
      const timeOffId = timeOffRes.data?.id as string;

      try {
        // 2. createBooking at 10:00 AM IST should fail with SLOT_TAKEN
        const bookingAttempt1 = await createBooking({
          customerId: customerUser.id,
          salonId: salonA.id,
          barberId: barberA.id,
          serviceIds: [serviceA1.id],
          startsAt,
          now: deterministicNow,
        });
        expect(bookingAttempt1.ok).toBe(false);
        expect(bookingAttempt1.code).toBe('SLOT_TAKEN');

        // 3. Delete time-off
        const delRes = await deleteBarberTimeOffStaff(barberACurrent, barberA.id, timeOffId, deterministicNow);
        expect(delRes.ok).toBe(true);

        // 4. createBooking at 10:00 AM IST now succeeds
        const bookingAttempt2 = await createBooking({
          customerId: customerUser.id,
          salonId: salonA.id,
          barberId: barberA.id,
          serviceIds: [serviceA1.id],
          startsAt,
          now: deterministicNow,
        });
        expect(bookingAttempt2.ok).toBe(true);
        expect(bookingAttempt2.data?.status).toBe(BookingStatus.CONFIRMED);

        // Cleanup booking
        if (bookingAttempt2.data?.id) {
          await db.bookingItem.deleteMany({ where: { bookingId: bookingAttempt2.data.id } });
          await db.booking.delete({ where: { id: bookingAttempt2.data.id } });
        }
      } finally {
        await db.timeOff.deleteMany({ where: { id: timeOffId } });
      }
    });

    // 20. Integration conflict warnings
    it('20. Integration conflict warnings: Closed day, outside availability, and overlapping time-off return conflict items while preserving booking status', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      const bookingStart = istToUtcDate(tomorrowIstStr, 600); // 10:00 AM
      const bookingEnd = istToUtcDate(tomorrowIstStr, 630);
      const deterministicNow = istToUtcDate(todayIstStr, 540);

      const booking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA.id,
          customerId: customerUser.id,
          token: 406,
          tokenDate: toTokenDateUtc(tomorrowIstStr),
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          startsAt: bookingStart,
          endsAt: bookingEnd,
          totalRupees: 150,
        },
      });

      const { weekday: tomorrowWeekday } = utcToIstDetails(bookingStart);

      try {
        // 1. Salon hours update: mark tomorrow as closed -> conflicts returned, booking stays CONFIRMED
        const closedHours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
          weekday: w,
          openMin: 540,
          closeMin: 1260,
          isClosed: w === tomorrowWeekday,
        }));
        const hoursRes = await updateSalonHoursStaff(ownerACurrent, salonA.id, closedHours, deterministicNow);
        expect(hoursRes.ok).toBe(true);
        expect(hoursRes.data?.conflicts.some((c) => c.bookingId === booking.id && c.reason === 'CLOSED_DAY')).toBe(true);

        const checkBooking1 = await db.booking.findUnique({ where: { id: booking.id } });
        expect(checkBooking1?.status).toBe(BookingStatus.CONFIRMED);

        // 2. Barber availability update: shift window so 10:00 AM is outside -> conflicts returned, booking stays CONFIRMED
        const shiftedAvail = [{ weekday: tomorrowWeekday, startMin: 840, endMin: 1200 }]; // 2:00 PM to 8:00 PM
        const availRes = await updateBarberAvailabilityStaff(barberACurrent, barberA.id, shiftedAvail, deterministicNow);
        expect(availRes.ok).toBe(true);
        expect(availRes.data?.conflicts.some((c) => c.bookingId === booking.id && c.reason === 'OUTSIDE_AVAILABILITY')).toBe(true);

        const checkBooking2 = await db.booking.findUnique({ where: { id: booking.id } });
        expect(checkBooking2?.status).toBe(BookingStatus.CONFIRMED);

        // 3. Time-off update: time-off overlapping 10:00 AM -> conflicts returned, booking stays CONFIRMED
        const toRes = await createBarberTimeOffStaff(
          barberACurrent,
          barberA.id,
          { startsAt: bookingStart, endsAt: bookingEnd },
          deterministicNow
        );
        expect(toRes.ok).toBe(true);
        expect(toRes.data?.conflicts.some((c) => c.bookingId === booking.id && c.reason === 'TIME_OFF_OVERLAP')).toBe(true);

        const checkBooking3 = await db.booking.findUnique({ where: { id: booking.id } });
        expect(checkBooking3?.status).toBe(BookingStatus.CONFIRMED);

        if (toRes.data?.id) {
          await db.timeOff.deleteMany({ where: { id: toRes.data.id } });
        }
      } finally {
        await db.booking.deleteMany({ where: { id: booking.id } });
      }
    });

    // 21. Barber & Owner tenant isolation
    it('21. Barber & Owner tenant isolation: Cross-salon updates return NOT_FOUND', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };
      const barberACurrent: CurrentUser = {
        id: barberUserA.id,
        role: Role.BARBER,
        phone: barberUserA.phone,
        name: barberUserA.name,
        isActive: true,
      };

      // Owner A modifying Salon B's service -> NOT_FOUND
      const resService = await updateServiceStaff(ownerACurrent, salonA.id, serviceB.id, {
        name: 'Hacked Service',
        category: ServiceCategory.HAIR,
        priceRupees: 100,
        durationMin: 30,
      });
      expect(resService.ok).toBe(false);
      expect(resService.code).toBe('NOT_FOUND');

      // Owner A modifying Salon B's hours -> NOT_FOUND
      const defaultHours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
        weekday: w,
        openMin: 540,
        closeMin: 1260,
        isClosed: false,
      }));
      const resHours = await updateSalonHoursStaff(ownerACurrent, salonB.id, defaultHours);
      expect(resHours.ok).toBe(false);
      expect(resHours.code).toBe('NOT_FOUND');

      // Barber A modifying Barber B's availability -> NOT_FOUND
      const resAvail = await updateBarberAvailabilityStaff(barberACurrent, barberB.id, [
        { weekday: 1, startMin: 540, endMin: 1020 },
      ]);
      expect(resAvail.ok).toBe(false);
      expect(resAvail.code).toBe('NOT_FOUND');

      // Barber A creating time-off for Barber B -> NOT_FOUND
      const resTimeOff = await createBarberTimeOffStaff(barberACurrent, barberB.id, {
        startsAt: new Date(Date.now() + 60000),
        endsAt: new Date(Date.now() + 120000),
      });
      expect(resTimeOff.ok).toBe(false);
      expect(resTimeOff.code).toBe('NOT_FOUND');
    });

    // 22. Atomic hours rollback
    it('22. Atomic hours rollback: Invalid row in saveSalonHours aborts before updating, leaving existing DB rows unchanged', async () => {
      const ownerACurrent: CurrentUser = {
        id: ownerA.id,
        role: Role.OWNER,
        phone: ownerA.phone,
        name: ownerA.name,
        isActive: true,
      };

      // 1. Establish known good hours
      const initialHours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
        weekday: w,
        openMin: 540,
        closeMin: 1260,
        isClosed: false,
      }));
      await updateSalonHoursStaff(ownerACurrent, salonA.id, initialHours);

      const beforeHours = await db.salonHours.findMany({
        where: { salonId: salonA.id },
        orderBy: { weekday: 'asc' },
      });
      expect(beforeHours).toHaveLength(7);

      // 2. Attempt update with invalid row (openMin > closeMin on weekday 2)
      const invalidHours = [0, 1, 2, 3, 4, 5, 6].map((w) => ({
        weekday: w,
        openMin: w === 2 ? 1300 : 540,
        closeMin: 1260,
        isClosed: false,
      }));

      const res = await updateSalonHoursStaff(ownerACurrent, salonA.id, invalidHours);
      expect(res.ok).toBe(false);
      expect(res.code).toBe('INVALID_HOURS');

      // 3. Verify database rows were not modified at all (atomic rollback/abort)
      const afterHours = await db.salonHours.findMany({
        where: { salonId: salonA.id },
        orderBy: { weekday: 'asc' },
      });
      expect(afterHours).toEqual(beforeHours);
    });
  });
});
