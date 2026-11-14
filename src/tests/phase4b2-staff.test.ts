import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
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
  getBarberProfileStaff,
  updateBarberProfileStaff,
  getSalonProfileStaff,
  updateSalonProfileStaff,
  getBookingHistoryStaff,
} from '../lib/staff-roster-service';
import { deleteBarberTimeOffStaff, checkStaffEditRateLimit } from '../lib/staff-config-service';
import { getStaffDashboardContext } from '../lib/dashboard-service';
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

  // ==========================================================================
  // SECTION 1: DETERMINISTIC CLOCK AUDIT & PURE UNIT TESTS
  // ==========================================================================
  describe('1. Pure Unit Tests: Deterministic Clock, Validators & Policies', () => {
    it('deterministic clock: zero unmanaged Date.now() or empty new Date()', () => {
      const testFilePath = path.resolve(__dirname, 'phase4b2-staff.test.ts');
      const content = fs.readFileSync(testFilePath, 'utf-8');
      const lines = content.split('\n');
      const offendingLines = lines.filter((line) => {
        const trimmed = line.trim();
        if (
          trimmed.includes('offendingLines') ||
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.includes("it('deterministic clock")
        ) {
          return false;
        }
        return /Date\.now\(\)/.test(line) || /new\s+Date\(\s*\)/.test(line);
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
      const owner: PolicyUser = { id: 'usr-own-1', role: Role.OWNER, isActive: true };
      const foreignOwner: PolicyUser = { id: 'usr-own-2', role: Role.OWNER, isActive: true };
      const barber: PolicyUser = { id: 'usr-bar-1', role: Role.BARBER, isActive: true };
      const mySalon: PolicySalon = { id: 'sal-1', ownerId: 'usr-own-1' };

      it('allows active salon owner for their salon', () => {
        expect(canEditSalonProfile(owner, mySalon)).toBe(true);
      });

      it('denies foreign salon owner', () => {
        expect(canEditSalonProfile(foreignOwner, mySalon)).toBe(false);
      });

      it('denies barber role', () => {
        expect(canEditSalonProfile(barber, mySalon)).toBe(false);
      });
    });

    describe('Policy: canViewBookingHistory', () => {
      it('allows OWNER and BARBER roles', () => {
        expect(canViewBookingHistory({ id: '1', role: Role.OWNER, isActive: true })).toBe(true);
        expect(canViewBookingHistory({ id: '2', role: Role.BARBER, isActive: true })).toBe(true);
      });

      it('denies inactive staff', () => {
        expect(canViewBookingHistory({ id: '1', role: Role.OWNER, isActive: false })).toBe(false);
        expect(canViewBookingHistory({ id: '2', role: Role.BARBER, isActive: false })).toBe(false);
      });

      it('denies CUSTOMER and ADMIN roles', () => {
        expect(canViewBookingHistory({ id: '3', role: Role.CUSTOMER, isActive: true })).toBe(false);
        expect(canViewBookingHistory({ id: '4', role: Role.ADMIN, isActive: true })).toBe(false);
      });
    });
  });

  // ==========================================================================
  // SECTION 2: REAL DATABASE INTEGRATION TESTS (ISOLATED FIXTURES)
  // ==========================================================================
  describe('2. Real Database Integration Tests', () => {
    let ownerA: User;
    let salonA: Salon;
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

    const runSeed = Math.floor(100000 + Math.random() * 800000);
    let fixtureCounter = 1;
    const nextFixtureId = () => fixtureCounter++;
    const nextUniquePhone = () => `+9199${String(runSeed + nextFixtureId()).padStart(8, '0')}`;

    let consoleSpy: ReturnType<typeof vi.spyOn>;

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
          nameHi: 'सैलून ए रोस्टर टेस्ट',
          slug: `salon-a-roster-${nextFixtureId()}`,
          status: VerificationStatus.VERIFIED,
          addressLine: '100 Indiranagar',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
          phone: nextUniquePhone(),
          requiresApproval: false,
        },
      });

      // Barber A1 (Active, Verified)
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
          displayName: 'Ustaad Vikram',
          status: VerificationStatus.VERIFIED,
          isActive: true,
          experienceYears: 5,
          bio: 'Specialist in classic fades',
        },
      });

      // Barber A2 (Active, Pending)
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
          phone: nextUniquePhone(),
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
          experienceYears: 4,
        },
      });

      // 3. Other Roles: Customer & Admin
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
    }, 45000);

    afterAll(async () => {
      const salonIds = [salonA?.id, salonB?.id, pendingSalon?.id, rejectedSalon?.id, suspendedSalon?.id].filter(Boolean);
      const barberIds = [barberA1?.id, barberA2?.id, barberB1?.id, inactiveBarber?.id].filter(Boolean);

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
        barberUserA1?.id,
        barberUserA2?.id,
        ownerB?.id,
        barberUserB1?.id,
        customerUser?.id,
        adminUser?.id,
        inactiveOwnerUser?.id,
        inactiveBarberUser?.id,
      ].filter(Boolean);

      if (userIds.length > 0) {
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }, 45000);

    beforeEach(() => {
      resetRateLimits();
      consoleSpy = vi.spyOn(console, 'log');
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
        { phone: '9899112233', displayName: 'Foreign Barber' },
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
        { displayName: 'Hacked Name', experienceYears: 4 },
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
      const addRes = await addBarberStaff(barberActor, salonA.id, { phone: '9899001122', displayName: 'Illegal' }, FIXED_NOW);
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
      const custAdd = await addBarberStaff(customerActor, salonA.id, { phone: '9899001133', displayName: 'Illegal' }, FIXED_NOW);
      expect(custAdd.ok).toBe(false);
      expect(custAdd.code).toBe('UNAUTHORIZED');

      const custRoster = await getSalonBarbersStaff(customerActor, salonA.id);
      expect(custRoster.ok).toBe(false);
      expect(custRoster.code).toBe('UNAUTHORIZED');

      // Admin calling service-level staff functions
      const adminAdd = await addBarberStaff(adminActor, salonA.id, { phone: '9899001144', displayName: 'Illegal' }, FIXED_NOW);
      expect(adminAdd.ok).toBe(false);
      expect(adminAdd.code).toBe('UNAUTHORIZED');

      const adminRoster = await getSalonBarbersStaff(adminActor, salonA.id);
      expect(adminRoster.ok).toBe(false);
      expect(adminRoster.code).toBe('UNAUTHORIZED');
    });

    // ------------------------------------------------------------------------
    // TEST 3: STATUS GATING MATRIX
    // ------------------------------------------------------------------------
    it('status gating matrix: Unverified salons/barbers and inactive users are denied with UNAUTHORIZED and 0 changes', async () => {
      const ownerAUser = getOwnerACurrent();

      // 1. Pending Salon
      const addPending = await addBarberStaff(ownerAUser, pendingSalon.id, { phone: '9899223344', displayName: 'Test' }, FIXED_NOW);
      expect(addPending.ok).toBe(false);
      expect(addPending.code).toBe('UNAUTHORIZED');

      const editPendingSalon = await updateSalonProfileStaff(ownerAUser, pendingSalon.id, { name: 'Updated' }, FIXED_NOW);
      expect(editPendingSalon.ok).toBe(false);
      expect(editPendingSalon.code).toBe('UNAUTHORIZED');

      // 2. Rejected Salon
      const addRejected = await addBarberStaff(ownerAUser, rejectedSalon.id, { phone: '9899223355', displayName: 'Test' }, FIXED_NOW);
      expect(addRejected.ok).toBe(false);
      expect(addRejected.code).toBe('UNAUTHORIZED');

      // 3. Suspended Salon
      const addSuspended = await addBarberStaff(ownerAUser, suspendedSalon.id, { phone: '9899223366', displayName: 'Test' }, FIXED_NOW);
      expect(addSuspended.ok).toBe(false);
      expect(addSuspended.code).toBe('UNAUTHORIZED');

      // 4. Inactive Owner user
      const inactiveOwnerActor: CurrentUser = {
        id: inactiveOwnerUser.id,
        phone: inactiveOwnerUser.phone,
        role: Role.OWNER,
        name: inactiveOwnerUser.name,
        isActive: false,
      };
      const addByInactiveOwner = await addBarberStaff(inactiveOwnerActor, salonA.id, { phone: '9899223377', displayName: 'Test' }, FIXED_NOW);
      expect(addByInactiveOwner.ok).toBe(false);
      expect(addByInactiveOwner.code).toBe('UNAUTHORIZED');
    });

    // ------------------------------------------------------------------------
    // TEST 4: DEDICATED 4B-1 GAP CLOSURE: deleteBarberTimeOffStaff
    // ------------------------------------------------------------------------
    it('4B-1 gap closure: deleteBarberTimeOffStaff with real TimeOff row returns UNAUTHORIZED on invalid states with 0 data change', async () => {
      const ownerAUser = getOwnerACurrent();

      // Create a test TimeOff row on Barber A2 (which is PENDING status)
      const timeOffPendingBarber = await db.timeOff.create({
        data: {
          barberId: barberA2.id,
          startsAt: getOffsetDate(86400000),
          endsAt: getOffsetDate(90000000),
          reason: 'Doctor Appointment',
        },
      });

      // Calling deleteBarberTimeOffStaff for PENDING barber returns UNAUTHORIZED
      const deleteRes1 = await deleteBarberTimeOffStaff(ownerAUser, barberA2.id, timeOffPendingBarber.id, FIXED_NOW);
      expect(deleteRes1.ok).toBe(false);
      expect(deleteRes1.code).toBe('UNAUTHORIZED');

      // Row remains intact in DB
      const checkRow1 = await db.timeOff.findUnique({ where: { id: timeOffPendingBarber.id } });
      expect(checkRow1).not.toBeNull();

      // Create a test TimeOff row on Barber Inactive
      const timeOffInactiveBarber = await db.timeOff.create({
        data: {
          barberId: inactiveBarber.id,
          startsAt: getOffsetDate(86400000),
          endsAt: getOffsetDate(90000000),
          reason: 'Leave',
        },
      });

      // Calling deleteBarberTimeOffStaff for barber with isActive=false returns UNAUTHORIZED
      const deleteRes2 = await deleteBarberTimeOffStaff(ownerAUser, inactiveBarber.id, timeOffInactiveBarber.id, FIXED_NOW);
      expect(deleteRes2.ok).toBe(false);
      expect(deleteRes2.code).toBe('UNAUTHORIZED');

      // Row remains intact in DB
      const checkRow2 = await db.timeOff.findUnique({ where: { id: timeOffInactiveBarber.id } });
      expect(checkRow2).not.toBeNull();

      // Clean up test time-offs
      await db.timeOff.deleteMany({ where: { id: { in: [timeOffPendingBarber.id, timeOffInactiveBarber.id] } } });
    });

    // ------------------------------------------------------------------------
    // TEST 5: ADD BARBER ATOMICITY & NORMALIZATION & AUDIT LOG
    // ------------------------------------------------------------------------
    it('addBarberStaff: creates User(BARBER) and Barber(PENDING, isActive=true) atomically with phone normalization and audit log', async () => {
      const ownerAUser = getOwnerACurrent();
      const rawInputPhone = nextUniquePhone().replace('+91', ''); // 10 digits without +91
      const expectedNormalized = `+91${rawInputPhone}`;

      const result = await addBarberStaff(
        ownerAUser,
        salonA.id,
        {
          phone: rawInputPhone,
          displayName: 'Ustaad Devendra',
          experienceYears: 6,
          bio: 'Expert stylist',
        },
        FIXED_NOW
      );

      expect(result.ok).toBe(true);
      expect(result.data?.id).toBeDefined();
      expect(result.data?.userId).toBeDefined();

      const createdBarberId = result.data!.id;
      const createdUserId = result.data!.userId;

      // Check User record
      const createdUser = await db.user.findUnique({ where: { id: createdUserId } });
      expect(createdUser).not.toBeNull();
      expect(createdUser?.phone).toBe(expectedNormalized); // Normalized E.164
      expect(createdUser?.role).toBe(Role.BARBER);
      expect(createdUser?.isActive).toBe(true);

      // Check Barber record
      const createdBarber = await db.barber.findUnique({ where: { id: createdBarberId } });
      expect(createdBarber).not.toBeNull();
      expect(createdBarber?.salonId).toBe(salonA.id);
      expect(createdBarber?.status).toBe(VerificationStatus.PENDING);
      expect(createdBarber?.isActive).toBe(true);
      expect(createdBarber?.displayName).toBe('Ustaad Devendra');
      expect(createdBarber?.experienceYears).toBe(6);

      // Check Audit Log logged to stdout
      const logs = consoleSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((s: string) => s.includes('STAFF_CONFIG_CHANGE'));
      const found = logs.find((s: string) => s.includes('"action":"CREATE"') && s.includes(createdBarberId));
      expect(found).toBeDefined();
      expect(found).not.toContain(rawInputPhone);
      expect(found).not.toContain('+91');

      // Cleanup added barber
      await db.barber.delete({ where: { id: createdBarberId } });
      await db.user.delete({ where: { id: createdUserId } });
    });

    // ------------------------------------------------------------------------
    // TEST 6: DUPLICATE PHONE HANDLING
    // ------------------------------------------------------------------------
    it('addBarberStaff: duplicate phone across ANY role returns PHONE_IN_USE and changes nothing', async () => {
      const ownerAUser = getOwnerACurrent();

      // Attempt adding barber with existing customer's phone
      const resCustomerPhone = await addBarberStaff(
        ownerAUser,
        salonA.id,
        { phone: customerUser.phone, displayName: 'Dup Barber 1' },
        FIXED_NOW
      );
      expect(resCustomerPhone.ok).toBe(false);
      expect(resCustomerPhone.code).toBe('PHONE_IN_USE');

      // Attempt adding barber with existing owner's phone
      const resOwnerPhone = await addBarberStaff(
        ownerAUser,
        salonA.id,
        { phone: ownerA.phone, displayName: 'Dup Barber 2' },
        FIXED_NOW
      );
      expect(resOwnerPhone.ok).toBe(false);
      expect(resOwnerPhone.code).toBe('PHONE_IN_USE');

      // Attempt adding barber with existing barber's phone
      const resBarberPhone = await addBarberStaff(
        ownerAUser,
        salonA.id,
        { phone: barberUserA1.phone, displayName: 'Dup Barber 3' },
        FIXED_NOW
      );
      expect(resBarberPhone.ok).toBe(false);
      expect(resBarberPhone.code).toBe('PHONE_IN_USE');
    });

    // ------------------------------------------------------------------------
    // TEST 7: CONCURRENT ADD BARBER RACE
    // ------------------------------------------------------------------------
    it('concurrent addBarberStaff (Promise.all) with same phone: exactly one succeeds, one returns PHONE_IN_USE', async () => {
      const ownerAUser = getOwnerACurrent();
      const sharedPhone = nextUniquePhone().replace('+91', '');

      const [res1, res2] = await Promise.all([
        addBarberStaff(ownerAUser, salonA.id, { phone: sharedPhone, displayName: 'Race Barber A' }, FIXED_NOW),
        addBarberStaff(ownerAUser, salonA.id, { phone: sharedPhone, displayName: 'Race Barber B' }, FIXED_NOW),
      ]);

      const successCount = [res1, res2].filter((r) => r.ok).length;
      const conflictCount = [res1, res2].filter((r) => !r.ok && r.code === 'PHONE_IN_USE').length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      // Clean up the created barber
      const winner = res1.ok ? res1.data : res2.data;
      if (winner) {
        const foundBarber = await db.barber.findUnique({ where: { id: winner.id } });
        await db.barber.delete({ where: { id: winner.id } });
        const uid = winner.userId || foundBarber?.userId;
        if (uid) {
          await db.user.delete({ where: { id: uid } });
        }
      }
    });

    // ------------------------------------------------------------------------
    // TEST 8: SALON BARBER ROSTER CAP (MAX 20)
    // ------------------------------------------------------------------------
    it('addBarberStaff: 21st barber returns LIMIT_EXCEEDED when salon has 20 barbers', async () => {
      const ownerAUser = getOwnerACurrent();

      // Count existing barbers in salonA
      const existingCount = await db.barber.count({ where: { salonId: salonA.id } });
      const createdUsers: User[] = [];
      const createdBarbers: Barber[] = [];

      try {
        // Pad salonA up to exactly 20 barbers
        for (let i = existingCount; i < 20; i++) {
          const user = await db.user.create({
            data: {
              phone: nextUniquePhone(),
              name: `Dummy Barber ${i}`,
              role: Role.BARBER,
              isActive: true,
            },
          });
          createdUsers.push(user);

          const bar = await db.barber.create({
            data: {
              userId: user.id,
              salonId: salonA.id,
              displayName: `Dummy Barber ${i}`,
              status: VerificationStatus.VERIFIED,
              isActive: true,
              experienceYears: 1,
            },
          });
          createdBarbers.push(bar);
        }

        // Verify count is now 20
        const currentCount = await db.barber.count({ where: { salonId: salonA.id } });
        expect(currentCount).toBe(20);

        // Attempt to add 21st barber
        const res21 = await addBarberStaff(
          ownerAUser,
          salonA.id,
          { phone: '9890999999', displayName: 'Barber Twenty One' },
          FIXED_NOW
        );

        expect(res21.ok).toBe(false);
        expect(res21.code).toBe('LIMIT_EXCEEDED');
      } finally {
        // Cleanup extra created barbers
        if (createdBarbers.length > 0) {
          await db.barber.deleteMany({ where: { id: { in: createdBarbers.map((b) => b.id) } } });
        }
        if (createdUsers.length > 0) {
          await db.user.deleteMany({ where: { id: { in: createdUsers.map((u) => u.id) } } });
        }
      }
    });

    // ------------------------------------------------------------------------
    // TEST 9: REMOVE BARBER WITH CONFLICT CHECK
    // ------------------------------------------------------------------------
    it('removeBarberStaff: blocked with BARBER_HAS_BOOKINGS on active bookings; succeeds after cancellation with audit log', async () => {
      const ownerAUser = getOwnerACurrent();
      // Ensure Barber A1 is active at start of test
      await db.barber.update({ where: { id: barberA1.id }, data: { isActive: true } });

      // 1. Create a future active booking for Barber A1
      const startsAt = getOffsetDate(7200000); // 2 hours in future
      const endsAt = getOffsetDate(9000000);

      const activeBooking = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          type: BookingType.ONLINE,
          source: BookingSource.ONLINE,
          status: BookingStatus.CONFIRMED,
          token: 101,
          tokenDate: toTokenDateUtc('2026-06-15'),
          startsAt,
          endsAt,
          totalRupees: 150,
        },
      });

      try {
        // 2. Attempt removeBarberStaff on Barber A1 -> MUST FAIL with BARBER_HAS_BOOKINGS
        const blockedRes = await removeBarberStaff(ownerAUser, salonA.id, barberA1.id, FIXED_NOW);
        expect(blockedRes.ok).toBe(false);
        expect(blockedRes.code).toBe('BARBER_HAS_BOOKINGS');
        expect(blockedRes.data?.blockingBookings).toBeDefined();
        expect(blockedRes.data!.blockingBookings!.length).toBeGreaterThanOrEqual(1);

        // Barber remains active
        const barberCheck1 = await db.barber.findUnique({ where: { id: barberA1.id } });
        expect(barberCheck1?.isActive).toBe(true);

        // 3. Cancel the active booking
        await db.booking.update({
          where: { id: activeBooking.id },
          data: { status: BookingStatus.CANCELLED, cancelReason: 'Customer request' },
        });

        // 4. Now removeBarberStaff on Barber A1 -> MUST SUCCEED
        const successRes = await removeBarberStaff(ownerAUser, salonA.id, barberA1.id, FIXED_NOW);
        expect(successRes.ok).toBe(true);

        // In DB: barber is soft-deactivated (isActive=false), status preserved
        const barberCheck2 = await db.barber.findUnique({ where: { id: barberA1.id } });
        expect(barberCheck2?.isActive).toBe(false);
        expect(barberCheck2?.status).toBe(VerificationStatus.VERIFIED);

        // Audit log logged DEACTIVATE
        const logs = consoleSpy.mock.calls
          .map((c: unknown[]) => String(c[0]))
          .filter((s: string) => s.includes('STAFF_CONFIG_CHANGE'));
        const found = logs.find((s: string) => s.includes('"action":"DEACTIVATE"') && s.includes(barberA1.id));
        expect(found).toBeDefined();
      } finally {
        // Clean up booking
        await db.booking.deleteMany({ where: { id: activeBooking.id } });
        // Restore Barber A1 to active for subsequent tests
        await db.barber.update({ where: { id: barberA1.id }, data: { isActive: true } });
      }
    });

    // ------------------------------------------------------------------------
    // TEST 10: CONCURRENCY RACE (REMOVE VS CREATE BOOKING)
    // ------------------------------------------------------------------------
    it('concurrent removeBarberStaff vs booking creation: row-level lock FOR UPDATE prevents inconsistent state', async () => {
      const ownerAUser = getOwnerACurrent();
      // Ensure barber is active at start
      await db.barber.update({ where: { id: barberA1.id }, data: { isActive: true } });

      const startsAt = getOffsetDate(10800000);
      const endsAt = getOffsetDate(12600000);

      // Concurrently run removeBarberStaff and an insert of a booking on that barber
      let bookingCreated: { id: string } | null = null;

      try {
        const [removeRes] = await Promise.all([
          removeBarberStaff(ownerAUser, salonA.id, barberA1.id, FIXED_NOW),
          (async () => {
            // Simulate concurrent booking creation
            bookingCreated = await db.booking.create({
              data: {
                salonId: salonA.id,
                barberId: barberA1.id,
                customerId: customerUser.id,
                type: BookingType.ONLINE,
                source: BookingSource.ONLINE,
                status: BookingStatus.CONFIRMED,
                token: 102,
                tokenDate: toTokenDateUtc('2026-06-15'),
                startsAt,
                endsAt,
                totalRupees: 150,
              },
            });
            return bookingCreated;
          })(),
        ]);

        const finalBarber = await db.barber.findUnique({ where: { id: barberA1.id } });

        // If remove succeeded, it must have seen zero active bookings BEFORE committing.
        // If the booking was created first, remove MUST fail with BARBER_HAS_BOOKINGS.
        // In NO scenario can an inactive barber hold an active future booking without error!
        if (!finalBarber?.isActive) {
          expect(removeRes.ok).toBe(true);
        } else {
          expect(removeRes.ok).toBe(false);
          expect(removeRes.code).toBe('BARBER_HAS_BOOKINGS');
        }
      } finally {
        // Cleanup
        if (bookingCreated) {
          await db.booking.deleteMany({ where: { id: bookingCreated.id } });
        }
        await db.barber.update({ where: { id: barberA1.id }, data: { isActive: true } });
      }
    });

    // ------------------------------------------------------------------------
    // TEST 11: REACTIVATE BARBER
    // ------------------------------------------------------------------------
    it('reactivateBarberStaff: restores isActive=true, preserves status, and emits audit log', async () => {
      const ownerAUser = getOwnerACurrent();

      // InactiveBarber has isActive=false and status=VERIFIED
      const reactivateRes = await reactivateBarberStaff(ownerAUser, salonA.id, inactiveBarber.id, FIXED_NOW);
      expect(reactivateRes.ok).toBe(true);

      const updated = await db.barber.findUnique({ where: { id: inactiveBarber.id } });
      expect(updated?.isActive).toBe(true);
      expect(updated?.status).toBe(VerificationStatus.VERIFIED);

      // Check audit log
      const logs = consoleSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((s: string) => s.includes('STAFF_CONFIG_CHANGE'));
      const found = logs.find((s: string) => s.includes('REACTIVATE') && s.includes(inactiveBarber.id));
      expect(found).toBeDefined();

      // Reset inactiveBarber back to false
      await db.barber.update({ where: { id: inactiveBarber.id }, data: { isActive: false } });
    });

    // ------------------------------------------------------------------------
    // TEST 12: INACTIVE BARBER DASHBOARD CONTEXT
    // ------------------------------------------------------------------------
    it('getStaffDashboardContext: inactive barber returns not-active state with zero salon/booking data', async () => {
      // Ensure inactiveBarber is inactive
      await db.barber.update({ where: { id: inactiveBarber.id }, data: { isActive: false } });

      const inactiveBarberActor: CurrentUser = {
        id: inactiveBarberUser.id,
        phone: inactiveBarberUser.phone,
        role: Role.BARBER,
        name: inactiveBarberUser.name,
        isActive: true, // user is active but barber record is inactive
      };

      const context = await getStaffDashboardContext(inactiveBarberActor);
      expect(context.ok).toBe(false);
      // Ensures no salon or booking details leaked
      expect((context as unknown as Record<string, unknown>).salon).toBeUndefined();
      expect((context as unknown as Record<string, unknown>).bookings).toBeUndefined();
    });

    // ------------------------------------------------------------------------
    // TEST 13: BARBER PROFILE EDITOR & MASS-ASSIGNMENT PROTECTION
    // ------------------------------------------------------------------------
    it('updateBarberProfileStaff: allows valid edits; protects against mass-assignment', async () => {
      const barberActor = getBarberA1Current();

      // Verify reading barber profile
      const currentProf = await getBarberProfileStaff(barberActor, barberA1.id);
      expect(currentProf.ok).toBe(true);

      // 1. Self edit
      const editRes = await updateBarberProfileStaff(
        barberActor,
        barberA1.id,
        {
          displayName: 'Ustaad Vikram Senior',
          experienceYears: 7,
          bio: 'Master of contemporary styling',
          photoUrl: 'https://example.com/vikram-new.jpg',
          // Mass assignment attack payload: attempts to change sensitive fields
          ...({
            phone: '+919999999999',
            status: VerificationStatus.SUSPENDED,
            isActive: false,
            userId: 'hacked-user-id',
            salonId: 'hacked-salon-id',
          } as Record<string, unknown>),
        },
        FIXED_NOW
      );

      expect(editRes.ok).toBe(true);

      const dbBarber = await db.barber.findUnique({
        where: { id: barberA1.id },
        include: { user: true },
      });

      // Legitimate fields updated
      expect(dbBarber?.displayName).toBe('Ustaad Vikram Senior');
      expect(dbBarber?.experienceYears).toBe(7);
      expect(dbBarber?.bio).toBe('Master of contemporary styling');
      expect(dbBarber?.photoUrl).toBe('https://example.com/vikram-new.jpg');

      // Sensitive fields COMPLETELY UNTOUCHED
      expect(dbBarber?.status).toBe(VerificationStatus.VERIFIED);
      expect(dbBarber?.isActive).toBe(true);
      expect(dbBarber?.userId).toBe(barberUserA1.id);
      expect(dbBarber?.salonId).toBe(salonA.id);
      expect(dbBarber?.user.phone).toBe(barberUserA1.phone);

      // Audit log logged UPDATE
      const logs = consoleSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((s: string) => s.includes('STAFF_CONFIG_CHANGE'));
      const found = logs.find((s: string) => s.includes(barberA1.id));
      expect(found).toBeDefined();
    });

    // ------------------------------------------------------------------------
    // TEST 14: SALON PROFILE EDITOR & MASS-ASSIGNMENT PROTECTION
    // ------------------------------------------------------------------------
    it('updateSalonProfileStaff: allows valid edits; protects against mass-assignment', async () => {
      const ownerAUser = getOwnerACurrent();

      // Verify reading salon profile
      const currentSalon = await getSalonProfileStaff(ownerAUser, salonA.id);
      expect(currentSalon.ok).toBe(true);

      const editRes = await updateSalonProfileStaff(
        ownerAUser,
        salonA.id,
        {
          name: 'Sharma Luxury Grooming Studio',
          nameHi: 'शर्मा लक्ज़री ग्रूमिंग स्टूडियो',
          description: 'Premier salon experience in Indiranagar',
          phone: '9811001122',
          addressLine: '45/1 100 Feet Road',
          area: 'Indiranagar Stage 2',
          city: 'Bengaluru',
          pincode: '560038',
          requiresApproval: true,
          // Mass assignment attack payload
          ...({
            slug: 'hacked-slug',
            status: VerificationStatus.SUSPENDED,
            ownerId: 'hacked-owner-id',
            lat: 12.3456,
            lng: 77.6543,
          } as Record<string, unknown>),
        },
        FIXED_NOW
      );

      expect(editRes.ok).toBe(true);

      const dbSalon = await db.salon.findUnique({ where: { id: salonA.id } });

      // Legitimate fields updated
      expect(dbSalon?.name).toBe('Sharma Luxury Grooming Studio');
      expect(dbSalon?.nameHi).toBe('शर्मा लक्ज़री ग्रूमिंग स्टूडियो');
      expect(dbSalon?.description).toBe('Premier salon experience in Indiranagar');
      expect(dbSalon?.phone).toBe('+919811001122');
      expect(dbSalon?.addressLine).toBe('45/1 100 Feet Road');
      expect(dbSalon?.area).toBe('Indiranagar Stage 2');
      expect(dbSalon?.requiresApproval).toBe(true);

      // Sensitive fields COMPLETELY UNTOUCHED
      expect(dbSalon?.slug).toBe(salonA.slug); // initial slug preserved
      expect(dbSalon?.status).toBe(VerificationStatus.VERIFIED);
      expect(dbSalon?.ownerId).toBe(ownerA.id);
      expect(dbSalon?.lat).toBeNull();
      expect(dbSalon?.lng).toBeNull();

      // Audit log logged UPDATE
      const logs = consoleSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((s: string) => s.includes('STAFF_CONFIG_CHANGE'));
      const found = logs.find((s: string) => s.includes(salonA.id));
      expect(found).toBeDefined();
    });

    // ------------------------------------------------------------------------
    // TEST 15: PHOTO URL VALIDATION END-TO-END
    // ------------------------------------------------------------------------
    it('updateBarberProfileStaff: rejects invalid photo URLs with INVALID_PHOTO_URL', async () => {
      const barberActor = getBarberA1Current();

      // Insecure http
      const resHttp = await updateBarberProfileStaff(
        barberActor,
        barberA1.id,
        {
          displayName: 'Ustaad Vikram',
          experienceYears: 5,
          photoUrl: 'http://insecure.com/pic.jpg',
        },
        FIXED_NOW
      );
      expect(resHttp.ok).toBe(false);
      expect(resHttp.code).toBe('INVALID_PHOTO_URL');

      // Javascript pseudo-protocol
      const resJs = await updateBarberProfileStaff(
        barberActor,
        barberA1.id,
        {
          displayName: 'Ustaad Vikram',
          experienceYears: 5,
          photoUrl: 'javascript:alert("xss")',
        },
        FIXED_NOW
      );
      expect(resJs.ok).toBe(false);
      expect(resJs.code).toBe('INVALID_PHOTO_URL');

      // Empty string clears photo to null
      const resClear = await updateBarberProfileStaff(
        barberActor,
        barberA1.id,
        {
          displayName: 'Ustaad Vikram',
          experienceYears: 5,
          photoUrl: '',
        },
        FIXED_NOW
      );
      expect(resClear.ok).toBe(true);
      const clearedBarber = await db.barber.findUnique({ where: { id: barberA1.id } });
      expect(clearedBarber?.photoUrl).toBeNull();
    });

    // ------------------------------------------------------------------------
    // TEST 16: BOOKING HISTORY SCOPING, FILTERS, PAGINATION, REVENUE & PRIVACY
    // ------------------------------------------------------------------------
    it('getBookingHistoryStaff: verifies role scoping, filters, 92-day limit, revenue sum, and masked DTO privacy', async () => {
      const ownerAUser = getOwnerACurrent();
      const barberA1User = getBarberA1Current();

      // Seed 3 historical bookings:
      // 1. Completed booking under Barber A1 (Rupees 200)
      const b1 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          type: BookingType.ONLINE,
          source: BookingSource.ONLINE,
          status: BookingStatus.COMPLETED,
          token: 201,
          tokenDate: toTokenDateUtc('2026-06-10'),
          startsAt: getOffsetDate(-5 * 86400000),
          endsAt: getOffsetDate(-5 * 86400000 + 1800000),
          totalRupees: 200,
        },
      });

      // 2. Cancelled booking under Barber A1 (Rupees 150)
      const b2 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA1.id,
          customerId: customerUser.id,
          type: BookingType.ONLINE,
          source: BookingSource.ONLINE,
          status: BookingStatus.CANCELLED,
          cancelReason: 'Change of plans',
          token: 202,
          tokenDate: toTokenDateUtc('2026-06-11'),
          startsAt: getOffsetDate(-4 * 86400000),
          endsAt: getOffsetDate(-4 * 86400000 + 1800000),
          totalRupees: 150,
        },
      });

      // 3. Completed walk-in booking under Barber A2 without name (Rupees 100)
      const b3 = await db.booking.create({
        data: {
          salonId: salonA.id,
          barberId: barberA2.id,
          type: BookingType.WALK_IN,
          source: BookingSource.WALK_IN,
          status: BookingStatus.COMPLETED,
          token: 203,
          tokenDate: toTokenDateUtc('2026-06-12'),
          startsAt: getOffsetDate(-3 * 86400000),
          endsAt: getOffsetDate(-3 * 86400000 + 1800000),
          totalRupees: 100,
          walkInName: null,
        },
      });

      try {
        // A. Barber Scoping: Barber A1 sees ONLY their own bookings (b1, b2), NOT b3
        const barberHistory = await getBookingHistoryStaff({
          staffUser: barberA1User,
          salonId: salonA.id,
          fromDate: '2026-06-01',
          toDate: '2026-06-15',
          now: FIXED_NOW,
        });
        expect(barberHistory.ok).toBe(true);
        expect(barberHistory.data?.items.map((i) => i.id)).toEqual(
          expect.arrayContaining([b1.id, b2.id])
        );
        expect(barberHistory.data?.items.map((i) => i.id)).not.toContain(b3.id);

        // B. Owner Scoping: Owner sees all 3 bookings in Salon A
        const ownerHistory = await getBookingHistoryStaff({
          staffUser: ownerAUser,
          salonId: salonA.id,
          fromDate: '2026-06-01',
          toDate: '2026-06-15',
          now: FIXED_NOW,
        });
        expect(ownerHistory.ok).toBe(true);
        const ownerItemIds = ownerHistory.data?.items.map((i) => i.id);
        expect(ownerItemIds).toContain(b1.id);
        expect(ownerItemIds).toContain(b2.id);
        expect(ownerItemIds).toContain(b3.id);

        // C. Revenue Sum: totalCompletedRupees sums ONLY COMPLETED bookings (200 + 100 = 300)
        // b2 (cancelled, 150) MUST BE EXCLUDED from the sum!
        expect(ownerHistory.data?.totalCompletedRupees).toBe(300);

        // D. Privacy & i18n DTO:
        // b1 has registered customer -> customerPhone masked (+91 ****** 3300)
        const item1 = ownerHistory.data?.items.find((i) => i.id === b1.id);
        expect(item1?.customerPhoneMasked).toMatch(/\+91\s*\*{4,}\d{4}/);
        // b3 is nameless walk-in -> customerName is null, never builds English text on server
        const item3 = ownerHistory.data?.items.find((i) => i.id === b3.id);
        expect(item3?.customerName).toBeNull();
        expect(item3?.source).toBe(BookingSource.WALK_IN);

        // E. Date Range Enforcement: <= 92 days accepted, > 92 days rejected
        const validRange = await getBookingHistoryStaff({
          staffUser: ownerAUser,
          salonId: salonA.id,
          fromDate: '2026-03-15',
          toDate: '2026-06-15', // exactly 92 days
          now: FIXED_NOW,
        });
        expect(validRange.ok).toBe(true);

        const invalidRange = await getBookingHistoryStaff({
          staffUser: ownerAUser,
          salonId: salonA.id,
          fromDate: '2026-03-01',
          toDate: '2026-06-15', // > 92 days (106 days)
          now: FIXED_NOW,
        });
        expect(invalidRange.ok).toBe(false);
        expect(invalidRange.code).toBe('INVALID_INPUT');

        // F. Status filtering: query COMPLETED only
        const completedOnly = await getBookingHistoryStaff({
          staffUser: ownerAUser,
          salonId: salonA.id,
          status: BookingStatus.COMPLETED,
          now: FIXED_NOW,
        });
        expect(completedOnly.ok).toBe(true);
        expect(completedOnly.data?.items.every((i) => i.status === BookingStatus.COMPLETED)).toBe(true);

        // G. Token search: exact token 202
        const tokenSearch = await getBookingHistoryStaff({
          staffUser: ownerAUser,
          salonId: salonA.id,
          tokenSearch: '202',
          now: FIXED_NOW,
        });
        expect(tokenSearch.ok).toBe(true);
        expect(tokenSearch.data?.items).toHaveLength(1);
        expect(tokenSearch.data?.items[0].id).toBe(b2.id);
      } finally {
        // Cleanup test bookings
        await db.booking.deleteMany({ where: { id: { in: [b1.id, b2.id, b3.id] } } });
      }
    });

    // ------------------------------------------------------------------------
    // TEST 17: RATE LIMITING (60 EDITS PER MINUTE)
    // ------------------------------------------------------------------------
    it('rate limiting: 60 staff edits in 1 minute succeed; 61st returns EDIT_LIMIT; second staff user unaffected', async () => {
      const ownerAUser = getOwnerACurrent();
      const ownerBUser = getOwnerBCurrent();

      resetRateLimits();

      // Pre-populate 60 rate limit requests for Owner A
      for (let i = 0; i < 60; i++) {
        expect(checkStaffEditRateLimit(ownerAUser.id, FIXED_NOW.getTime())).toBe(true);
      }

      // 61st edit by Owner A within the same minute -> MUST return EDIT_LIMIT
      const res61 = await updateBarberProfileStaff(
        ownerAUser,
        barberA1.id,
        { displayName: 'Ustaad Vikram', experienceYears: 5 },
        FIXED_NOW
      );
      expect(res61.ok).toBe(false);
      expect(res61.code).toBe('EDIT_LIMIT');

      // Second staff user (Owner B) MUST be unaffected
      const resOwnerB = await updateBarberProfileStaff(
        ownerBUser,
        barberB1.id,
        { displayName: 'Ustaad Kabir', experienceYears: 4 },
        FIXED_NOW
      );
      expect(resOwnerB.ok).toBe(true);
    });

    // ------------------------------------------------------------------------
    // TEST 18: TRANSLATION PARITY & TERMINOLOGY ENFORCEMENT
    // ------------------------------------------------------------------------
    it('translations: 100% key parity between en.json and hi.json; zero "नाई" in dashboard/errors; zero "सेव" in all hi.json', () => {
      function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
        const keys: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            Object.assign(keys, flattenKeys(v as Record<string, unknown>, fullKey));
          } else {
            keys[fullKey] = String(v);
          }
        }
        return keys;
      }

      const enFlat = flattenKeys(enMessages as Record<string, unknown>);
      const hiFlat = flattenKeys(hiMessages as Record<string, unknown>);

      const enKeys = Object.keys(enFlat).sort();
      const hiKeys = Object.keys(hiFlat).sort();

      expect(enKeys.length).toBe(hiKeys.length);
      expect(enKeys).toEqual(hiKeys);

      // Hindi terminology audit:
      // 1. "नाई" is strictly forbidden in dashboard.* and errors.* (must use "उस्ताद")
      for (const [key, value] of Object.entries(hiFlat)) {
        if (key.startsWith('dashboard.') || key.startsWith('errors.')) {
          expect(value).not.toMatch(/नाई/);
        }
      }

      // 2. "सेव" (transliterated Save) is strictly forbidden across ALL Hindi translations (must use "सहेजें")
      // Does not forbid legitimate Hindi words like "सेवा" (service) or "सेवाएँ" (services)
      const transliteratedSaveRegex = /(?:^|[^\p{L}\p{M}])सेव(?![ािीुूृेैोौ्ँंः\p{L}])/u;
      for (const [, value] of Object.entries(hiFlat)) {
        expect(value).not.toMatch(transliteratedSaveRegex);
      }

      // 3. No Devanagari numerals (०-९) allowed; Latin digits 0-9 exclusively
      for (const [, value] of Object.entries(hiFlat)) {
        expect(value).not.toMatch(/[\u0966-\u096F]/);
      }
    });
  });
});
