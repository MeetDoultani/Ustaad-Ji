'use server';

import { normalizeIndianPhone } from '@/lib/phone';
import { requestOtp } from '@/lib/otp';
import { getCurrentUser } from '@/lib/auth-server';
import { validateCallbackUrl } from '@/lib/url';
import { Role } from '@prisma/client';
import { headers } from 'next/headers';

export interface SendOtpActionResult {
  success: boolean;
  phone?: string;
  error?: string;
  retryAfterSec?: number;
}

export async function sendOtpAction(rawPhone: string): Promise<SendOtpActionResult> {
  const phoneResult = normalizeIndianPhone(rawPhone);
  if (!phoneResult.isValid || !phoneResult.e164) {
    return {
      success: false,
      error: phoneResult.error || 'Please enter a valid 10-digit Indian mobile number.',
    };
  }

  const reqHeaders = await headers();
  const forwarded = reqHeaders.get('x-forwarded-for');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

  const res = await requestOtp(phoneResult.e164, clientIp);
  if (!res.success) {
    return {
      success: false,
      error: res.error,
      retryAfterSec: res.retryAfterSec,
    };
  }

  return {
    success: true,
    phone: phoneResult.e164,
  };
}

export async function getPostLoginRedirect(callbackUrl?: string): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    return '/salons';
  }

  if (user.role === Role.ADMIN) {
    return '/admin';
  }

  if (user.role === Role.BARBER || user.role === Role.OWNER) {
    return '/dashboard';
  }

  // Customer: use validated callbackUrl if available
  const validated = validateCallbackUrl(callbackUrl);
  if (validated && !validated.startsWith('/login')) {
    return validated;
  }

  return '/salons';
}
