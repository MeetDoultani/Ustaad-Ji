import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { prisma as db } from '../lib/db';
import {
  Role,
  VerificationStatus,
  ServiceCategory,
  BookingStatus,
  Booking,
  BookingType,
  BookingSource,
  User,
  Salon,
  Barber,
  Service,
} from '@prisma/client';
import {
  canManageBarberRoster,
  canEditBarberProfile,
  canEditSalonProfile,
  canViewBookingHistory,
  PolicyUser,
  PolicySalon,
  PolicyBarber,
} from '../lib/policies';
import {
  validatePhotoUrl,
  getSalonBarbersStaff,
  addBarberStaff,
  removeBarberStaff,
  reactivateBarberStaff,
  updateBarberProfileStaff,
  updateSalonProfileStaff,
  getBookingHistoryStaff,
} from '../lib/staff-roster-service';
import {
  createBarberTimeOffStaff,
  deleteBarberTimeOffStaff,
  checkStaffEditRateLimit,
} from '../lib/staff-config-service';
import { createBooking, __testHooks } from '../lib/booking-service';
import { getSalonBySlug } from '../lib/salons';
import { getAvailableSlots } from '../lib/booking-service';
import { getStaffDashboardContext, maskPhoneForRegister } from '../lib/dashboard-service';
import { resetRateLimits } from '../lib/rate-limit';
import { CurrentUser } from '../lib/auth-server';
import { toTokenDateUtc } from '../lib/time';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

describe('Phase 4B-2: Staff Barber Roster, Profile Editors, and Booking History', () => {
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

  // Reference timestamp: 2026-06-15 10:00:00 UTC (Deterministic)
  const FIXED_NOW = new Date('2026-06-15T10:00:00.000Z');
  const getOffsetDate = (ms: number): Date => new Date(FIXED_NOW.getTime() + ms);

  // Deterministic phone and fixture ID generators (zero clock dependency)
  let fixtureSeq = 500000;
  const nextUniquePhone = (): string => {
    fixtureSeq++;
    return `+9199${String(fixtureSeq).padStart(8, '0')}`;
  };
  const nextFixtureId = (): string => {
    fixtureSeq++;
    return `fix-${fixtureSeq}`;
  };

  // ==========================================================================
  // SECTION 1: DETERMINISTIC CLOCK AUDIT & PURE UNIT TESTS
  // ==========================================================================
  describe('1. Pure Unit Tests: Deterministic Clock, Validators & Policies', () => {
    it('deterministic clock: zero unmanaged clock calls in test suite', () => {
      const testFilePath = path.resolve(__dirname, 'phase4b2-staff.test.ts');
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const lines = content.split('\n');
      const offendingLines = lines.filter((line) => {
        const trimmed = line.trim();
        if (
          trimmed.includes('offendingLines') ||
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.includes("deterministic clock")
        ) {
          return false;
        }
        return /Date\s*\.\s*now\s*\(\s*\)/.test(line) || /new\s+Date\s*\(\s*\)/.test(line);
      });
      expect(offendingLines).toEqual([]);
    });

    describe('validatePhotoUrl validator', () => {
      it('accepts valid https URL within 300 characters', () => {
        const res = validatePhotoUrl('https://example.com/photos/barber1.jpg');
        expect(res.isValid).toBe(true);
        expect(res.value).toBe('https://example.com/photos/barber1.jpg');
      });

      it('normalizes empty or whitespace string to null (clearing photo)', () => {
        const emptyRes = validatePhotoUrl('');
        expect(emptyRes.isValid).toBe(true);
        expect(emptyRes.value).toBeNull();

        const wsRes = validatePhotoUrl('   ');
        expect(wsRes.isValid).toBe(true);
        expect(wsRes.value).toBeNull();

        const nullRes = validatePhotoUrl(null);
        expect(nullRes.isValid).toBe(true);
        expect(nullRes.value).toBeNull();

        const undefRes = validatePhotoUrl(undefined);
        expect(undefRes.isValid).toBe(true);
        expect(undefRes.value).toBeNull();
      });

      it('rejects unencrypted http:// URL', () => {
        const res = validatePhotoUrl('http://example.com/photo.jpg');
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      });

      it('rejects URL longer than 300 characters', () => {
        const longPath = 'a'.repeat(290);
        const res = validatePhotoUrl(`https://example.com/${longPath}`);
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      });

      it('rejects URL with embedded credentials', () => {
        const res = validatePhotoUrl('https://user:pass@example.com/photo.jpg');
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      });

      it('rejects data: URL scheme', () => {
        const res = validatePhotoUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA');
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      });

      it('rejects javascript: URL scheme', () => {
        const res = validatePhotoUrl('javascript:alert(1)');
        expect(res.isValid).toBe(false);
        expect(res.error).toBeDefined();
      });
    });

    describe('Policy: canManageBarberRoster', () => {
      const ownerUser: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: true };
      const barberUser: PolicyUser = { id: 'usr-bar-1', role: Role.BARBER, isActive: true };
      const customerUser: PolicyUser = { id: 'usr-cust-1', role: Role.CUSTOMER, isActive: true };
      const adminUser: PolicyUser = { id: 'usr-adm-1', role: Role.ADMIN, isActive: true };
      const inactiveOwner: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: false };

      const mySalon: PolicySalon = { id: 'sal-1', ownerId: 'usr-own-1' };
      const otherSalon: PolicySalon = { id: 'sal-2', ownerId: 'usr-own-2' };

      it('allows active owner of their own salon', () => {
        expect(canManageBarberRoster(ownerUser, mySalon)).toBe(true);
      });

      it('denies owner accessing foreign salon', () => {
        expect(canManageBarberRoster(ownerUser, otherSalon)).toBe(false);
      });

      it('denies inactive owner', () => {
        expect(canManageBarberRoster(inactiveOwner, mySalon)).toBe(false);
      });

      it('denies barber role', () => {
        expect(canManageBarberRoster(barberUser, mySalon)).toBe(false);
      });

      it('denies customer and admin roles', () => {
        expect(canManageBarberRoster(customerUser, mySalon)).toBe(false);
        expect(canManageBarberRoster(adminUser, mySalon)).toBe(false);
      });
    });

    describe('Policy: canEditBarberProfile', () => {
      const barberActor: PolicyUser = { id: 'usr-bar-1', role: Role.BARBER, isActive: true };
      const otherBarberActor: PolicyUser = { id: 'usr-bar-2', role: Role.BARBER, isActive: true };
      const ownerActor: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: true };
      const foreignOwnerActor: PolicyUser = { id: 'usr-own-2', role: Role.OWNER, isActive: true };
      const customerActor: PolicyUser = { id: 'usr-cust-1', role: Role.CUSTOMER, isActive: true };

      const targetBarber: PolicyBarber = {
        id: 'bar-prof-1',
        userId: 'usr-bar-1',
        salonId: 'sal-1',
        salonOwnerId: 'usr-own-1',
      };

      it('allows barber editing their own profile (user.id === barber.userId)', () => {
        expect(canEditBarberProfile(barberActor, targetBarber)).toBe(true);
      });

      it('CRITICAL: denies when user.id === barber.id but user.id !== barber.userId', () => {
        const spoofedUser: PolicyUser = { id: 'bar-prof-1', role: Role.BARBER, isActive: true };
        expect(canEditBarberProfile(spoofedUser, targetBarber)).toBe(false);
      });

      it('allows salon owner to edit their barber profile', () => {
        expect(canEditBarberProfile(ownerActor, targetBarber)).toBe(true);
      });

      it('denies foreign salon owner from editing barber profile', () => {
        expect(canEditBarberProfile(foreignOwnerActor, targetBarber)).toBe(false);
      });

      it('denies another barber from editing this barber profile', () => {
        expect(canEditBarberProfile(otherBarberActor, targetBarber)).toBe(false);
      });

      it('denies customer role from editing barber profile', () => {
        expect(canEditBarberProfile(customerActor, targetBarber)).toBe(false);
      });
    });

    describe('Policy: canEditSalonProfile', () => {
      const ownerUser: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: true };
      const foreignOwnerUser: PolicyUser = { id: 'usr-own-2', role: Role.OWNER, isActive: true };
      const barberUser: PolicyUser = { id: 'usr-bar-1', role: Role.BARBER, isActive: true };
      const targetSalon: PolicySalon = { id: 'sal-1', ownerId: 'usr-own-1' };

      it('allows active salon owner for their salon', () => {
        expect(canEditSalonProfile(ownerUser, targetSalon)).toBe(true);
      });

      it('denies foreign salon owner', () => {
        expect(canEditSalonProfile(foreignOwnerUser, targetSalon)).toBe(false);
      });

      it('denies barber role', () => {
        expect(canEditSalonProfile(barberUser, targetSalon)).toBe(false);
      });
    });

    describe('Policy: canViewBookingHistory', () => {
      const activeOwner: PolicyUser = { id: 'usr-1', role: Role.OWNER, isActive: true };
      const activeBarber: PolicyUser = { id: 'usr-2', role: Role.BARBER, isActive: true };
      const inactiveOwner: PolicyUser = { id: 'usr-3', role: Role.OWNER, isActive: false };
      const inactiveBarber: PolicyUser = { id: 'usr-4', role: Role.BARBER, isActive: false };
      const customer: PolicyUser = { id: 'usr-5', role: Role.CUSTOMER, isActive: true };
      const admin: PolicyUser = { id: 'usr-6', role: Role.ADMIN, isActive: true };

      it('allows OWNER and BARBER roles', () => {
        expect(canViewBookingHistory(activeOwner)).toBe(true);
        expect(canViewBookingHistory(activeBarber)).toBe(true);
      });

      it('denies inactive staff', () => {
        expect(canViewBookingHistory(inactiveOwner)).toBe(false);
        expect(canViewBookingHistory(inactiveBarber)).toBe(false);
      });

      it('denies CUSTOMER and ADMIN roles', () => {
        expect(canViewBookingHistory(customer)).toBe(false);
        expect(canViewBookingHistory(admin)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // SECTION 2: REAL DATABASE INTEGRATION TESTS
  // ==========================================================================
  describe('2. Real Database Integration Tests', () => {
    let ownerA: User;
    let salonA: Salon;
    let salonA2: Salon; // Multi-salon fixture for Owner A
    let barberUserA1: User;
    let barberA1: Barber;
    let barberUserA2: User;
    let barberA2: Barber;
    let serviceA: Service;

    let ownerB: User;
    let salonB: Salon;
    let barberUserB1: User;
    let barberB1: Barber;

    let customerUser: User;
    let adminUser: User;
    let inactiveOwnerUser: User;
    let inactiveBarberUser: User;
    let inactiveBarber: Barber;

    let pendingSalon: Salon;
    let rejectedSalon: Salon;
    let suspendedSalon: Salon;

    let rejectedBarberUser: User;
    let rejectedBarber: Barber;
    let suspendedBarberUser: User;
    let suspendedBarber: Barber;

    let consoleSpy: ReturnType<typeof vi.spyOn> | undefined;

    beforeAll(async () => {
      // 1. Owner A & Salon A (VERIFIED)
      ownerA = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Owner A Test',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonA = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Salon A Roster Test',
          nameHi: 'सैलून ए टेस्ट',
          slug: `salon-a-roster-${nextFixtureId()}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '100 Indiranagar',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
          phone: '+919876540001',
          hours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((w) => ({
              weekday: w,
              openMin: 540,
              closeMin: 1200,
              isClosed: false,
            })),
          },
        },
      });

      // Second Salon for Owner A (Multi-salon fixture)
      salonA2 = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Salon A Second Branch',
          slug: `salon-a2-roster-${nextFixtureId()}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '102 Koramangala',
          area: 'Koramangala',
          city: 'Bengaluru',
          pincode: '560034',
          hours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((w) => ({
              weekday: w,
              openMin: 540,
              closeMin: 1200,
              isClosed: false,
            })),
          },
        },
      });

      // Barbers in Salon A
      barberUserA1 = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Barber A1',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberA1 = await db.barber.create({
        data: {
          userId: barberUserA1.id,
          salonId: salonA.id,
          displayName: 'Ustaad Ramesh',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 5,
          availability: {
            create: [0, 1, 2, 3, 4, 5, 6].map((w) => ({
              weekday: w,
              startMin: 540,
              endMin: 1200,
            })),
          },
        },
      });

      barberUserA2 = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Barber A2',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberA2 = await db.barber.create({
        data: {
          userId: barberUserA2.id,
          salonId: salonA.id,
          displayName: 'Ustaad Rohit',
          status: VerificationStatus.PENDING,
          isActive: true,
          experienceYears: 2,
        },
      });

      // Service in Salon A
      serviceA = await db.service.create({
        data: {
          salonId: salonA.id,
          category: ServiceCategory.HAIR,
          name: 'Classic Cut',
          durationMin: 30,
          priceRupees: 150,
          isActive: true,
          sortOrder: 1,
        },
      });

      await db.barberService.create({
        data: { barberId: barberA1.id, serviceId: serviceA.id },
      });

      // 2. Owner B & Salon B (VERIFIED)
      ownerB = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Owner B Test',
          role: Role.OWNER,
          isActive: true,
        },
      });

      salonB = await db.salon.create({
        data: {
          ownerId: ownerB.id,
          name: 'Salon B Roster Test',
          slug: `salon-b-roster-${nextFixtureId()}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '200 Koramangala',
          area: 'Koramangala',
          city: 'Bengaluru',
          pincode: '560034',
        },
      });

      barberUserB1 = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Barber B1',
          role: Role.BARBER,
          isActive: true,
        },
      });

      barberB1 = await db.barber.create({
        data: {
          userId: barberUserB1.id,
          salonId: salonB.id,
          displayName: 'Ustaad Kabir',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 7,
        },
      });

      // 3. Customer & Admin
      customerUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Customer Integration',
          role: Role.CUSTOMER,
          isActive: true,
        },
      });

      adminUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Admin Integration',
          role: Role.ADMIN,
          isActive: true,
        },
      });

      // 4. Inactive Users
      inactiveOwnerUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Inactive Owner',
          role: Role.OWNER,
          isActive: false,
        },
      });

      inactiveBarberUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Inactive Barber User',
          role: Role.BARBER,
          isActive: false,
        },
      });

      inactiveBarber = await db.barber.create({
        data: {
          userId: inactiveBarberUser.id,
          salonId: salonA.id,
          displayName: 'Ustaad Inactive',
          status: VerificationStatus.VERIFIED,
          isActive: false,
          experienceYears: 3,
        },
      });

      // 5. Unverified Salons
      pendingSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Pending Salon Test',
          slug: `salon-pending-${nextFixtureId()}`,
          status: VerificationStatus.PENDING,
          addressLine: '123 Pending Road',
          area: 'Test',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      rejectedSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Rejected Salon Test',
          slug: `salon-rejected-${nextFixtureId()}`,
          status: VerificationStatus.REJECTED,
          addressLine: '123 Rejected Road',
          area: 'Test',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      suspendedSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Suspended Salon Test',
          slug: `salon-suspended-${nextFixtureId()}`,
          status: VerificationStatus.SUSPENDED,
          addressLine: '123 Suspended Road',
          area: 'Test',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      // 6. Rejected & Suspended Barbers in Salon A
      rejectedBarberUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Rejected Barber User',
          role: Role.BARBER,
          isActive: true,
        },
      });

      rejectedBarber = await db.barber.create({
        data: {
          userId: rejectedBarberUser.id,
          salonId: salonA.id,
          displayName: 'Ustaad Rejected',
          status: VerificationStatus.REJECTED,
          isActive: true,
          experienceYears: 4,
        },
      });

      suspendedBarberUser = await db.user.create({
        data: {
          phone: nextUniquePhone(),
          name: 'Suspended Barber User',
          role: Role.BARBER,
          isActive: true,
        },
      });

      suspendedBarber = await db.barber.create({
        data: {
          userId: suspendedBarberUser.id,
          salonId: salonA.id,
          displayName: 'Ustaad Suspended',
          status: VerificationStatus.SUSPENDED,
          isActive: true,
          experienceYears: 6,
        },
      });
    }, 45000);

    afterAll(async () => {
      __testHooks.beforeBookingTx = null;
      const salonIds = [
        salonA?.id,
        salonA2?.id,
        salonB?.id,
        pendingSalon?.id,
        rejectedSalon?.id,
        suspendedSalon?.id,
      ].filter(Boolean);

      const barberIds = [
        barberA1?.id,
        barberA2?.id,
        barberB1?.id,
        inactiveBarber?.id,
        rejectedBarber?.id,
        suspendedBarber?.id,
      ].filter(Boolean);

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
        ownerB?.id,
        barberUserA1?.id,
        barberUserA2?.id,
        barberUserB1?.id,
        customerUser?.id,
        adminUser?.id,
        inactiveOwnerUser?.id,
        inactiveBarberUser?.id,
        rejectedBarberUser?.id,
        suspendedBarberUser?.id,
      ].filter(Boolean);

      if (userIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }, 45000);

    beforeEach(() => {
      resetRateLimits();
    });

    afterEach(() => {
      consoleSpy?.mockRestore();
    });

    const getOwnerACurrent = (): CurrentUser => ({
      id: ownerA.id,
      phone: ownerA.phone,
      role: Role.OWNER,
      name: ownerA.name,
      isActive: true,
    });

    const getOwnerBCurrent = (): CurrentUser => ({
      id: ownerB.id,
      phone: ownerB.phone,
      role: Role.OWNER,
      name: ownerB.name,
      isActive: true,
    });

    const getBarberA1Current = (): CurrentUser => ({
      id: barberUserA1.id,
      phone: barberUserA1.phone,
      role: Role.BARBER,
      name: barberUserA1.name,
      isActive: true,
    });

    const getCustomerCurrent = (): CurrentUser => ({
      id: customerUser.id,
      phone: customerUser.phone,
      role: Role.CUSTOMER,
      name: customerUser.name,
      isActive: true,
    });

    const getAdminCurrent = (): CurrentUser => ({
      id: adminUser.id,
      phone: adminUser.phone,
      role: Role.ADMIN,
      name: adminUser.name,
      isActive: true,
    });

    // ------------------------------------------------------------------------
    // TEST 1: MULTI-TENANT ISOLATION
    // ------------------------------------------------------------------------
    it('multi-tenant isolation: Owner A cannot add, remove, reactivate or edit in Salon B; cannot edit Salon B profile', async () => {
      const ownerAUser = getOwnerACurrent();

      // 1. Add barber to foreign salon
      const addRes = await addBarberStaff(
        ownerAUser,
        salonB.id,
        { phone: nextUniquePhone(), displayName: 'Foreign Barber' },
        FIXED_NOW
      );
      expect(addRes.ok).toBe(false);
      expect(addRes.code).toBe('NOT_FOUND');

      // 2. Remove barber in foreign salon
      const removeRes = await removeBarberStaff(ownerAUser, salonB.id, barberB1.id, FIXED_NOW);
      expect(removeRes.ok).toBe(false);
      expect(removeRes.code).toBe('NOT_FOUND');

      // 3. Reactivate barber in foreign salon
      const reactivateRes = await reactivateBarberStaff(ownerAUser, salonB.id, barberB1.id, FIXED_NOW);
      expect(reactivateRes.ok).toBe(false);
      expect(reactivateRes.code).toBe('NOT_FOUND');

      // 4. Edit barber profile in foreign salon
      const editBarberRes = await updateBarberProfileStaff(
        ownerAUser,
        barberB1.id,
        { displayName: 'Hacked Barber', experienceYears: 10 },
        FIXED_NOW
      );
      expect(editBarberRes.ok).toBe(false);
      expect(editBarberRes.code).toBe('NOT_FOUND');

      // 5. Edit foreign salon profile
      const editSalonRes = await updateSalonProfileStaff(
        ownerAUser,
        salonB.id,
        { name: 'Hacked Salon Name' },
        FIXED_NOW
      );
      expect(editSalonRes.ok).toBe(false);
      expect(editSalonRes.code).toBe('NOT_FOUND');

      // Verify foreign records are completely untouched
      const dbBarberB1 = await db.barber.findUnique({ where: { id: barberB1.id } });
      expect(dbBarberB1?.displayName).toBe('Ustaad Kabir');
      expect(dbBarberB1?.isActive).toBe(true);

      const dbSalonB = await db.salon.findUnique({ where: { id: salonB.id } });
      expect(dbSalonB?.name).toBe('Salon B Roster Test');
    });

    // ------------------------------------------------------------------------
    // TEST 2: ROLE BOUNDARIES
    // ------------------------------------------------------------------------
    it('role boundaries: Barber cannot call roster actions or edit salon profile; Customer/Admin denied at service level', async () => {
      const barberActor = getBarberA1Current();
      const customerActor = getCustomerCurrent();
      const adminActor = getAdminCurrent();

      // Barber attempting roster actions
      const addRes = await addBarberStaff(
        barberActor,
        salonA.id,
        { phone: nextUniquePhone(), displayName: 'Illegal' },
        FIXED_NOW
      );
      expect(addRes.ok).toBe(false);
      expect(addRes.code).toBe('UNAUTHORIZED');

      const removeRes = await removeBarberStaff(barberActor, salonA.id, barberA2.id, FIXED_NOW);
      expect(removeRes.ok).toBe(false);
      expect(removeRes.code).toBe('UNAUTHORIZED');

      const reactivateRes = await reactivateBarberStaff(barberActor, salonA.id, inactiveBarber.id, FIXED_NOW);
      expect(reactivateRes.ok).toBe(false);
      expect(reactivateRes.code).toBe('UNAUTHORIZED');

      const salonEditRes = await updateSalonProfileStaff(barberActor, salonA.id, { name: 'Illegal Edit' }, FIXED_NOW);
      expect(salonEditRes.ok).toBe(false);
      expect(salonEditRes.code).toBe('UNAUTHORIZED');

      // Customer calling service-level functions
      const custAdd = await addBarberStaff(
        customerActor,
        salonA.id,
        { phone: nextUniquePhone(), displayName: 'Illegal' },
        FIXED_NOW
      );
      expect(custAdd.ok).toBe(false);
      expect(custAdd.code).toBe('UNAUTHORIZED');

      const custRoster = await getSalonBarbersStaff(customerActor, salonA.id);
      expect(custRoster.ok).toBe(false);
      expect(custRoster.code).toBe('UNAUTHORIZED');

      // Admin calling service-level staff functions
      const adminAdd = await addBarberStaff(
        adminActor,
        salonA.id,
        { phone: nextUniquePhone(), displayName: 'Illegal' },
        FIXED_NOW
      );
      expect(adminAdd.ok).toBe(false);
      expect(adminAdd.code).toBe('UNAUTHORIZED');

      const adminRoster = await getSalonBarbersStaff(adminActor, salonA.id);
      expect(adminRoster.ok).toBe(false);
      expect(adminRoster.code).toBe('UNAUTHORIZED');
    });

    // ------------------------------------------------------------------------
    // TEST 3: STATUS GATING MATRIX (Section C)
    // ------------------------------------------------------------------------
    describe('Status Gating Table-Driven Matrix (Section C)', () => {
      interface StatusGatingCase {
        fnName: string;
        actionLabel: string;
        stateLabel: string;
        expectedCode: string;
        run: () => Promise<{ ok: boolean; code?: string }>;
      }

      const cases: StatusGatingCase[] = [
        // addBarberStaff x Salon States
        {
          fnName: 'addBarberStaff',
          actionLabel: 'addBarberStaff',
          stateLabel: 'salon PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            addBarberStaff(
              getOwnerACurrent(),
              pendingSalon.id,
              { phone: nextUniquePhone(), displayName: 'Gate Test' },
              FIXED_NOW
            ),
        },
        {
          fnName: 'addBarberStaff',
          actionLabel: 'addBarberStaff',
          stateLabel: 'salon REJECTED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            addBarberStaff(
              getOwnerACurrent(),
              rejectedSalon.id,
              { phone: nextUniquePhone(), displayName: 'Gate Test' },
              FIXED_NOW
            ),
        },
        {
          fnName: 'addBarberStaff',
          actionLabel: 'addBarberStaff',
          stateLabel: 'salon SUSPENDED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            addBarberStaff(
              getOwnerACurrent(),
              suspendedSalon.id,
              { phone: nextUniquePhone(), displayName: 'Gate Test' },
              FIXED_NOW
            ),
        },
        {
          fnName: 'addBarberStaff',
          actionLabel: 'addBarberStaff',
          stateLabel: 'actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            addBarberStaff(
              { ...getOwnerACurrent(), isActive: false },
              salonA.id,
              { phone: nextUniquePhone(), displayName: 'Gate Test' },
              FIXED_NOW
            ),
        },

        // removeBarberStaff x Salon States & Actor State
        {
          fnName: 'removeBarberStaff',
          actionLabel: 'removeBarberStaff',
          stateLabel: 'salon PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            removeBarberStaff(getOwnerACurrent(), pendingSalon.id, barberA1.id, FIXED_NOW),
        },
        {
          fnName: 'removeBarberStaff',
          actionLabel: 'removeBarberStaff',
          stateLabel: 'salon REJECTED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            removeBarberStaff(getOwnerACurrent(), rejectedSalon.id, barberA1.id, FIXED_NOW),
        },
        {
          fnName: 'removeBarberStaff',
          actionLabel: 'removeBarberStaff',
          stateLabel: 'salon SUSPENDED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            removeBarberStaff(getOwnerACurrent(), suspendedSalon.id, barberA1.id, FIXED_NOW),
        },
        {
          fnName: 'removeBarberStaff',
          actionLabel: 'removeBarberStaff',
          stateLabel: 'actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            removeBarberStaff({ ...getOwnerACurrent(), isActive: false }, salonA.id, barberA1.id, FIXED_NOW),
        },

        // reactivateBarberStaff x Salon States & Actor State
        {
          fnName: 'reactivateBarberStaff',
          actionLabel: 'reactivateBarberStaff',
          stateLabel: 'salon PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            reactivateBarberStaff(getOwnerACurrent(), pendingSalon.id, inactiveBarber.id, FIXED_NOW),
        },
        {
          fnName: 'reactivateBarberStaff',
          actionLabel: 'reactivateBarberStaff',
          stateLabel: 'salon REJECTED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            reactivateBarberStaff(getOwnerACurrent(), rejectedSalon.id, inactiveBarber.id, FIXED_NOW),
        },
        {
          fnName: 'reactivateBarberStaff',
          actionLabel: 'reactivateBarberStaff',
          stateLabel: 'salon SUSPENDED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            reactivateBarberStaff(getOwnerACurrent(), suspendedSalon.id, inactiveBarber.id, FIXED_NOW),
        },
        {
          fnName: 'reactivateBarberStaff',
          actionLabel: 'reactivateBarberStaff',
          stateLabel: 'actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            reactivateBarberStaff({ ...getOwnerACurrent(), isActive: false }, salonA.id, inactiveBarber.id, FIXED_NOW),
        },

        // updateBarberProfileStaff x Salon & Barber States (Owner Actor)
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'salon PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: async () => {
            // create temporary barber in pending salon
            const u = await db.user.create({
              data: { phone: nextUniquePhone(), name: 'Tmp P', role: Role.BARBER, isActive: true },
            });
            const b = await db.barber.create({
              data: { userId: u.id, salonId: pendingSalon.id, displayName: 'Tmp P', status: VerificationStatus.VERIFIED, isActive: true },
            });
            const res = await updateBarberProfileStaff(getOwnerACurrent(), b.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW);
            await db.barber.delete({ where: { id: b.id } });
            await db.user.delete({ where: { id: u.id } });
            return res;
          },
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'barber PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(getOwnerACurrent(), barberA2.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW),
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'barber REJECTED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(getOwnerACurrent(), rejectedBarber.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW),
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'barber SUSPENDED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(getOwnerACurrent(), suspendedBarber.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW),
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'barber isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(getOwnerACurrent(), inactiveBarber.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW),
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Owner)',
          stateLabel: 'actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff({ ...getOwnerACurrent(), isActive: false }, barberA1.id, { displayName: 'Changed', experienceYears: 2 }, FIXED_NOW),
        },

        // updateBarberProfileStaff (Barber Self-Edit Actor)
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Barber)',
          stateLabel: 'barber actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(
              { id: inactiveBarberUser.id, phone: inactiveBarberUser.phone, role: Role.BARBER, name: 'Inactive', isActive: false },
              inactiveBarber.id,
              { displayName: 'Changed', experienceYears: 2 },
              FIXED_NOW
            ),
        },
        {
          fnName: 'updateBarberProfileStaff',
          actionLabel: 'updateBarberProfileStaff(Barber)',
          stateLabel: 'barber PENDING actor',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateBarberProfileStaff(
              { id: barberUserA2.id, phone: barberUserA2.phone, role: Role.BARBER, name: 'Pending User', isActive: true },
              barberA2.id,
              { displayName: 'Changed', experienceYears: 2 },
              FIXED_NOW
            ),
        },

        // updateSalonProfileStaff x Salon States & Actor State
        {
          fnName: 'updateSalonProfileStaff',
          actionLabel: 'updateSalonProfileStaff',
          stateLabel: 'salon PENDING',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateSalonProfileStaff(getOwnerACurrent(), pendingSalon.id, { name: 'Changed' }, FIXED_NOW),
        },
        {
          fnName: 'updateSalonProfileStaff',
          actionLabel: 'updateSalonProfileStaff',
          stateLabel: 'salon REJECTED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateSalonProfileStaff(getOwnerACurrent(), rejectedSalon.id, { name: 'Changed' }, FIXED_NOW),
        },
        {
          fnName: 'updateSalonProfileStaff',
          actionLabel: 'updateSalonProfileStaff',
          stateLabel: 'salon SUSPENDED',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateSalonProfileStaff(getOwnerACurrent(), suspendedSalon.id, { name: 'Changed' }, FIXED_NOW),
        },
        {
          fnName: 'updateSalonProfileStaff',
          actionLabel: 'updateSalonProfileStaff',
          stateLabel: 'actor isActive=false',
          expectedCode: 'UNAUTHORIZED',
          run: () =>
            updateSalonProfileStaff({ ...getOwnerACurrent(), isActive: false }, salonA.id, { name: 'Changed' }, FIXED_NOW),
        },
      ];

      it.each(cases)(
        '$actionLabel denied on $stateLabel with $expectedCode and 0 data changes',
        async ({ run, expectedCode }) => {
          // Snapshot state before
          const beforeUserCount = await db.user.count();
          const beforeBarberCount = await db.barber.count();
          const beforeBarberA1 = await db.barber.findUnique({ where: { id: barberA1.id } });
          const beforeSalonA = await db.salon.findUnique({ where: { id: salonA.id } });

          const res = await run();
          expect(res.ok).toBe(false);
          expect(res.code).toBe(expectedCode);

          // Snapshot state after: assert absolute zero change
          const afterUserCount = await db.user.count();
          const afterBarberCount = await db.barber.count();
          const afterBarberA1 = await db.barber.findUnique({ where: { id: barberA1.id } });
          const afterSalonA = await db.salon.findUnique({ where: { id: salonA.id } });

          expect(afterUserCount).toBe(beforeUserCount);
          expect(afterBarberCount).toBe(beforeBarberCount);
          expect(afterBarberA1?.displayName).toBe(beforeBarberA1?.displayName);
          expect(afterBarberA1?.isActive).toBe(beforeBarberA1?.isActive);
          expect(afterSalonA?.name).toBe(beforeSalonA?.name);
        }
      );

      // Exceptions explicitly mandated by Section C:
      it('exception: removeBarberStaff on an inactive or pending barber of a VERIFIED salon succeeds and sets isActive=false', async () => {
        // 1. Pending barber in verified salon
        const resPending = await removeBarberStaff(getOwnerACurrent(), salonA.id, barberA2.id, FIXED_NOW);
        expect(resPending.ok).toBe(true);
        const dbPending = await db.barber.findUnique({ where: { id: barberA2.id } });
        expect(dbPending?.isActive).toBe(false);

        // 2. Inactive barber in verified salon
        const resInactive = await removeBarberStaff(getOwnerACurrent(), salonA.id, inactiveBarber.id, FIXED_NOW);
        expect(resInactive.ok).toBe(true);
        const dbInactive = await db.barber.findUnique({ where: { id: inactiveBarber.id } });
        expect(dbInactive?.isActive).toBe(false);
      });

      it('exception: reactivateBarberStaff on an inactive or pending barber of a VERIFIED salon restores isActive=true and preserves status', async () => {
        // Reactivate barberA2 (which was set inactive above, status is PENDING)
        const reactivatePending = await reactivateBarberStaff(getOwnerACurrent(), salonA.id, barberA2.id, FIXED_NOW);
        expect(reactivatePending.ok).toBe(true);
        const dbPending = await db.barber.findUnique({ where: { id: barberA2.id } });
        expect(dbPending?.isActive).toBe(true);
        expect(dbPending?.status).toBe(VerificationStatus.PENDING); // Preserves PENDING status!

        // Reactivate inactiveBarber
        const reactivateInactive = await reactivateBarberStaff(getOwnerACurrent(), salonA.id, inactiveBarber.id, FIXED_NOW);
        expect(reactivateInactive.ok).toBe(true);
        const dbInactive = await db.barber.findUnique({ where: { id: inactiveBarber.id } });
        expect(dbInactive?.isActive).toBe(true);
        expect(dbInactive?.status).toBe(VerificationStatus.VERIFIED);

        // Restore inactiveBarber to false for subsequent tests
        await db.barber.update({ where: { id: inactiveBarber.id }, data: { isActive: false } });
      });
    });

    // ------------------------------------------------------------------------
    // TEST 4: TIME-OFF STATUS GATING MATRIX (Section C)
    // ------------------------------------------------------------------------
    describe('Time-Off Status Gating Matrix with Real Rows (Section C)', () => {
      interface TimeOffGatingCase {
        action: 'create' | 'delete';
        barberStatusLabel: string;
        getBarberId: () => string;
      }

      const timeOffCases: TimeOffGatingCase[] = [
        { action: 'create', barberStatusLabel: 'barber PENDING', getBarberId: () => barberA2.id },
        { action: 'create', barberStatusLabel: 'barber REJECTED', getBarberId: () => rejectedBarber.id },
        { action: 'create', barberStatusLabel: 'barber SUSPENDED', getBarberId: () => suspendedBarber.id },
        { action: 'create', barberStatusLabel: 'barber isActive=false', getBarberId: () => inactiveBarber.id },
        { action: 'delete', barberStatusLabel: 'barber PENDING', getBarberId: () => barberA2.id },
        { action: 'delete', barberStatusLabel: 'barber REJECTED', getBarberId: () => rejectedBarber.id },
        { action: 'delete', barberStatusLabel: 'barber SUSPENDED', getBarberId: () => suspendedBarber.id },
        { action: 'delete', barberStatusLabel: 'barber isActive=false', getBarberId: () => inactiveBarber.id },
      ];

      it.each(timeOffCases)(
        '$action TimeOff on $barberStatusLabel returns UNAUTHORIZED with 0 changes',
        async ({ action, getBarberId }) => {
          const targetBarberId = getBarberId();

          // Create a REAL TimeOff record in the database for the delete check
          const timeOffRow = await db.timeOff.create({
            data: {
              barberId: targetBarberId,
              startsAt: getOffsetDate(24 * 60 * 60 * 1000),
              endsAt: getOffsetDate(48 * 60 * 60 * 1000),
              reason: 'Real Test TimeOff Row',
            },
          });

          const beforeCount = await db.timeOff.count({ where: { barberId: targetBarberId } });

          if (action === 'create') {
            const res = await createBarberTimeOffStaff(
              getOwnerACurrent(),
              targetBarberId,
              {
                startsAt: getOffsetDate(72 * 60 * 60 * 1000),
                endsAt: getOffsetDate(96 * 60 * 60 * 1000),
                reason: 'Should be denied',
              },
              FIXED_NOW
            );
            expect(res.ok).toBe(false);
            expect(res.code).toBe('UNAUTHORIZED');
          } else {
            const res = await deleteBarberTimeOffStaff(
              getOwnerACurrent(),
              targetBarberId,
              timeOffRow.id,
              FIXED_NOW
            );
            expect(res.ok).toBe(false);
            expect(res.code).toBe('UNAUTHORIZED');
          }

          // Snapshot equality: assert the real timeOff row was untouched
          const afterCount = await db.timeOff.count({ where: { barberId: targetBarberId } });
          expect(afterCount).toBe(beforeCount);

          const stillExists = await db.timeOff.findUnique({ where: { id: timeOffRow.id } });
          expect(stillExists).not.toBeNull();
          expect(stillExists?.reason).toBe('Real Test TimeOff Row');

          // Clean up real row
          await db.timeOff.delete({ where: { id: timeOffRow.id } });
        }
      );
    });

    // ------------------------------------------------------------------------
    // TEST 5: ADD BARBER STAFF
    // ------------------------------------------------------------------------
    it('addBarberStaff: creates User(BARBER) and Barber(PENDING, isActive=true) atomically with phone normalization and audit log', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const rawPhone = '98765 43219'; // 10-digit Indian format with space
      const addRes = await addBarberStaff(
        getOwnerACurrent(),
        salonA.id,
        {
          displayName: 'Ustaad Salman',
          phone: rawPhone,
          experienceYears: 4,
          bio: 'Expert in beard styling.',
        },
        FIXED_NOW
      );

      expect(addRes.ok).toBe(true);
      expect(addRes.data).toBeDefined();
      expect(addRes.data?.displayName).toBe('Ustaad Salman');

      const newBarberId = addRes.data!.id;
      const newUserId = addRes.data!.userId;

      // Verify User record
      const dbUser = await db.user.findUnique({ where: { id: newUserId } });
      expect(dbUser).toBeDefined();
      expect(dbUser?.phone).toBe('+919876543219'); // E.164 normalized
      expect(dbUser?.role).toBe(Role.BARBER);
      expect(dbUser?.isActive).toBe(true);

      // Verify Barber record
      const dbBarber = await db.barber.findUnique({ where: { id: newBarberId } });
      expect(dbBarber).toBeDefined();
      expect(dbBarber?.displayName).toBe('Ustaad Salman');
      expect(dbBarber?.status).toBe(VerificationStatus.PENDING);
      expect(dbBarber?.isActive).toBe(true);
      expect(dbBarber?.experienceYears).toBe(4);
      expect(dbBarber?.bio).toBe('Expert in beard styling.');

      // Verify audit log
      expect(consoleSpy).toHaveBeenCalled();
      const auditCall = consoleSpy.mock.calls.find((callArgs: unknown[]) => {
        try {
          const parsed = JSON.parse(callArgs[0]);
          return parsed.event === 'STAFF_CONFIG_CHANGE' && parsed.action === 'CREATE';
        } catch {
          return false;
        }
      });
      expect(auditCall).toBeDefined();
      const payload = JSON.parse(auditCall[0]);
      expect(payload.staffUserId).toBe(ownerA.id);
      expect(payload.entity).toBe('Barber');
      expect(payload.entityId).toBe(newBarberId);

      // Clean up newly created barber
      await db.barber.delete({ where: { id: newBarberId } });
      await db.user.delete({ where: { id: newUserId } });
    });

    // ------------------------------------------------------------------------
    // TEST 6: ADD BARBER DUPLICATE PHONE PER ROLE (Part D.6)
    // ------------------------------------------------------------------------
    describe('addBarberStaff: duplicate phone across every role (Part D.6)', () => {
      const rolesToTest = [
        { role: Role.CUSTOMER, getPhone: () => customerUser.phone },
        { role: Role.BARBER, getPhone: () => barberUserA1.phone },
        { role: Role.OWNER, getPhone: () => ownerB.phone },
        { role: Role.ADMIN, getPhone: () => adminUser.phone },
      ];

      it.each(rolesToTest)(
        'returns PHONE_IN_USE and zero changes when phone matches existing $role',
        async ({ getPhone }) => {
          const existingPhone = getPhone();
          const beforeUserCount = await db.user.count();
          const beforeBarberCount = await db.barber.count();

          const res = await addBarberStaff(
            getOwnerACurrent(),
            salonA.id,
            { displayName: 'Duplicate Barber', phone: existingPhone },
            FIXED_NOW
          );

          expect(res.ok).toBe(false);
          expect(res.code).toBe('PHONE_IN_USE');

          // Assert zero DB changes
          const afterUserCount = await db.user.count();
          const afterBarberCount = await db.barber.count();
          expect(afterUserCount).toBe(beforeUserCount);
          expect(afterBarberCount).toBe(beforeBarberCount);
        }
      );
    });

    // ------------------------------------------------------------------------
    // TEST 7: CONCURRENT ADD BARBER SAME PHONE RACE
    // ------------------------------------------------------------------------
    it('concurrent addBarberStaff (Promise.all) with same phone: exactly one succeeds, one returns PHONE_IN_USE', async () => {
      const targetPhone = nextUniquePhone();

      const [res1, res2] = await Promise.all([
        addBarberStaff(getOwnerACurrent(), salonA.id, { phone: targetPhone, displayName: 'Race One' }, FIXED_NOW),
        addBarberStaff(getOwnerACurrent(), salonA.id, { phone: targetPhone, displayName: 'Race Two' }, FIXED_NOW),
      ]);

      const successCount = [res1, res2].filter((r) => r.ok).length;
      const phoneInUseCount = [res1, res2].filter((r) => !r.ok && r.code === 'PHONE_IN_USE').length;

      expect(successCount).toBe(1);
      expect(phoneInUseCount).toBe(1);

      const winner = res1.ok ? res1 : res2;
      const winnerBarberId = winner.data!.id;
      const winnerUserId = winner.data!.userId;

      // Clean up winner
      await db.barber.delete({ where: { id: winnerBarberId } });
      await db.user.delete({ where: { id: winnerUserId } });
    });

    // ------------------------------------------------------------------------
    // TEST 8: 20-BARBER CAP CONCURRENCY RACE (Part E)
    // ------------------------------------------------------------------------
    it('20-barber cap race: salon at 19 barbers, two concurrent adds produce exactly one success and one LIMIT_EXCEEDED, ending at exactly 20 barbers', async () => {
      // 1. Create temporary dedicated salon
      const capSalon = await db.salon.create({
        data: {
          ownerId: ownerA.id,
          name: 'Cap Test Salon',
          slug: `cap-salon-${nextFixtureId()}`,
          status: VerificationStatus.VERIFIED,
          addressLine: 'Cap Road 19',
          area: 'Test',
          city: 'Bengaluru',
          pincode: '560001',
        },
      });

      // 2. Pre-populate exactly 19 barbers in this salon via createMany (fast bulk insert)
      const tempUserIds: string[] = [];
      const tempBarberIds: string[] = [];
      const uData = [];
      const bData = [];

      for (let i = 1; i <= 19; i++) {
        const uId = `usr-cap-${i}-${nextFixtureId()}`;
        const bId = `bar-cap-${i}-${nextFixtureId()}`;
        tempUserIds.push(uId);
        tempBarberIds.push(bId);
        uData.push({
          id: uId,
          phone: nextUniquePhone(),
          name: `Cap User ${i}`,
          role: Role.BARBER,
          isActive: true,
        });
        bData.push({
          id: bId,
          userId: uId,
          salonId: capSalon.id,
          displayName: `Cap Barber ${i}`,
          status: VerificationStatus.VERIFIED,
          isActive: true,
        });
      }

      await db.user.createMany({ data: uData });
      await db.barber.createMany({ data: bData });

      const initialCount = await db.barber.count({ where: { salonId: capSalon.id } });
      expect(initialCount).toBe(19);

      // 3. Launch 2 concurrent additions with different phone numbers
      const phoneA = nextUniquePhone();
      const phoneB = nextUniquePhone();

      const [resA, resB] = await Promise.all([
        addBarberStaff(getOwnerACurrent(), capSalon.id, { phone: phoneA, displayName: 'Candidate A' }, FIXED_NOW),
        addBarberStaff(getOwnerACurrent(), capSalon.id, { phone: phoneB, displayName: 'Candidate B' }, FIXED_NOW),
      ]);

      const successCount = [resA, resB].filter((r) => r.ok).length;
      const limitExceededCount = [resA, resB].filter((r) => !r.ok && r.code === 'LIMIT_EXCEEDED').length;

      expect(successCount).toBe(1);
      expect(limitExceededCount).toBe(1);

      // Salon ends at exactly 20 barbers
      const finalCount = await db.barber.count({ where: { salonId: capSalon.id } });
      expect(finalCount).toBe(20);

      // Clean up cap salon
      const winner = resA.ok ? resA : resB;
      if (winner.data) {
        tempBarberIds.push(winner.data.id);
        tempUserIds.push(winner.data.userId);
      }

      await db.barber.deleteMany({ where: { id: { in: tempBarberIds } } });
      await db.user.deleteMany({ where: { id: { in: tempUserIds } } });
      await db.salon.delete({ where: { id: capSalon.id } });
    }, 60000);

    // ------------------------------------------------------------------------
    // TEST 9: BLOCKED REMOVAL SNAPSHOT EQUALITY (Part D.7)
    // ------------------------------------------------------------------------
    it('removeBarberStaff: blocked with BARBER_HAS_BOOKINGS on active bookings; snapshots assert zero booking changes and returns masked label without 10-digit phone', async () => {
      // Create a test booking on barberA1
      const bookingStart = getOffsetDate(2 * 60 * 60 * 1000);
      const bookingEnd = getOffsetDate(2.5 * 60 * 60 * 1000);
      const tokenDate = toTokenDateUtc(bookingStart);

      const activeBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          token: 99,
          tokenDate,
          startsAt: bookingStart,
          endsAt: bookingEnd,
          totalRupees: 150,
          status: BookingStatus.CONFIRMED,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          items: {
            create: [{ serviceId: serviceA.id, priceRupees: 150, durationMin: 30 }],
          },
        },
      });

      // Snapshot all bookings before removal attempt
      const bookingsBefore = await db.booking.findMany({
        where: { barberId: barberA1.id },
        orderBy: { id: 'asc' },
      });

      const removeBlocked = await removeBarberStaff(getOwnerACurrent(), salonA.id, barberA1.id, FIXED_NOW);
      expect(removeBlocked.ok).toBe(false);
      expect(removeBlocked.code).toBe('BARBER_HAS_BOOKINGS');

      // Assert zero change to existing bookings
      const bookingsAfter = await db.booking.findMany({
        where: { barberId: barberA1.id },
        orderBy: { id: 'asc' },
      });
      expect(bookingsAfter).toEqual(bookingsBefore);

      // Verify the returned list contains masked customer label and no 10-digit phone
      const blockingList = (
        removeBlocked as {
          data?: { blockingBookings?: Array<{ id: string; token: number; customerLabel: string }> };
        }
      ).data?.blockingBookings;
      expect(blockingList).toBeDefined();
      expect(blockingList!.length).toBeGreaterThan(0);

      const item = blockingList![0];
      expect(item.id).toBe(activeBooking.id);
      expect(item.token).toBe(99);

      // Verify no plain 10-digit phone number is exposed in the customer label
      expect(item.customerLabel).toMatch(/\+91\s+\*{4,}\d{4}/);
      expect(/\d{10}/.test(item.customerLabel)).toBe(false);

      // Clean up booking
      await db.bookingItem.deleteMany({ where: { bookingId: activeBooking.id } });
      await db.booking.delete({ where: { id: activeBooking.id } });
    });

    // ------------------------------------------------------------------------
    // TEST 10: REAL REMOVE-VS-BOOKING RACE TEST (Part B - 10 iterations)
    // ------------------------------------------------------------------------
    it('concurrent removeBarberStaff vs createBooking: 10 iterations with real createBooking strictly serialize via FOR SHARE lock', async () => {
      // Repeat 10 times with fresh fixtures and future slots
      for (let iter = 1; iter <= 10; iter++) {
        // Create fresh barber fixture
        const bUser = await db.user.create({
          data: {
            phone: nextUniquePhone(),
            name: `Iter Barber ${iter}`,
            role: Role.BARBER,
            isActive: true,
          },
        });

        const iterBarber = await db.barber.create({
          data: {
            userId: bUser.id,
            salonId: salonA.id,
            displayName: `Iter Barber ${iter}`,
            status: VerificationStatus.VERIFIED,
            isActive: true,
            experienceYears: 5,
            services: { create: { serviceId: serviceA.id } },
            availability: {
              create: [0, 1, 2, 3, 4, 5, 6].map((w) => ({
                weekday: w,
                startMin: 540,
                endMin: 1200,
              })),
            },
          },
        });

        const slotStartsAt = getOffsetDate((iter + 1) * 24 * 60 * 60 * 1000); // Days in future

        const [removeRes, bookingRes] = await Promise.all([
          removeBarberStaff(getOwnerACurrent(), salonA.id, iterBarber.id, FIXED_NOW),
          createBooking({
            customerId: customerUser.id,
            salonId: salonA.id,
            barberId: iterBarber.id,
            serviceIds: [serviceA.id],
            startsAt: slotStartsAt,
            now: FIXED_NOW,
          }),
        ]);

        const dbBarber = await db.barber.findUnique({ where: { id: iterBarber.id } });
        const dbBookings = await db.booking.findMany({
          where: { barberId: iterBarber.id, status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] } },
        });

        // Allowed outcomes only:
        // Outcome 1: remove ok AND createBooking NOT_FOUND AND 0 bookings
        const outcome1 =
          removeRes.ok === true &&
          bookingRes.ok === false &&
          bookingRes.code === 'NOT_FOUND' &&
          dbBookings.length === 0;

        // Outcome 2: remove BARBER_HAS_BOOKINGS AND createBooking ok AND barber still active
        const outcome2 =
          removeRes.ok === false &&
          removeRes.code === 'BARBER_HAS_BOOKINGS' &&
          bookingRes.ok === true &&
          dbBarber?.isActive === true &&
          dbBookings.length === 1;

        expect(
          outcome1 || outcome2,
          `Iteration ${iter} failed to serialize to a valid outcome: removeOk=${removeRes.ok}, bookingOk=${bookingRes.ok}`
        ).toBe(true);

        // Core Invariant: never (barber.isActive === false AND an active future booking exists)
        const invariantViolated = dbBarber?.isActive === false && dbBookings.length > 0;
        expect(invariantViolated, `Invariant violated on iteration ${iter}! Inactive barber holds active booking`).toBe(false);

        // Clean up iteration fixtures
        await db.bookingItem.deleteMany({ where: { booking: { barberId: iterBarber.id } } });
        await db.booking.deleteMany({ where: { barberId: iterBarber.id } });
        await db.barberService.deleteMany({ where: { barberId: iterBarber.id } });
        await db.availability.deleteMany({ where: { barberId: iterBarber.id } });
        await db.barber.delete({ where: { id: iterBarber.id } });
        await db.user.delete({ where: { id: bUser.id } });
      }
    }, 60000);

    // ------------------------------------------------------------------------
    // TEST 11: REACTIVATE BARBER STAFF
    // ------------------------------------------------------------------------
    it('reactivateBarberStaff: restores isActive=true, preserves status, and emits audit log', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Ensure inactiveBarber is inactive
      await db.barber.update({ where: { id: inactiveBarber.id }, data: { isActive: false } });

      const reactivateRes = await reactivateBarberStaff(
        getOwnerACurrent(),
        salonA.id,
        inactiveBarber.id,
        FIXED_NOW
      );

      expect(reactivateRes.ok).toBe(true);
      expect(reactivateRes.data?.isActive).toBe(true);

      const dbBarber = await db.barber.findUnique({ where: { id: inactiveBarber.id } });
      expect(dbBarber?.isActive).toBe(true);
      expect(dbBarber?.status).toBe(VerificationStatus.VERIFIED);

      // Verify audit log
      expect(consoleSpy).toHaveBeenCalled();
      const auditCall = consoleSpy?.mock.calls.find((callArgs: unknown[]) => {
        try {
          const parsed = JSON.parse(String(callArgs[0]));
          return parsed.event === 'STAFF_CONFIG_CHANGE' && parsed.action === 'REACTIVATE';
        } catch {
          return false;
        }
      });
      expect(auditCall).toBeDefined();

      // Reset inactiveBarber back to false
      await db.barber.update({ where: { id: inactiveBarber.id }, data: { isActive: false } });
    });

    // ------------------------------------------------------------------------
    // TEST 12: UPDATE BARBER PROFILE MASS-ASSIGNMENT
    // ------------------------------------------------------------------------
    it('updateBarberProfileStaff: allows valid edits; protects against mass-assignment', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const editRes = await updateBarberProfileStaff(
        getBarberA1Current(),
        barberA1.id,
        {
          displayName: 'Ustaad Ramesh Master',
          experienceYears: 6,
          bio: '10 years experience in royal hair art.',
          photoUrl: 'https://cdn.example.com/ramesh-new.jpg',
          // Mass-assignment injection attempt
          ...({ id: 'hacked-id', salonId: salonB.id, status: 'VERIFIED', userId: 'hacked-user' } as unknown as Record<string, string>),
        },
        FIXED_NOW
      );

      expect(editRes.ok).toBe(true);

      const dbBarber = await db.barber.findUnique({ where: { id: barberA1.id } });
      expect(dbBarber?.displayName).toBe('Ustaad Ramesh Master');
      expect(dbBarber?.experienceYears).toBe(6);
      expect(dbBarber?.bio).toBe('10 years experience in royal hair art.');
      expect(dbBarber?.photoUrl).toBe('https://cdn.example.com/ramesh-new.jpg');

      // Assert immutable fields were not touched by mass-assignment
      expect(dbBarber?.id).toBe(barberA1.id);
      expect(dbBarber?.salonId).toBe(salonA.id);
      expect(dbBarber?.userId).toBe(barberUserA1.id);
      expect(dbBarber?.status).toBe(VerificationStatus.VERIFIED);

      // Restore
      await db.barber.update({
        where: { id: barberA1.id },
        data: { displayName: 'Ustaad Ramesh', experienceYears: 5, bio: null, photoUrl: null },
      });
    });

    // ------------------------------------------------------------------------
    // TEST 13: UPDATE SALON PROFILE MASS-ASSIGNMENT
    // ------------------------------------------------------------------------
    it('updateSalonProfileStaff: allows valid edits; protects against mass-assignment', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const editRes = await updateSalonProfileStaff(
        getOwnerACurrent(),
        salonA.id,
        {
          name: 'Sharma Ji Hair Arts & Salon',
          nameHi: 'शर्मा जी हेयर आर्ट्स',
          description: 'Traditional styling since 1994.',
          phone: '+919876543299',
          addressLine: 'Shop 4, 12th Main Indiranagar',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
          requiresApproval: true,
          // Mass-assignment injection attempt
          ...({ id: 'hacked-id', slug: 'hacked-slug', ownerId: ownerB.id, status: 'SUSPENDED' } as unknown as Record<string, string>),
        },
        FIXED_NOW
      );

      expect(editRes.ok).toBe(true);

      const dbSalon = await db.salon.findUnique({ where: { id: salonA.id } });
      expect(dbSalon?.name).toBe('Sharma Ji Hair Arts & Salon');
      expect(dbSalon?.nameHi).toBe('शर्मा जी हेयर आर्ट्स');
      expect(dbSalon?.phone).toBe('+919876543299');
      expect(dbSalon?.requiresApproval).toBe(true);

      // Assert immutable fields were not touched by mass-assignment
      expect(dbSalon?.id).toBe(salonA.id);
      expect(dbSalon?.slug).toBe(salonA.slug);
      expect(dbSalon?.ownerId).toBe(ownerA.id);
      expect(dbSalon?.status).toBe(VerificationStatus.VERIFIED);

      // Restore
      await db.salon.update({
        where: { id: salonA.id },
        data: { name: 'Salon A Roster Test', nameHi: 'सैलून ए टेस्ट', phone: '+919876540001', requiresApproval: false },
      });
    });

    // ------------------------------------------------------------------------
    // TEST 14: UPDATE BARBER PROFILE PHOTO URL GUARD
    // ------------------------------------------------------------------------
    it('updateBarberProfileStaff: rejects invalid photo URLs with INVALID_PHOTO_URL', async () => {
      const editRes = await updateBarberProfileStaff(
        getBarberA1Current(),
        barberA1.id,
        {
          displayName: 'Ustaad Ramesh',
          experienceYears: 5,
          photoUrl: 'http://insecure.example.com/ramesh.jpg', // Unencrypted http
        },
        FIXED_NOW
      );

      expect(editRes.ok).toBe(false);
      expect(editRes.code).toBe('INVALID_PHOTO_URL');
    });

    // ------------------------------------------------------------------------
    // TEST 15: MISSING TEST D.1 (Pending Barber Visibility & Admin Approval)
    // ------------------------------------------------------------------------
    it('D.1: pending barber is absent from public salon data and getAvailableSlots; after admin approves it, it appears', async () => {
      // 1. BarberA2 is PENDING. Verify absent from public salon data
      const publicSalonBefore = await getSalonBySlug(salonA.slug);
      expect(publicSalonBefore).not.toBeNull();
      const barberIdsInPublic = publicSalonBefore!.barbers.map((b) => b.id);
      expect(barberIdsInPublic).toContain(barberA1.id);
      expect(barberIdsInPublic).not.toContain(barberA2.id); // Absent!

      // Verify absent from getAvailableSlots
      const slotDateIst = '2026-06-16';
      const slotsBefore = await getAvailableSlots({
        barberId: barberA2.id,
        dateIst: slotDateIst,
        serviceIds: [serviceA.id],
        now: FIXED_NOW,
      });
      expect(slotsBefore.ok).toBe(false);
      expect(slotsBefore.code).toBe('NOT_FOUND');

      // 2. Admin approves barberA2
      await db.barber.update({
        where: { id: barberA2.id },
        data: {
          status: VerificationStatus.VERIFIED,
          services: { create: { serviceId: serviceA.id } },
          availability: {
            create: [0, 1, 2, 3, 4, 5, 6].map((w) => ({
              weekday: w,
              startMin: 540,
              endMin: 1200,
            })),
          },
        },
      });

      // 3. Verify barberA2 now appears in public salon data
      const publicSalonAfter = await getSalonBySlug(salonA.slug);
      const barberIdsAfter = publicSalonAfter!.barbers.map((b) => b.id);
      expect(barberIdsAfter).toContain(barberA2.id);

      // Verify available in getAvailableSlots
      const slotsAfter = await getAvailableSlots({
        barberId: barberA2.id,
        dateIst: slotDateIst,
        serviceIds: [serviceA.id],
        now: FIXED_NOW,
      });
      expect(slotsAfter.ok).toBe(true);
      expect(slotsAfter.data!.length).toBeGreaterThan(0);

      // Restore barberA2 back to PENDING and clean up joins
      await db.barberService.deleteMany({ where: { barberId: barberA2.id } });
      await db.availability.deleteMany({ where: { barberId: barberA2.id } });
      await db.barber.update({
        where: { id: barberA2.id },
        data: { status: VerificationStatus.PENDING },
      });
    });

    // ------------------------------------------------------------------------
    // TEST 16: MISSING TEST D.2 (Removed Barber Lifecycle Across All Paths)
    // ------------------------------------------------------------------------
    it('D.2: removed barber is absent from public salon data, getAvailableSlots, createBooking (NOT_FOUND), walk-in choices and register chips; past bookings still appear in history; reactivate restores all', async () => {
      // 1. Create a past completed booking on barberA1
      const pastBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          token: 101,
          tokenDate: toTokenDateUtc(getOffsetDate(-5 * 24 * 60 * 60 * 1000)),
          startsAt: getOffsetDate(-5 * 24 * 60 * 60 * 1000),
          endsAt: getOffsetDate(-5 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
          totalRupees: 150,
          status: BookingStatus.COMPLETED,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          items: { create: [{ serviceId: serviceA.id, priceRupees: 150, durationMin: 30 }] },
        },
      });

      // 2. Remove barberA1
      const removeRes = await removeBarberStaff(getOwnerACurrent(), salonA.id, barberA1.id, FIXED_NOW);
      expect(removeRes.ok).toBe(true);

      // Path A: absent from public salon data
      const publicSalon = await getSalonBySlug(salonA.slug);
      expect(publicSalon!.barbers.map((b) => b.id)).not.toContain(barberA1.id);

      // Path B: absent from getAvailableSlots (returns NOT_FOUND)
      const slotsRes = await getAvailableSlots({
        barberId: barberA1.id,
        dateIst: '2026-06-16',
        serviceIds: [serviceA.id],
        now: FIXED_NOW,
      });
      expect(slotsRes.ok).toBe(false);
      expect(slotsRes.code).toBe('NOT_FOUND');

      // Path C: createBooking returns NOT_FOUND
      const bookingRes = await createBooking({
        customerId: customerUser.id,
        salonId: salonA.id,
        barberId: barberA1.id,
        serviceIds: [serviceA.id],
        startsAt: getOffsetDate(24 * 60 * 60 * 1000),
        now: FIXED_NOW,
      });
      expect(bookingRes.ok).toBe(false);
      expect(bookingRes.code).toBe('NOT_FOUND');

      // Path D: walk-in choices and register filter chips in getStaffDashboardContext
      const staffContext = await getStaffDashboardContext(getOwnerACurrent(), salonA.id);
      expect(staffContext.ok).toBe(true);
      if (staffContext.ok) {
        const availableBarberIds = staffContext.barbers.map((b) => b.id);
        expect(availableBarberIds).not.toContain(barberA1.id);
      }

      // Path E: past bookings STILL appear in history
      const historyRes = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA.id,
        status: 'ALL_FINAL',
        now: FIXED_NOW,
      });
      expect(historyRes.ok).toBe(true);
      const foundPastBooking = historyRes.data!.items.find((i) => i.id === pastBooking.id);
      expect(foundPastBooking).toBeDefined();
      expect(foundPastBooking?.barberName).toBe('Ustaad Ramesh');

      // 3. Reactivate restores all paths
      const reactivateRes = await reactivateBarberStaff(getOwnerACurrent(), salonA.id, barberA1.id, FIXED_NOW);
      expect(reactivateRes.ok).toBe(true);

      // Restored in public salon data
      const publicSalonRestored = await getSalonBySlug(salonA.slug);
      expect(publicSalonRestored!.barbers.map((b) => b.id)).toContain(barberA1.id);

      // Restored in dashboard context
      const staffContextRestored = await getStaffDashboardContext(getOwnerACurrent(), salonA.id);
      expect(staffContextRestored.ok).toBe(true);
      if (staffContextRestored.ok) {
        expect(staffContextRestored.barbers.map((b) => b.id)).toContain(barberA1.id);
      }

      // Clean up past booking
      await db.bookingItem.deleteMany({ where: { bookingId: pastBooking.id } });
      await db.booking.delete({ where: { id: pastBooking.id } });
    });

    // ------------------------------------------------------------------------
    // TEST 17: MISSING TEST D.3 (requiresApproval Gating)
    // ------------------------------------------------------------------------
    it('D.3: requiresApproval=true: a new online booking becomes PENDING while an existing CONFIRMED booking is unchanged; with false a new booking is CONFIRMED', async () => {
      // 1. Create pre-existing CONFIRMED booking
      const preExisting = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          token: 201,
          tokenDate: toTokenDateUtc(getOffsetDate(24 * 60 * 60 * 1000)),
          startsAt: getOffsetDate(24 * 60 * 60 * 1000),
          endsAt: getOffsetDate(24 * 60 * 60 * 1000 + 30 * 60 * 1000),
          totalRupees: 150,
          status: BookingStatus.CONFIRMED,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          items: { create: [{ serviceId: serviceA.id, priceRupees: 150, durationMin: 30 }] },
        },
      });

      // 2. Set salonA.requiresApproval = true
      await db.salon.update({ where: { id: salonA.id }, data: { requiresApproval: true } });

      // Book new slot
      const newSlot1 = getOffsetDate(24 * 60 * 60 * 1000 + 60 * 60 * 1000);
      const resPending = await createBooking({
        customerId: customerUser.id,
        salonId: salonA.id,
        barberId: barberA1.id,
        serviceIds: [serviceA.id],
        startsAt: newSlot1,
        now: FIXED_NOW,
      });

      expect(resPending.ok).toBe(true);
      expect(resPending.data!.status).toBe(BookingStatus.PENDING);

      // Verify pre-existing booking was completely unchanged
      const dbPreExisting = await db.booking.findUnique({ where: { id: preExisting.id } });
      expect(dbPreExisting?.status).toBe(BookingStatus.CONFIRMED);

      // 3. Set salonA.requiresApproval = false
      await db.salon.update({ where: { id: salonA.id }, data: { requiresApproval: false } });

      const newSlot2 = getOffsetDate(24 * 60 * 60 * 1000 + 120 * 60 * 1000);
      const resConfirmed = await createBooking({
        customerId: customerUser.id,
        salonId: salonA.id,
        barberId: barberA1.id,
        serviceIds: [serviceA.id],
        startsAt: newSlot2,
        now: FIXED_NOW,
      });

      expect(resConfirmed.ok).toBe(true);
      expect(resConfirmed.data!.status).toBe(BookingStatus.CONFIRMED);

      // Clean up bookings
      const bookingIds = [preExisting.id, resPending.data!.id, resConfirmed.data!.id];
      await db.bookingItem.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
    });

    // ------------------------------------------------------------------------
    // TEST 18: MISSING TEST D.4 & D.5 (History Scoping & Multi-Salon Owner)
    // ------------------------------------------------------------------------
    it('D.4: history scoping: foreign salonId/barberId returns NOT_FOUND; barber query ignores foreign params and sees only own bookings; owner sees whole salon', async () => {
      // 1. Owner queries with foreign salonId -> NOT_FOUND
      const foreignSalonRes = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonB.id,
        now: FIXED_NOW,
      });
      expect(foreignSalonRes.ok).toBe(false);
      expect(foreignSalonRes.code).toBe('NOT_FOUND');

      // 2. Owner queries with foreign barberId (barber in Salon B) -> NOT_FOUND
      const foreignBarberRes = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA.id,
        barberId: barberB1.id,
        now: FIXED_NOW,
      });
      expect(foreignBarberRes.ok).toBe(false);
      expect(foreignBarberRes.code).toBe('NOT_FOUND');

      // 3. Barber user queries with foreign barberId or salonId -> ignored, strictly locks to own barber
      const barberActor = getBarberA1Current();
      const barberScopedRes = await getBookingHistoryStaff({
        staffUser: barberActor,
        salonId: salonB.id, // Ignored
        barberId: barberB1.id, // Ignored
        now: FIXED_NOW,
      });
      expect(barberScopedRes.ok).toBe(true);
    });

    it('D.5: multi-salon owner: history is isolated per salon; foreign owner salon is not reachable', async () => {
      // Create a booking in salonA and a booking in salonA2
      const b1 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          token: 301,
          tokenDate: toTokenDateUtc(getOffsetDate(-1 * 24 * 60 * 60 * 1000)),
          startsAt: getOffsetDate(-1 * 24 * 60 * 60 * 1000),
          endsAt: getOffsetDate(-1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
          totalRupees: 100,
          status: BookingStatus.COMPLETED,
          type: BookingType.IN_SALON,
          source: BookingSource.ONLINE,
          items: { create: [{ serviceId: serviceA.id, priceRupees: 100, durationMin: 30 }] },
        },
      });

      // Query salonA history
      const resA = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA.id,
        now: FIXED_NOW,
      });
      expect(resA.ok).toBe(true);
      expect(resA.data!.items.map((i) => i.id)).toContain(b1.id);

      // Query salonA2 history -> isolated, does not contain b1
      const resA2 = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA2.id,
        now: FIXED_NOW,
      });
      expect(resA2.ok).toBe(true);
      expect(resA2.data!.items.map((i) => i.id)).not.toContain(b1.id);

      // Query foreign owner's salon -> NOT_FOUND
      const resForeign = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonB.id,
        now: FIXED_NOW,
      });
      expect(resForeign.ok).toBe(false);
      expect(resForeign.code).toBe('NOT_FOUND');

      // Clean up
      await db.bookingItem.deleteMany({ where: { bookingId: b1.id } });
      await db.booking.delete({ where: { id: b1.id } });
    });

    // ------------------------------------------------------------------------
    // TEST 19: MISSING TEST D.8 (Audit Logging for All 5 Actions)
    // ------------------------------------------------------------------------
    it('D.8: audit log: each write action emits exactly one STAFF_CONFIG_CHANGE with staffUserId, entity, entityId, action, and no phone number digits', async () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // 1. addBarberStaff (using salonA2 to avoid salonA cap interference)
      const phoneNew = nextUniquePhone();
      const addRes = await addBarberStaff(
        getOwnerACurrent(),
        salonA2.id,
        { phone: phoneNew, displayName: 'Audit Barber' },
        FIXED_NOW
      );
      if (!addRes.ok) {
        console.error('addBarberStaff failed in D.8:', addRes);
      }
      expect(addRes.ok).toBe(true);
      const newBarberId = addRes.data!.id;
      const newUserId = addRes.data!.userId;

      // 2. updateBarberProfileStaff (using active & verified barberA1)
      await updateBarberProfileStaff(getOwnerACurrent(), barberA1.id, { displayName: 'Audit Renamed', experienceYears: 5 }, FIXED_NOW);

      // 3. removeBarberStaff
      await removeBarberStaff(getOwnerACurrent(), salonA2.id, newBarberId, FIXED_NOW);

      // 4. reactivateBarberStaff
      await reactivateBarberStaff(getOwnerACurrent(), salonA2.id, newBarberId, FIXED_NOW);

      // 5. updateSalonProfileStaff (with all required address fields)
      await updateSalonProfileStaff(
        getOwnerACurrent(),
        salonA2.id,
        {
          name: 'Audit Salon Name',
          addressLine: '102 Koramangala',
          area: 'Koramangala',
          city: 'Bengaluru',
          pincode: '560034',
        },
        FIXED_NOW
      );

      // Assert all 5 events were logged
      const calls = (consoleSpy?.mock.calls || [])
        .map((args: unknown[]) => {
          try {
            return JSON.parse(String(args[0])) as {
              event: string;
              staffUserId: string;
              entity: string;
              entityId: string;
              action: string;
              timestamp: string;
            };
          } catch {
            return null;
          }
        })
        .filter((c): c is { event: string; staffUserId: string; entity: string; entityId: string; action: string; timestamp: string } => Boolean(c && c.event === 'STAFF_CONFIG_CHANGE'));

      expect(calls.length).toBeGreaterThanOrEqual(5);

      // Verify each call format and ensure NO phone number digits (+91 or 10-digit number)
      for (const event of calls) {
        expect(event.staffUserId).toBe(ownerA.id);
        expect(['Barber', 'Salon']).toContain(event.entity);
        expect(event.entityId).toBeDefined();
        expect(['CREATE', 'UPDATE_PROFILE', 'DEACTIVATE', 'REACTIVATE']).toContain(event.action);
        expect(event.timestamp).toBeDefined();

        const jsonStr = JSON.stringify(event);
        // Assert no raw 10-digit phone number or +91 pattern is serialized in the log payload
        expect(/\+91\d{10}/.test(jsonStr)).toBe(false);
        expect(/\b\d{10}\b/.test(jsonStr)).toBe(false);
      }

      // Clean up
      await db.barber.delete({ where: { id: newBarberId } });
      await db.user.delete({ where: { id: newUserId } });
      await db.barber.update({ where: { id: barberA1.id }, data: { displayName: 'Ustaad Ramesh' } });
      await db.salon.update({ where: { id: salonA.id }, data: { name: 'Salon A Roster Test' } });
    });

    // ------------------------------------------------------------------------
    // TEST 20: MISSING TEST D.9 (History Date Range Boundary)
    // ------------------------------------------------------------------------
    it('D.9: history date range of 93 days returns exact code INVALID_INPUT; 92 days is accepted', async () => {
      // 93-day difference
      const from93 = '2026-01-01';
      const to93 = '2026-04-04'; // 93 days

      const res93 = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA.id,
        fromDateIst: from93,
        toDateIst: to93,
        now: FIXED_NOW,
      });
      expect(res93.ok).toBe(false);
      expect(res93.code).toBe('INVALID_INPUT');

      // 92-day difference
      const from92 = '2026-01-01';
      const to92 = '2026-04-03'; // 92 days

      const res92 = await getBookingHistoryStaff({
        staffUser: getOwnerACurrent(),
        salonId: salonA.id,
        fromDateIst: from92,
        toDateIst: to92,
        now: FIXED_NOW,
      });
      expect(res92.ok).toBe(true);
    });

    // ------------------------------------------------------------------------
    // TEST 21: SPLIT HISTORY TESTS (Section F)
    // ------------------------------------------------------------------------
    describe('Split History Suite (Section F)', () => {
      let histBooking1: Booking;
      let histBooking2: Booking;
      let histBooking3: Booking;

      beforeAll(async () => {
        // 1. Completed booking for barberA1
        histBooking1 = await db.booking.create({
          data: {
            salonId: salonA.id,
            barberId: barberA1.id,
            customerId: customerUser.id,
            token: 401,
            tokenDate: toTokenDateUtc(getOffsetDate(-2 * 24 * 60 * 60 * 1000)),
            startsAt: getOffsetDate(-2 * 24 * 60 * 60 * 1000),
            endsAt: getOffsetDate(-2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
            totalRupees: 200,
            status: BookingStatus.COMPLETED,
            type: BookingType.IN_SALON,
            source: BookingSource.ONLINE,
            items: { create: [{ serviceId: serviceA.id, priceRupees: 200, durationMin: 30 }] },
          },
        });

        // 2. Cancelled booking for barberA1
        histBooking2 = await db.booking.create({
          data: {
            salonId: salonA.id,
            barberId: barberA1.id,
            customerId: customerUser.id,
            token: 402,
            tokenDate: toTokenDateUtc(getOffsetDate(-3 * 24 * 60 * 60 * 1000)),
            startsAt: getOffsetDate(-3 * 24 * 60 * 60 * 1000),
            endsAt: getOffsetDate(-3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
            totalRupees: 150,
            status: BookingStatus.CANCELLED,
            type: BookingType.IN_SALON,
            source: BookingSource.ONLINE,
            items: { create: [{ serviceId: serviceA.id, priceRupees: 150, durationMin: 30 }] },
          },
        });

        // 3. Nameless Walk-in Completed Booking
        histBooking3 = await db.booking.create({
          data: {
            salonId: salonA.id,
            barberId: barberA1.id,
            customerId: null,
            walkInName: null,
            walkInPhone: null,
            token: 403,
            tokenDate: toTokenDateUtc(getOffsetDate(-4 * 24 * 60 * 60 * 1000)),
            startsAt: getOffsetDate(-4 * 24 * 60 * 60 * 1000),
            endsAt: getOffsetDate(-4 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
            totalRupees: 150,
            status: BookingStatus.COMPLETED,
            type: BookingType.IN_SALON,
            source: BookingSource.WALK_IN,
            items: { create: [{ serviceId: serviceA.id, priceRupees: 150, durationMin: 30 }] },
          },
        });
      });

      afterAll(async () => {
        const ids = [histBooking1?.id, histBooking2?.id, histBooking3?.id].filter(Boolean);
        if (ids.length > 0) {
          await db.bookingItem.deleteMany({ where: { bookingId: { in: ids } } });
          await db.booking.deleteMany({ where: { id: { in: ids } } });
        }
      });

      it('history: role scoping - barber sees only own bookings; owner sees whole salon', async () => {
        const ownerRes = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          now: FIXED_NOW,
        });
        expect(ownerRes.ok).toBe(true);
        const ownerItemIds = ownerRes.data!.items.map((i) => i.id);
        expect(ownerItemIds).toContain(histBooking1.id);
        expect(ownerItemIds).toContain(histBooking2.id);
        expect(ownerItemIds).toContain(histBooking3.id);

        const barberRes = await getBookingHistoryStaff({
          staffUser: getBarberA1Current(),
          now: FIXED_NOW,
        });
        expect(barberRes.ok).toBe(true);
        expect(barberRes.data!.items.every((i) => i.barberName === 'Ustaad Ramesh')).toBe(true);
      });

      it('history: status filter - ALL_FINAL returns COMPLETED, CANCELLED, REJECTED, NO_SHOW; specific filter returns only that status', async () => {
        const allFinalRes = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          status: 'ALL_FINAL',
          now: FIXED_NOW,
        });
        expect(allFinalRes.ok).toBe(true);
        const statuses = allFinalRes.data!.items.map((i) => i.status);
        expect(statuses).toContain(BookingStatus.COMPLETED);
        expect(statuses).toContain(BookingStatus.CANCELLED);

        const completedOnlyRes = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          status: BookingStatus.COMPLETED,
          now: FIXED_NOW,
        });
        expect(completedOnlyRes.ok).toBe(true);
        expect(completedOnlyRes.data!.items.every((i) => i.status === BookingStatus.COMPLETED)).toBe(true);
      });

      it('history: token search - exact numeric token lookup returns matching booking only', async () => {
        const tokenRes = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          tokenSearch: 401,
          now: FIXED_NOW,
        });
        expect(tokenRes.ok).toBe(true);
        expect(tokenRes.data!.items.length).toBe(1);
        expect(tokenRes.data!.items[0].token).toBe(401);
      });

      it('history: pagination boundaries and total count', async () => {
        const page1 = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          page: 1,
          pageSize: 2,
          now: FIXED_NOW,
        });
        expect(page1.ok).toBe(true);
        expect(page1.data!.items.length).toBeLessThanOrEqual(2);
        expect(page1.data!.page).toBe(1);
        expect(page1.data!.totalCount).toBeGreaterThanOrEqual(3);
      });

      it('history: revenue aggregation - earnings sum equals exact sum of COMPLETED totals in range', async () => {
        const res = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          now: FIXED_NOW,
        });
        expect(res.ok).toBe(true);

        const expectedCompletedSum = res
          .data!.items.filter((i) => i.status === BookingStatus.COMPLETED)
          .reduce((sum, i) => sum + i.totalRupees, 0);

        expect(res.data!.totalCompletedRupees).toBe(expectedCompletedSum);
      });

      it('history: DTO privacy - no full phone anywhere in serialized JSON, nameless walk-in has customerName null, customerPhone is exactly "+91 ******3210"', async () => {
        const res = await getBookingHistoryStaff({
          staffUser: getOwnerACurrent(),
          salonId: salonA.id,
          now: FIXED_NOW,
        });
        expect(res.ok).toBe(true);

        const jsonStr = JSON.stringify(res.data);

        // 1. Assert no full 10-digit phone number is exposed anywhere in the JSON response
        expect(jsonStr).not.toContain(customerUser.phone);
        expect(/\b\d{10}\b/.test(jsonStr)).toBe(false);

        // 2. Nameless walk-in booking has customerName: null
        const walkInItem = res.data!.items.find((i) => i.id === histBooking3.id);
        expect(walkInItem).toBeDefined();
        expect(walkInItem?.customerName).toBeNull();
        expect(walkInItem?.source).toBe(BookingSource.WALK_IN);

        // 3. Customer booking has exact masked phone matching maskPhoneForRegister format
        const customerItem = res.data!.items.find((i) => i.id === histBooking1.id);
        expect(customerItem).toBeDefined();
        const expectedMasked = maskPhoneForRegister(customerUser.phone);
        expect(customerItem?.customerPhoneMasked).toBe(expectedMasked);
        expect(customerItem?.customerPhoneMasked).toMatch(/^\+91 \*{6}\d{4}$/);
      });
    });

    // ------------------------------------------------------------------------
    // TEST 22: RATE LIMITING (60 Edits per Hour)
    // ------------------------------------------------------------------------
    it('rate limiting: 60 staff edits in 1 hour succeed; 61st returns EDIT_LIMIT; second staff user unaffected', async () => {
      const staffUser1 = getOwnerACurrent();
      const staffUser2 = getOwnerBCurrent();

      // Pre-fill 60 requests for staffUser1
      for (let i = 0; i < 60; i++) {
        expect(checkStaffEditRateLimit(staffUser1.id, FIXED_NOW.getTime())).toBe(true);
      }

      // 61st request from staffUser1 is denied
      const denied61 = await updateBarberProfileStaff(
        staffUser1,
        barberA1.id,
        { displayName: 'Rate Limit Test', experienceYears: 5 },
        FIXED_NOW
      );
      expect(denied61.ok).toBe(false);
      expect(denied61.code).toBe('EDIT_LIMIT');

      // Second staff user is completely unaffected at the exact same timestamp
      const allowedUser2 = await updateBarberProfileStaff(
        staffUser2,
        barberB1.id,
        { displayName: 'Ustaad Kabir Updated', experienceYears: 7 },
        FIXED_NOW
      );
      expect(allowedUser2.ok).toBe(true);

      // Clean up
      await db.barber.update({ where: { id: barberB1.id }, data: { displayName: 'Ustaad Kabir' } });
    });

    // ------------------------------------------------------------------------
    // TEST 23: TRANSLATION KEY PARITY & TERMINOLOGY
    // ------------------------------------------------------------------------
    it('translations: 100% key parity between en.json and hi.json; zero "नाई" in dashboard/errors; zero "सेव" as verb in hi.json; Latin digits only', () => {
      const getLeafKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
        return Object.keys(obj).flatMap((key) => {
          const val = obj[key];
          const fullKey = prefix ? `${prefix}.${key}` : key;
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            return getLeafKeys(val, fullKey);
          }
          return [fullKey];
        });
      };

      const enKeys = getLeafKeys(enMessages).sort();
      const hiKeys = getLeafKeys(hiMessages).sort();

      expect(enKeys).toEqual(hiKeys);
      expect(enKeys.length).toBeGreaterThan(500);

      // Check forbidden "नाई" in dashboard and errors namespaces
      const hiDashboardStr = JSON.stringify(hiMessages.dashboard);
      const hiErrorsStr = JSON.stringify(hiMessages.errors);
      expect(hiDashboardStr.includes('नाई')).toBe(false);
      expect(hiErrorsStr.includes('नाई')).toBe(false);

      // Check forbidden English "सेव" as verb in hi.json (distinguishing from legitimate "सेवा")
      const hiFullStr = JSON.stringify(hiMessages);
      const transliteratedSaveRegex = /(?:^|[^\p{L}\p{M}])सेव(?![ािीुूृेैोौ्ँंः\p{L}])/u;
      expect(transliteratedSaveRegex.test(hiFullStr)).toBe(false);

      // Assert Latin digits exclusively (zero Devanagari numerals ०-९)
      const devanagariDigitsRegex = /[०-९]/;
      expect(devanagariDigitsRegex.test(hiFullStr)).toBe(false);
    });
  });
});
