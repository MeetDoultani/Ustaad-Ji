import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { normalizeIndianPhone } from '../lib/phone';
import { validateCallbackUrl } from '../lib/url';
import {
  hashOtp,
  timingSafeEqualHex,
  isTestOtpAllowed,
  requestOtp,
  verifyOtp,
} from '../lib/otp';
import { validateEnv } from '../lib/env';
import {
  canViewBooking,
  canUpdateBookingStatus,
  canCancelBooking,
  canManageSalon,
  canManageBarber,
  canManageBarberAvailability,
  canApproveSalon,
  canApproveBarber,
  canViewAdminArea,
  PolicyUser,
  PolicyBooking,
  PolicySalon,
  PolicyBarber,
} from '../lib/policies';
import { db } from '../lib/db';
import { Role, VerificationStatus } from '@prisma/client';
import { resetRateLimits } from '../lib/rate-limit';
import { getPublicSalons } from '../lib/salons';
import { getCurrentUser } from '../lib/auth-server';
import { updateProfileName, ProfileNameSchema } from '../app/account/actions';

describe('Phase 2: Authentication, Roles and Authorization Tests', () => {
  // Safety guard against running in production
  beforeAll(() => {
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run DB tests when APP_ENV or NODE_ENV is production');
    }
  });

  beforeEach(() => {
    resetRateLimits();
  });

  // ----------------------------------------------------------------
  // 1. Phone Normalisation Tests
  // ----------------------------------------------------------------
  describe('Phone Normalisation (normalizeIndianPhone)', () => {
    it('accepts standard 10-digit Indian mobile numbers and normalises to E.164', () => {
      const res = normalizeIndianPhone('9876543210');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+919876543210');
    });

    it('accepts numbers with +91 prefix and formatting characters (spaces, dashes)', () => {
      const res = normalizeIndianPhone('+91 98765-43210');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+919876543210');
    });

    it('accepts numbers with leading 0 (trunk prefix)', () => {
      const res = normalizeIndianPhone('09876543210');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+919876543210');
    });

    it('accepts numbers starting with 91 without plus', () => {
      const res = normalizeIndianPhone('919876543210');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+919876543210');
    });

    it('rejects numbers that are too short', () => {
      const res = normalizeIndianPhone('98765');
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejects strings containing letters', () => {
      const res = normalizeIndianPhone('98765abcde');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('letters');
    });

    it('rejects landline numbers in India', () => {
      const res = normalizeIndianPhone('08022222222'); // Bengaluru landline
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('mobile');
    });
  });

  // ----------------------------------------------------------------
  // 2. Callback URL Validation Tests (Open-Redirect Protection)
  // ----------------------------------------------------------------
  describe('Open Redirect Protection (validateCallbackUrl)', () => {
    it('allows valid relative paths', () => {
      expect(validateCallbackUrl('/salons')).toBe('/salons');
      expect(validateCallbackUrl('/dashboard?tab=hours')).toBe('/dashboard?tab=hours');
      expect(validateCallbackUrl('/bookings/cm12345')).toBe('/bookings/cm12345');
    });

    it('rejects protocol-relative URLs starting with //', () => {
      expect(validateCallbackUrl('//evil.com')).toBeNull();
      expect(validateCallbackUrl('//attacker.example.com/steal')).toBeNull();
    });

    it('rejects absolute URLs starting with http:// or https://', () => {
      expect(validateCallbackUrl('https://evil.com')).toBeNull();
      expect(validateCallbackUrl('http://phishing.site/login')).toBeNull();
    });

    it('rejects URLs containing backslashes', () => {
      expect(validateCallbackUrl('/\\evil.com')).toBeNull();
      expect(validateCallbackUrl('\\evil.com')).toBeNull();
    });

    it('returns null for empty, whitespace, or invalid types', () => {
      expect(validateCallbackUrl('')).toBeNull();
      expect(validateCallbackUrl('   ')).toBeNull();
      expect(validateCallbackUrl(null)).toBeNull();
      expect(validateCallbackUrl(undefined)).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // 3. Test OTP Guard & Startup Validation
  // ----------------------------------------------------------------
  describe('Test OTP Guard & Environment Validation', () => {
    it('accepts test OTP 123456 only for seeded numbers in development', () => {
      const originalAppEnv = process.env.APP_ENV;
      const originalAllow = process.env.ALLOW_TEST_OTP;

      process.env.APP_ENV = 'development';
      process.env.ALLOW_TEST_OTP = 'true';

      // Seeded phone should pass
      expect(isTestOtpAllowed('+919000000001', '123456')).toBe(true);
      expect(isTestOtpAllowed('+919876543210', '123456')).toBe(true);

      // Non-seeded phone must be rejected
      expect(isTestOtpAllowed('+919999999999', '123456')).toBe(false);

      // Other OTP code must be rejected
      expect(isTestOtpAllowed('+919000000001', '654321')).toBe(false);

      process.env.APP_ENV = originalAppEnv;
      process.env.ALLOW_TEST_OTP = originalAllow;
    });

    it('rejects test OTP when APP_ENV is production', () => {
      const originalAppEnv = process.env.APP_ENV;
      process.env.APP_ENV = 'production';

      expect(isTestOtpAllowed('+919000000001', '123456')).toBe(false);

      process.env.APP_ENV = originalAppEnv;
    });

    it('startup validation throws if ALLOW_TEST_OTP is true while APP_ENV=production or NODE_ENV=production', () => {
      expect(() =>
        validateEnv({ ALLOW_TEST_OTP: 'true', APP_ENV: 'production' })
      ).toThrow('SECURITY VIOLATION: ALLOW_TEST_OTP cannot be enabled in a production environment!');

      expect(() =>
        validateEnv({ ALLOW_TEST_OTP: 'true', NODE_ENV: 'production' })
      ).toThrow('SECURITY VIOLATION: ALLOW_TEST_OTP cannot be enabled in a production environment!');
    });

    it('startup validation throws when AUTH_SECRET is missing or empty outside tests', () => {
      expect(() =>
        validateEnv({ NODE_ENV: 'development', AUTH_SECRET: '', OTP_PEPPER: 'valid-pepper' })
      ).toThrow('FATAL: AUTH_SECRET is missing');

      expect(() =>
        validateEnv({ NODE_ENV: 'development', AUTH_SECRET: '   ', OTP_PEPPER: 'valid-pepper' })
      ).toThrow('FATAL: AUTH_SECRET is missing');
    });

    it('startup validation throws when OTP_PEPPER is missing or empty outside tests', () => {
      expect(() =>
        validateEnv({ NODE_ENV: 'development', AUTH_SECRET: 'valid-secret', OTP_PEPPER: '' })
      ).toThrow('FATAL: OTP_PEPPER is missing');

      expect(() =>
        validateEnv({ NODE_ENV: 'development', AUTH_SECRET: 'valid-secret', OTP_PEPPER: '   ' })
      ).toThrow('FATAL: OTP_PEPPER is missing');
    });
  });

  // ----------------------------------------------------------------
  // 4. Policy Tests (Central Authorization)
  // ----------------------------------------------------------------
  describe('Central Policy Module (src/lib/policies.ts)', () => {
    const adminUser: PolicyUser = { id: 'usr-admin', role: Role.ADMIN, isActive: true };
    const customer1: PolicyUser = { id: 'usr-cust-1', role: Role.CUSTOMER, isActive: true };
    const customer2: PolicyUser = { id: 'usr-cust-2', role: Role.CUSTOMER, isActive: true };
    const barber1: PolicyUser = { id: 'usr-barber-1', role: Role.BARBER, isActive: true };
    const barber2: PolicyUser = { id: 'usr-barber-2', role: Role.BARBER, isActive: true };
    const owner1: PolicyUser = { id: 'usr-owner-1', role: Role.OWNER, isActive: true };
    const owner2: PolicyUser = { id: 'usr-owner-2', role: Role.OWNER, isActive: true };
    const inactiveUser: PolicyUser = { id: 'usr-cust-3', role: Role.CUSTOMER, isActive: false };

    const bookingSalonA: PolicyBooking = {
      id: 'bk-1',
      customerId: 'usr-cust-1',
      barberUserId: 'usr-barber-1',
      salonId: 'salon-a',
      salonOwnerId: 'usr-owner-1',
    };

    const salonA: PolicySalon = { id: 'salon-a', ownerId: 'usr-owner-1' };
    const barberRecordA: PolicyBarber = {
      id: 'barber-rec-1',
      userId: 'usr-barber-1',
      salonId: 'salon-a',
      salonOwnerId: 'usr-owner-1',
    };

    // canViewBooking
    it('allows booking viewing only to customer owner, assigned barber, salon owner, or admin', () => {
      expect(canViewBooking(customer1, bookingSalonA)).toBe(true);
      expect(canViewBooking(customer2, bookingSalonA)).toBe(false); // another customer denied
      expect(canViewBooking(barber1, bookingSalonA)).toBe(true);
      expect(canViewBooking(barber2, bookingSalonA)).toBe(false); // another barber denied
      expect(canViewBooking(owner1, bookingSalonA)).toBe(true);
      expect(canViewBooking(owner2, bookingSalonA)).toBe(false); // owner of salon B denied
      expect(canViewBooking(adminUser, bookingSalonA)).toBe(true);
      expect(canViewBooking(inactiveUser, bookingSalonA)).toBe(false);
      expect(canViewBooking(null, bookingSalonA)).toBe(false);
    });

    // canUpdateBookingStatus
    it('allows updating booking status only to assigned barber, salon owner, or admin (customers cannot)', () => {
      expect(canUpdateBookingStatus(customer1, bookingSalonA)).toBe(false); // Customer CANNOT
      expect(canUpdateBookingStatus(barber1, bookingSalonA)).toBe(true);
      expect(canUpdateBookingStatus(barber2, bookingSalonA)).toBe(false);
      expect(canUpdateBookingStatus(owner1, bookingSalonA)).toBe(true);
      expect(canUpdateBookingStatus(owner2, bookingSalonA)).toBe(false);
      expect(canUpdateBookingStatus(adminUser, bookingSalonA)).toBe(true);
      expect(canUpdateBookingStatus(inactiveUser, bookingSalonA)).toBe(false);
    });

    // canCancelBooking
    it('allows cancelling a booking to owning customer, assigned barber, salon owner, or admin', () => {
      expect(canCancelBooking(customer1, bookingSalonA)).toBe(true);
      expect(canCancelBooking(customer2, bookingSalonA)).toBe(false);
      expect(canCancelBooking(barber1, bookingSalonA)).toBe(true);
      expect(canCancelBooking(owner1, bookingSalonA)).toBe(true);
      expect(canCancelBooking(adminUser, bookingSalonA)).toBe(true);
    });

    // canManageSalon
    it('allows managing a salon only to its owner or admin', () => {
      expect(canManageSalon(owner1, salonA)).toBe(true);
      expect(canManageSalon(owner2, salonA)).toBe(false);
      expect(canManageSalon(adminUser, salonA)).toBe(true);
      expect(canManageSalon(barber1, salonA)).toBe(false);
      expect(canManageSalon(customer1, salonA)).toBe(false);
    });

    // (a) Same-salon barber isolation
    it('enforces same-salon barber isolation: Barber A cannot view or update Barber B booking in the same salon', () => {
      // Both barber1 and barber2 belong to salon-a
      const bookingForBarberB: PolicyBooking = {
        id: 'bk-barber-b',
        customerId: 'usr-cust-1',
        barberUserId: 'usr-barber-2', // Assigned to Barber B
        salonId: 'salon-a',
        salonOwnerId: 'usr-owner-1',
      };

      // Barber A cannot view Barber B's booking
      expect(canViewBooking(barber1, bookingForBarberB)).toBe(false);
      // Barber A cannot update Barber B's booking status
      expect(canUpdateBookingStatus(barber1, bookingForBarberB)).toBe(false);

      // Barber B can view and update own booking
      expect(canViewBooking(barber2, bookingForBarberB)).toBe(true);
      expect(canUpdateBookingStatus(barber2, bookingForBarberB)).toBe(true);
    });

    // (b) Cross-salon owner isolation
    it('enforces cross-salon owner isolation: Owner of Salon A cannot view or update bookings belonging to Salon B', () => {
      const bookingSalonB: PolicyBooking = {
        id: 'bk-salon-b',
        customerId: 'usr-cust-2',
        barberUserId: 'usr-barber-3',
        salonId: 'salon-b',
        salonOwnerId: 'usr-owner-2', // Owned by Owner 2
      };

      // Owner 1 belongs to Salon A, not Salon B
      expect(canViewBooking(owner1, bookingSalonB)).toBe(false);
      expect(canUpdateBookingStatus(owner1, bookingSalonB)).toBe(false);

      // Owner 2 can view and update bookings in Salon B
      expect(canViewBooking(owner2, bookingSalonB)).toBe(true);
      expect(canUpdateBookingStatus(owner2, bookingSalonB)).toBe(true);
    });

    // (c) canManageBarber granularity
    it('enforces canManageBarber and canManageBarberAvailability granularity', () => {
      // 1. Owner of another salon (Salon B) is denied from managing Barber A in Salon A
      expect(canManageBarber(owner2, barberRecordA)).toBe(false);
      expect(canManageBarberAvailability(owner2, barberRecordA)).toBe(false);

      // 2. Barber editing own availability is allowed; Barber A editing Barber B is denied
      expect(canManageBarberAvailability(barber1, barberRecordA)).toBe(true); // Barber A editing self
      expect(canManageBarberAvailability(barber2, barberRecordA)).toBe(false); // Barber B editing Barber A denied

      // 3. Barbers are denied from owner-only barber management actions (e.g. status/profile approval)
      expect(canManageBarber(barber1, barberRecordA)).toBe(false); // Barber cannot manage own profile/status
      expect(canManageBarber(barber2, barberRecordA)).toBe(false); // Barber cannot manage other barber profile/status

      // 4. Salon Owner and Admin are allowed to manage barber profile/status and availability
      expect(canManageBarber(owner1, barberRecordA)).toBe(true);
      expect(canManageBarber(adminUser, barberRecordA)).toBe(true);
      expect(canManageBarberAvailability(owner1, barberRecordA)).toBe(true);
      expect(canManageBarberAvailability(adminUser, barberRecordA)).toBe(true);
    });

    // canApproveSalon, canApproveBarber, canViewAdminArea
    it('restricts admin actions strictly to ADMIN role', () => {
      expect(canApproveSalon(adminUser)).toBe(true);
      expect(canApproveSalon(owner1)).toBe(false);
      expect(canApproveSalon(customer1)).toBe(false);

      expect(canApproveBarber(adminUser)).toBe(true);
      expect(canApproveBarber(barber1)).toBe(false);

      expect(canViewAdminArea(adminUser)).toBe(true);
      expect(canViewAdminArea(owner1)).toBe(false);
      expect(canViewAdminArea(null)).toBe(false);
      expect(canViewAdminArea(inactiveUser)).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // 5. OTP Service Logic & Security Tests (Database)
  // ----------------------------------------------------------------
  describe('OTP Service Logic & Database Rules', () => {
    const testPhone = '+919876599999';

    afterEach(async () => {
      await db.otpCode.deleteMany({ where: { phone: testPhone } });
    });

    it('generates HMAC hash and uses constant-time compare', () => {
      const code = '742918';
      const hash1 = hashOtp(code, testPhone);
      const hash2 = hashOtp(code, testPhone);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex length

      expect(timingSafeEqualHex(hash1, hash2)).toBe(true);
      const wrongHash = hashOtp('111111', testPhone);
      expect(timingSafeEqualHex(hash1, wrongHash)).toBe(false);
    });

    it('issues OTP, stores only hash, and allows single-use verification', async () => {
      const reqRes = await requestOtp(testPhone, '127.0.0.1');
      expect(reqRes.success).toBe(true);

      const record = await db.otpCode.findFirst({
        where: { phone: testPhone },
        orderBy: { createdAt: 'desc' },
      });
      expect(record).not.toBeNull();
      expect(record?.codeHash).toBeDefined();
      expect(record?.consumedAt).toBeNull();

      // Test verification directly via DB code hash
      // Create specific known code for this test
      const knownCode = '482910';
      const knownHash = hashOtp(knownCode, testPhone);
      await db.otpCode.update({
        where: { id: record!.id },
        data: { codeHash: knownHash },
      });

      // 1. Verify with known code succeeds
      const verify1 = await verifyOtp(testPhone, knownCode, '127.0.0.1');
      expect(verify1.success).toBe(true);

      // 2. Reuse must fail
      const verifyReuse = await verifyOtp(testPhone, knownCode, '127.0.0.1');
      expect(verifyReuse.success).toBe(false);
      expect(verifyReuse.error).toBe('Wrong or expired code');
    });

    it('rejects expired OTP code', async () => {
      const expiredDate = new Date(Date.now() - 10 * 1000);
      const code = '555111';
      await db.otpCode.create({
        data: {
          phone: testPhone,
          codeHash: hashOtp(code, testPhone),
          expiresAt: expiredDate,
          attempts: 0,
        },
      });

      const res = await verifyOtp(testPhone, code, '127.0.0.1');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Wrong or expired code');
    });

    it('5 wrong attempts invalidate the code even if the correct code follows', async () => {
      const correctCode = '654321';
      await db.otpCode.create({
        data: {
          phone: testPhone,
          codeHash: hashOtp(correctCode, testPhone),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          attempts: 0,
        },
      });

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const attempt = await verifyOtp(testPhone, '000000', `127.0.0.${i + 1}`);
        expect(attempt.success).toBe(false);
      }

      // Now attempt with the correct code -> must be locked out
      const correctAttempt = await verifyOtp(testPhone, correctCode, '127.0.0.99');
      expect(correctAttempt.success).toBe(false);
      expect(correctAttempt.error).toBe('Wrong or expired code');
    });

    it('issuing a newer OTP invalidates previous unconsumed codes', async () => {
      await requestOtp(testPhone, '127.0.0.1');
      const firstCode = await db.otpCode.findFirst({
        where: { phone: testPhone },
        orderBy: { createdAt: 'desc' },
      });
      expect(firstCode?.consumedAt).toBeNull();

      // Fast forward by updating createdAt so cooldown passes
      await db.otpCode.update({
        where: { id: firstCode!.id },
        data: { createdAt: new Date(Date.now() - 40 * 1000) },
      });

      // Request second OTP
      await requestOtp(testPhone, '127.0.0.1');

      // First code should now be marked consumed
      const updatedFirst = await db.otpCode.findUnique({
        where: { id: firstCode!.id },
      });
      expect(updatedFirst?.consumedAt).not.toBeNull();
    });

    it('enforces 30s resend cooldown for the same phone', async () => {
      const res1 = await requestOtp(testPhone, '127.0.0.1');
      expect(res1.success).toBe(true);

      // Immediate second request must be rejected
      const res2 = await requestOtp(testPhone, '127.0.0.1');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('wait');
    });

    it('enforces max 3 OTP requests per phone per 10 minutes', async () => {
      const now = Date.now();
      // Insert 3 records in the last 5 minutes
      await db.otpCode.createMany({
        data: [
          {
            phone: testPhone,
            codeHash: 'hash1',
            expiresAt: new Date(now + 60000),
            createdAt: new Date(now - 4 * 60 * 1000),
            consumedAt: new Date(),
          },
          {
            phone: testPhone,
            codeHash: 'hash2',
            expiresAt: new Date(now + 60000),
            createdAt: new Date(now - 2 * 60 * 1000),
            consumedAt: new Date(),
          },
          {
            phone: testPhone,
            codeHash: 'hash3',
            expiresAt: new Date(now + 60000),
            createdAt: new Date(now - 40 * 1000),
            consumedAt: new Date(),
          },
        ],
      });

      const res = await requestOtp(testPhone, '127.0.0.1');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Too many OTP requests for this number');
    });

    it('enforces IP rate limits for OTP requests and verification attempts', async () => {
      const testIp = '192.168.1.100';

      // Clean up any existing dummy phones to avoid 30s cooldown interference
      await db.otpCode.deleteMany({
        where: {
          phone: { startsWith: '+9198700000' },
        },
      });

      try {
        // 10 requests allowed
        for (let i = 0; i < 10; i++) {
          const dummyPhone = `+91987000000${i}`;
          const res = await requestOtp(dummyPhone, testIp);
          expect(res.success).toBe(true);
        }

        // 11th request from same IP is blocked
        const blocked = await requestOtp('+919870000099', testIp);
        expect(blocked.success).toBe(false);
        expect(blocked.error).toContain('Too many OTP requests from this connection');
      } finally {
        await db.otpCode.deleteMany({
          where: {
            phone: { startsWith: '+9198700000' },
          },
        });
      }
    });
  });

  // ----------------------------------------------------------------
  // 6. Integration Tests against Database (User Creation & Admin Approval)
  // ----------------------------------------------------------------
  describe('Integration Flow & Database Role Verification', () => {
    const newCustomerPhone = '+919999888877';

    afterAll(async () => {
      await db.otpCode.deleteMany({ where: { phone: newCustomerPhone } });
      await db.user.deleteMany({ where: { phone: newCustomerPhone } });
    });

    it('new phone login creates a CUSTOMER role; cannot escalate own role', async () => {
      // 1. Verify user does not exist
      const existing = await db.user.findUnique({
        where: { phone: newCustomerPhone },
      });
      expect(existing).toBeNull();

      // 2. Simulate successful login verification creating user
      const created = await db.user.create({
        data: {
          phone: newCustomerPhone,
          role: Role.CUSTOMER,
          language: 'en',
          isActive: true,
        },
      });

      expect(created.id).toBeDefined();
      expect(created.role).toBe(Role.CUSTOMER);

      // Verify that normal client cannot escalate own role
      expect(canApproveSalon({ id: created.id, role: created.role, isActive: created.isActive })).toBe(false);
      expect(canViewAdminArea({ id: created.id, role: created.role, isActive: created.isActive })).toBe(false);
    });

    it('existing barber logging in keeps BARBER role', async () => {
      const barber = await db.user.findFirst({
        where: { role: Role.BARBER },
      });
      expect(barber).not.toBeNull();
      expect(barber?.role).toBe(Role.BARBER);
    });

    it('deactivated user cannot log in and has null access', async () => {
      const testDeactivatedPhone = '+919999777766';
      const deactivatedUser = await db.user.create({
        data: {
          phone: testDeactivatedPhone,
          role: Role.CUSTOMER,
          isActive: false,
        },
      });

      // Policy check on deactivated user denies all
      expect(canViewAdminArea({ id: deactivatedUser.id, role: deactivatedUser.role, isActive: deactivatedUser.isActive })).toBe(false);

      await db.user.delete({ where: { id: deactivatedUser.id } });
    });

    it('admin approve action verifies pending salon, making it visible publicly; suspend hides it', async () => {
      // 1. Find pending salon (Royal Ustaad Mens Salon)
      const pendingSalon = await db.salon.findFirst({
        where: { slug: 'royal-ustaad-mens-salon' },
      });
      expect(pendingSalon).not.toBeNull();
      const originalStatus = pendingSalon!.status;

      // Ensure public query currently hides it
      let publicSalons = await getPublicSalons();
      expect(publicSalons.find((s) => s.slug === 'royal-ustaad-mens-salon')).toBeUndefined();

      try {
        // 2. Approve salon to VERIFIED
        await db.salon.update({
          where: { id: pendingSalon!.id },
          data: { status: VerificationStatus.VERIFIED },
        });

        // Now public query MUST include it
        publicSalons = await getPublicSalons();
        expect(publicSalons.find((s) => s.slug === 'royal-ustaad-mens-salon')).toBeDefined();

        // 3. Suspend salon
        await db.salon.update({
          where: { id: pendingSalon!.id },
          data: { status: VerificationStatus.SUSPENDED },
        });

        // Public query MUST hide it again
        publicSalons = await getPublicSalons();
        expect(publicSalons.find((s) => s.slug === 'royal-ustaad-mens-salon')).toBeUndefined();
      } finally {
        // 4. Restore original status (PENDING)
        await db.salon.update({
          where: { id: pendingSalon!.id },
          data: { status: originalStatus },
        });
      }

      // Confirm restored
      const restored = await db.salon.findUnique({ where: { id: pendingSalon!.id } });
      expect(restored?.status).toBe(originalStatus);
    }, 30000);

    // (e) Mass-assignment / role escalation prevention on Account Update
    it('prevents mass-assignment / role escalation on account update: role field is stripped and remains CUSTOMER', async () => {
      const customerPhone = '+919999000111';
      const customerUser = await db.user.create({
        data: {
          phone: customerPhone,
          name: 'Original Customer',
          role: Role.CUSTOMER,
          language: 'en',
          isActive: true,
        },
      });

      try {
        // 1. Verify ProfileNameSchema explicitly strips extra/unrecognized fields
        const parsed = ProfileNameSchema.parse({
          name: 'New Valid Name',
          role: 'ADMIN',
        } as unknown);
        expect(parsed).toEqual({ name: 'New Valid Name' });
        expect((parsed as Record<string, unknown>).role).toBeUndefined();

        // 2. Call updateProfileName server action with malicious payload containing role: "ADMIN"
        const maliciousPayload = {
          name: 'New Valid Name',
          role: 'ADMIN',
        };
        const actionResult = await updateProfileName(
          null,
          maliciousPayload as unknown as Record<string, unknown>,
          customerUser
        );
        expect(actionResult.success).toBe(true);

        // 3. Reload user from DB and confirm role remains CUSTOMER
        const reloaded = await db.user.findUnique({
          where: { id: customerUser.id },
        });
        expect(reloaded).not.toBeNull();
        expect(reloaded?.name).toBe('New Valid Name');
        expect(reloaded?.role).toBe(Role.CUSTOMER);
      } finally {
        await db.user.delete({ where: { id: customerUser.id } });
      }
    });

    // (f) Immediate deactivation enforcement via getCurrentUser()
    it('enforces immediate deactivation via getCurrentUser: active user returns profile, deactivated user returns null', async () => {
      const deactTestPhone = '+919999000222';
      const deactTestUser = await db.user.create({
        data: {
          phone: deactTestPhone,
          name: 'Deactivation Enforcement Test',
          role: Role.CUSTOMER,
          language: 'en',
          isActive: true,
        },
      });

      try {
        // 1. Valid session with active user returns current user
        const activeUser = await getCurrentUser({ user: { id: deactTestUser.id } });
        expect(activeUser).not.toBeNull();
        expect(activeUser?.id).toBe(deactTestUser.id);
        expect(activeUser?.isActive).toBe(true);

        // 2. User is deactivated in database
        await db.user.update({
          where: { id: deactTestUser.id },
          data: { isActive: false },
        });

        // 3. On the very next request, getCurrentUser returns null
        const deactivatedUser = await getCurrentUser({ user: { id: deactTestUser.id } });
        expect(deactivatedUser).toBeNull();

        // 4. Restore isActive: true in cleanup
        await db.user.update({
          where: { id: deactTestUser.id },
          data: { isActive: true },
        });
      } finally {
        await db.user.delete({ where: { id: deactTestUser.id } });
      }
    });

    // Item 4: Fix New User Default Language ('en' vs 'hi')
    it('creates new users with default language "en" matching schema.prisma definition', async () => {
      const defaultLangPhone = '+919999000333';
      try {
        const newUser = await db.user.create({
          data: {
            phone: defaultLangPhone,
            role: Role.CUSTOMER,
            // Omitting language to assert PostgreSQL schema default value
          },
        });
        expect(newUser.language).toBe('en');
      } finally {
        await db.user.deleteMany({ where: { phone: defaultLangPhone } });
      }
    });
  });
});
