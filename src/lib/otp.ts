import crypto from 'crypto';
import { db } from './db';
import { getOtpSender } from './otp-sender';
import { checkRateLimit } from './rate-limit';

export const SEEDED_TEST_PHONES = new Set([
  '+919000000001',
  '+919000000002',
  '+919000000003',
  '+919000000004',
  '+919000000005',
  '+919000000006',
  '+919000000007',
  '+919876543210',
  '+919876543211',
  '+919876543212',
]);

export function getOtpPepper(): string {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper) {
    if (process.env.NODE_ENV === 'test') {
      return 'test-pepper-12345678901234567890123456789012';
    }
    throw new Error('FATAL: OTP_PEPPER environment variable is missing.');
  }
  return pepper;
}

export function hashOtp(code: string, phone: string, pepper: string = getOtpPepper()): string {
  return crypto.createHmac('sha256', pepper).update(`${code}${phone}`).digest('hex');
}

export function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) {
    return false;
  }
  const bufA = Buffer.from(aHex, 'hex');
  const bufB = Buffer.from(bHex, 'hex');
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isTestOtpAllowed(phone: string, code: string): boolean {
  const isProd =
    process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  const allowTestOtp = process.env.ALLOW_TEST_OTP === 'true';

  return (
    !isProd &&
    allowTestOtp &&
    code === '123456' &&
    SEEDED_TEST_PHONES.has(phone)
  );
}

export interface RequestOtpResult {
  success: boolean;
  error?: string;
  retryAfterSec?: number;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
}

/**
 * Requests an OTP for a given phone number.
 * Enforces per-IP and per-phone rate limits, 30s cooldown, invalidates older codes,
 * and sends code via configured OtpSender.
 */
export async function requestOtp(
  phone: string,
  clientIp: string = '127.0.0.1'
): Promise<RequestOtpResult> {
  // 1. IP Rate limit: max 10 OTP requests per IP per hour (3600s)
  const ipLimit = checkRateLimit(`otp:req:ip:${clientIp}`, 10, 3600 * 1000);
  if (!ipLimit.allowed) {
    return {
      success: false,
      error: 'Too many OTP requests from this connection. Please try again later.',
      retryAfterSec: Math.ceil(ipLimit.retryAfterMs / 1000),
    };
  }

  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  // 2. Cooldown & Phone limits checked via DB
  const recentCodes = await db.otpCode.findMany({
    where: {
      phone,
      createdAt: { gte: tenMinutesAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Cooldown check: 30 seconds since most recent OTP
  if (recentCodes.length > 0) {
    const elapsedMs = now.getTime() - recentCodes[0].createdAt.getTime();
    if (elapsedMs < 30 * 1000) {
      const remainingSec = Math.ceil((30 * 1000 - elapsedMs) / 1000);
      return {
        success: false,
        error: `Please wait ${remainingSec} seconds before requesting a new OTP.`,
        retryAfterSec: remainingSec,
      };
    }
  }

  // Max 3 OTP requests per phone per 10 minutes
  if (recentCodes.length >= 3) {
    return {
      success: false,
      error: 'Too many OTP requests for this number. Please try again in 10 minutes.',
      retryAfterSec: 600,
    };
  }

  // 3. Generate 6-digit cryptographic random OTP code
  const codeNum = crypto.randomInt(100000, 1000000);
  const code = codeNum.toString();
  const codeHash = hashOtp(code, phone);
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min expiry

  // 4. Invalidate all older unconsumed codes and insert new code atomically
  await db.$transaction(async (tx) => {
    await tx.otpCode.updateMany({
      where: {
        phone,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    await tx.otpCode.create({
      data: {
        phone,
        codeHash,
        expiresAt,
        attempts: 0,
      },
    });
  });

  // 5. Send OTP via OtpSender (never logs code in production)
  const sender = getOtpSender();
  await sender.sendOtp(phone, code);

  return { success: true };
}

/**
 * Verifies an OTP code for a given phone number.
 * Enforces per-IP limits, max 5 attempts per code, expiry, and single-use consumption.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  clientIp: string = '127.0.0.1'
): Promise<VerifyOtpResult> {
  // 1. IP Rate limit: max 20 verify attempts per IP per 10 minutes
  const ipLimit = checkRateLimit(`otp:verify:ip:${clientIp}`, 20, 10 * 60 * 1000);
  if (!ipLimit.allowed) {
    return {
      success: false,
      error: 'Too many verification attempts. Please wait before trying again.',
    };
  }

  // 2. Check test OTP shortcut in development
  if (isTestOtpAllowed(phone, code)) {
    // Consume any active OTP record if present
    await db.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return { success: true };
  }

  const now = new Date();
  const candidateHash = hashOtp(code, phone);

  // 3. Transactional verification and consumption
  return await db.$transaction(async (tx) => {
    // Find latest active, unconsumed code
    const record = await tx.otpCode.findFirst({
      where: {
        phone,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    // No user enumeration: uniform error message
    if (!record) {
      return { success: false, error: 'Wrong or expired code' };
    }

    // Check expiry
    if (record.expiresAt < now) {
      await tx.otpCode.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      return { success: false, error: 'Wrong or expired code' };
    }

    // Check attempts lockout: max 5 wrong attempts per code
    if (record.attempts >= 5) {
      await tx.otpCode.update({
        where: { id: record.id },
        data: { consumedAt: now },
      });
      return { success: false, error: 'Wrong or expired code' };
    }

    // Compare with timing-safe check
    const isMatch = timingSafeEqualHex(candidateHash, record.codeHash);

    if (!isMatch) {
      const newAttempts = record.attempts + 1;
      await tx.otpCode.update({
        where: { id: record.id },
        data: {
          attempts: newAttempts,
          // Invalidate on 5th failure
          consumedAt: newAttempts >= 5 ? now : null,
        },
      });
      return { success: false, error: 'Wrong or expired code' };
    }

    // Code matches: consume immediately so reuse fails
    await tx.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    });

    return { success: true };
  });
}
