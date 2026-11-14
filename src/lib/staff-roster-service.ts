import { prisma } from './db';
import { BookingStatus, BookingSource, Role, VerificationStatus, Prisma } from '@prisma/client';
import { CurrentUser } from './auth-server';
import {
  canManageBarberRoster,
  canEditBarberProfile,
  canEditSalonProfile,
  canViewBookingHistory,
  PolicyUser,
  PolicySalon,
  PolicyBarber,
} from './policies';
import { checkStaffEditRateLimit, logStaffConfigEvent } from './staff-config-service';
import { normalizeIndianPhone } from './phone';
import { maskPhoneForRegister } from './dashboard-service';
import { utcToIstDetails, istToUtcDate, formatIstTime } from './time';

export type StaffRosterErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'EDIT_LIMIT'
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
  | 'PHONE_IN_USE'
  | 'BARBER_HAS_BOOKINGS'
  | 'INVALID_PHOTO_URL'
  | 'INVALID_PROFILE';

export interface StaffRosterResult<T> {
  ok: boolean;
  data?: T;
  code?: StaffRosterErrorCode;
  message?: string;
}

export interface SalonBarberStaffItem {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  bio: string | null;
  photoUrl: string | null;
  experienceYears: number;
  status: VerificationStatus;
  isActive: boolean;
  servicesCount: number;
}

export interface BarberProfileStaffItem {
  id: string;
  userId: string;
  salonId: string;
  salonName: string;
  displayName: string;
  phone: string;
  bio: string | null;
  photoUrl: string | null;
  experienceYears: number;
  status: VerificationStatus;
  isActive: boolean;
}

export interface SalonProfileStaffItem {
  id: string;
  name: string;
  nameHi: string | null;
  description: string | null;
  phone: string | null;
  addressLine: string;
  area: string;
  city: string;
  pincode: string;
  requiresApproval: boolean;
  status: VerificationStatus;
}

export interface HistoryBookingItem {
  id: string;
  token: number;
  startsAt: string;
  endsAt: string;
  dateIst: string;
  timeIst: string;
  customerName: string | null;
  customerPhoneMasked: string | null;
  source: BookingSource;
  status: BookingStatus;
  cancelReason: string | null;
  totalRupees: number;
  barberName: string;
  barberId: string;
  servicesSummary: string[];
}

export interface BlockingBookingItem {
  id: string;
  token: number;
  startsAt: string;
  customerLabel: string;
}

/**
 * Validates photo URL according to Section D.1:
 * - Must be an https:// URL only
 * - Max 300 chars
 * - No embedded credentials (username:password@)
 * - No data: or javascript: schemes
 * - Empty string or null clears photoUrl to null
 */
export function validatePhotoUrl(url: string | null | undefined): {
  isValid: boolean;
  value: string | null;
  error?: string;
} {
  if (url === undefined || url === null) {
    return { isValid: true, value: null };
  }
  const trimmed = url.trim();
  if (trimmed === '') {
    return { isValid: true, value: null };
  }
  if (trimmed.length > 300) {
    return { isValid: false, value: null, error: 'Photo URL cannot exceed 300 characters.' };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return { isValid: false, value: null, error: 'Invalid URL scheme.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { isValid: false, value: null, error: 'Photo URL must use https protocol.' };
    }
    if (parsed.username || parsed.password) {
      return { isValid: false, value: null, error: 'Photo URL cannot contain credentials.' };
    }
    return { isValid: true, value: parsed.toString() };
  } catch {
    return { isValid: false, value: null, error: 'Invalid URL format.' };
  }
}

// ============================================================================
// BARBER ROSTER MANAGEMENT (Owner Only - /dashboard/barbers)
// ============================================================================

export async function getSalonBarbersStaff(
  staffUser: CurrentUser,
  salonId: string
): Promise<StaffRosterResult<SalonBarberStaffItem[]>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can view the barber roster.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  if (salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: salon.id, ownerId: salon.ownerId };
  if (!canManageBarberRoster(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  const barbers = await prisma.barber.findMany({
    where: { salonId },
    orderBy: { displayName: 'asc' },
    include: {
      user: { select: { phone: true } },
      _count: { select: { services: true } },
    },
  });

  const items = barbers.map((b) => ({
    id: b.id,
    userId: b.userId,
    displayName: b.displayName,
    phone: b.user.phone,
    bio: b.bio,
    photoUrl: b.photoUrl,
    experienceYears: b.experienceYears,
    status: b.status,
    isActive: b.isActive,
    servicesCount: b._count.services,
  }));

  return { ok: true, data: items };
}

export async function addBarberStaff(
  staffUser: CurrentUser,
  salonId: string,
  input: {
    displayName: string;
    phone: string;
    experienceYears?: number;
    bio?: string | null;
  },
  now: Date = new Date()
): Promise<StaffRosterResult<{ id: string; userId: string; displayName: string }>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can add barbers.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  if (salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: salon.id, ownerId: salon.ownerId };
  if (!canManageBarberRoster(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Validate fields
  const trimmedName = input.displayName ? input.displayName.trim() : '';
  if (trimmedName.length < 2 || trimmedName.length > 40) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Display name must be between 2 and 40 characters.' };
  }

  const expYears = input.experienceYears ?? 0;
  if (!Number.isInteger(expYears) || expYears < 0 || expYears > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Experience must be an integer between 0 and 60.' };
  }

  const trimmedBio = input.bio ? input.bio.trim() : null;
  if (trimmedBio && trimmedBio.length > 300) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Bio cannot exceed 300 characters.' };
  }

  // Normalize Indian mobile phone
  const phoneResult = normalizeIndianPhone(input.phone);
  if (!phoneResult.isValid || !phoneResult.e164) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Invalid Indian mobile number.' };
  }
  const normalizedPhone = phoneResult.e164;

  // Duplicate Phone Protection: check if user exists in ANY role
  const existingUser = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });
  if (existingUser) {
    return { ok: false, code: 'PHONE_IN_USE', message: 'Phone number is already registered to an existing account.' };
  }

  // Check salon barber cap (max 20 barbers)
  const currentCount = await prisma.barber.count({ where: { salonId } });
  if (currentCount >= 20) {
    return { ok: false, code: 'LIMIT_EXCEEDED', message: 'Salon has reached the maximum cap of 20 barbers.' };
  }

  try {
    const newBarber = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          role: Role.BARBER,
          name: trimmedName,
          phone: normalizedPhone,
          language: 'en',
          isActive: true,
        },
      });

      const barber = await tx.barber.create({
        data: {
          userId: user.id,
          salonId,
          displayName: trimmedName,
          bio: trimmedBio || null,
          experienceYears: expYears,
          status: VerificationStatus.PENDING,
          isActive: true,
        },
      });

      return barber;
    });

    logStaffConfigEvent({
      staffUserId: staffUser.id,
      entity: 'Barber',
      entityId: newBarber.id,
      action: 'CREATE',
      timestamp: now.toISOString(),
    });

    return {
      ok: true,
      data: {
        id: newBarber.id,
        userId: newBarber.userId,
        displayName: newBarber.displayName,
      },
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      ((err as { code: string }).code === 'P2002' || (err as { code: string }).code === '23505')
    ) {
      return { ok: false, code: 'PHONE_IN_USE', message: 'Phone number is already registered to an existing account.' };
    }
    throw err;
  }
}

export async function removeBarberStaff(
  staffUser: CurrentUser,
  salonId: string,
  barberId: string,
  now: Date = new Date()
): Promise<StaffRosterResult<{ id: string; isActive: boolean; blockingBookings?: BlockingBookingItem[] }>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can remove barbers.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  if (salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: salon.id, ownerId: salon.ownerId };
  if (!canManageBarberRoster(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    select: { id: true, salonId: true, isActive: true },
  });

  if (!barber || barber.salonId !== salonId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  // Interactive transaction with row-level locking
  const result = await prisma.$transaction(async (tx) => {
    // Lock target barber row
    await tx.$queryRaw`SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;`;

    // Check future or in-progress active bookings
    const blockingBookings = await tx.booking.findMany({
      where: {
        barberId,
        status: {
          in: [
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.CHECKED_IN,
            BookingStatus.IN_PROGRESS,
          ],
        },
        OR: [
          { startsAt: { gt: now } },
          { endsAt: { gt: now } },
        ],
      },
      orderBy: { startsAt: 'asc' },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    if (blockingBookings.length > 0) {
      return {
        ok: false as const,
        code: 'BARBER_HAS_BOOKINGS' as const,
        message: 'Barber has active or upcoming bookings.',
        data: {
          id: barberId,
          isActive: barber.isActive,
          blockingBookings: blockingBookings.map((b) => ({
            id: b.id,
            token: b.token,
            startsAt: b.startsAt.toISOString(),
            customerLabel: maskPhoneForRegister(b.customer?.phone || b.walkInPhone || '') || 'Customer',
          })),
        },
      };
    }

    await tx.barber.update({
      where: { id: barberId },
      data: { isActive: false },
    });

    return { ok: true as const, data: { id: barberId, isActive: false } };
  });

  if (!result.ok) {
    return result;
  }

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Barber',
    entityId: barberId,
    action: 'DEACTIVATE',
    timestamp: now.toISOString(),
  });

  return result;
}

export async function reactivateBarberStaff(
  staffUser: CurrentUser,
  salonId: string,
  barberId: string,
  now: Date = new Date()
): Promise<StaffRosterResult<{ id: string; isActive: boolean }>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can reactivate barbers.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  if (salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: salon.id, ownerId: salon.ownerId };
  if (!canManageBarberRoster(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    select: { id: true, salonId: true, status: true },
  });

  if (!barber || barber.salonId !== salonId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  await prisma.barber.update({
    where: { id: barberId },
    data: { isActive: true },
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Barber',
    entityId: barberId,
    action: 'REACTIVATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: barberId, isActive: true } };
}

// ============================================================================
// PROFILE MANAGEMENT (/dashboard/profile & /dashboard/barbers/[id])
// ============================================================================

export async function getBarberProfileStaff(
  staffUser: CurrentUser,
  barberId: string
): Promise<StaffRosterResult<BarberProfileStaffItem>> {
  if (!staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Staff user is inactive.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: { select: { id: true, ownerId: true, status: true, name: true } },
      user: { select: { phone: true } },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const isOwnBarber = staffUser.role === Role.BARBER && staffUser.id === barber.userId;
  const isSalonOwner = staffUser.role === Role.OWNER && staffUser.id === barber.salon.ownerId;
  if (!isOwnBarber && !isSalonOwner) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  return {
    ok: true,
    data: {
      id: barber.id,
      userId: barber.userId,
      salonId: barber.salonId,
      salonName: barber.salon.name,
      displayName: barber.displayName,
      phone: barber.user.phone,
      bio: barber.bio,
      photoUrl: barber.photoUrl,
      experienceYears: barber.experienceYears,
      status: barber.status,
      isActive: barber.isActive,
    },
  };
}

export async function updateBarberProfileStaff(
  staffUser: CurrentUser,
  barberId: string,
  input: {
    displayName: string;
    experienceYears: number;
    bio?: string | null;
    photoUrl?: string | null;
  },
  now: Date = new Date()
): Promise<StaffRosterResult<{ id: string }>> {
  if (!staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Staff user is inactive.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: { select: { id: true, ownerId: true, status: true } },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const isOwnBarber = staffUser.role === Role.BARBER && staffUser.id === barber.userId;
  const isSalonOwner = staffUser.role === Role.OWNER && staffUser.id === barber.salon.ownerId;
  if (!isOwnBarber && !isSalonOwner) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || !barber.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon or barber is not active/verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };
  if (!canEditBarberProfile(policyUser, policyBarber)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Validate fields
  const trimmedName = input.displayName ? input.displayName.trim() : '';
  if (trimmedName.length < 2 || trimmedName.length > 40) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Display name must be between 2 and 40 characters.' };
  }

  if (
    typeof input.experienceYears !== 'number' ||
    !Number.isInteger(input.experienceYears) ||
    input.experienceYears < 0 ||
    input.experienceYears > 60
  ) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Experience must be an integer between 0 and 60.' };
  }

  const trimmedBio = input.bio ? input.bio.trim() : null;
  if (trimmedBio && trimmedBio.length > 300) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Bio cannot exceed 300 characters.' };
  }

  const photoCheck = validatePhotoUrl(input.photoUrl);
  if (!photoCheck.isValid) {
    return { ok: false, code: 'INVALID_PHOTO_URL', message: photoCheck.error || 'Invalid photo URL.' };
  }

  // Strictly update only allowed fields (no phone, status, isActive, userId, salonId)
  await prisma.barber.update({
    where: { id: barberId },
    data: {
      displayName: trimmedName,
      experienceYears: input.experienceYears,
      bio: trimmedBio || null,
      photoUrl: photoCheck.value,
    },
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Barber',
    entityId: barberId,
    action: 'UPDATE_PROFILE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: barberId } };
}

export async function getSalonProfileStaff(
  staffUser: CurrentUser,
  salonId: string
): Promise<StaffRosterResult<SalonProfileStaffItem>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can view salon profile.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  return {
    ok: true,
    data: {
      id: salon.id,
      name: salon.name,
      nameHi: salon.nameHi,
      description: salon.description,
      phone: salon.phone,
      addressLine: salon.addressLine,
      area: salon.area,
      city: salon.city,
      pincode: salon.pincode,
      requiresApproval: salon.requiresApproval,
      status: salon.status,
    },
  };
}

export async function updateSalonProfileStaff(
  staffUser: CurrentUser,
  salonId: string,
  input: {
    name: string;
    nameHi?: string | null;
    description?: string | null;
    phone?: string | null;
    addressLine: string;
    area: string;
    city: string;
    pincode: string;
    requiresApproval: boolean;
  },
  now: Date = new Date()
): Promise<StaffRosterResult<{ id: string }>> {
  if (staffUser.role !== Role.OWNER || !staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can edit salon profile.' };
  }

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { id: true, ownerId: true, status: true },
  });

  if (!salon || salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
  }

  if (salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: salon.id, ownerId: salon.ownerId };
  if (!canEditSalonProfile(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  const trimmedName = input.name ? input.name.trim() : '';
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Salon name must be between 2 and 60 characters.' };
  }

  const trimmedNameHi = input.nameHi ? input.nameHi.trim() : null;
  if (trimmedNameHi && trimmedNameHi.length > 100) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Hindi name cannot exceed 100 characters.' };
  }

  const trimmedDesc = input.description ? input.description.trim() : null;
  if (trimmedDesc && trimmedDesc.length > 500) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Description cannot exceed 500 characters.' };
  }

  let normalizedPhone: string | null = null;
  if (input.phone && input.phone.trim() !== '') {
    const pCheck = normalizeIndianPhone(input.phone);
    if (!pCheck.isValid || !pCheck.e164) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Invalid phone number.' };
    }
    normalizedPhone = pCheck.e164;
  }

  const trimmedAddress = input.addressLine ? input.addressLine.trim() : '';
  if (trimmedAddress.length < 5 || trimmedAddress.length > 120) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Address must be between 5 and 120 characters.' };
  }

  const trimmedArea = input.area ? input.area.trim() : '';
  if (trimmedArea.length < 2 || trimmedArea.length > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Area must be between 2 and 60 characters.' };
  }

  const trimmedCity = input.city ? input.city.trim() : '';
  if (trimmedCity.length < 2 || trimmedCity.length > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'City must be between 2 and 60 characters.' };
  }

  const pincode = input.pincode ? input.pincode.trim() : '';
  if (!/^\d{6}$/.test(pincode)) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Pincode must be exactly 6 digits.' };
  }

  const requiresApproval = Boolean(input.requiresApproval);

  // Strictly update only allowed fields (no slug, status, ownerId, lat, lng, home visit fields)
  await prisma.salon.update({
    where: { id: salonId },
    data: {
      name: trimmedName,
      nameHi: trimmedNameHi || null,
      description: trimmedDesc || null,
      phone: normalizedPhone,
      addressLine: trimmedAddress,
      area: trimmedArea,
      city: trimmedCity,
      pincode,
      requiresApproval,
    },
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Salon',
    entityId: salonId,
    action: 'UPDATE_PROFILE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: salonId } };
}

// ============================================================================
// BOOKING HISTORY (/dashboard/history, Read-Only)
// ============================================================================

export async function getBookingHistoryStaff(params: {
  staffUser: CurrentUser;
  salonId?: string;
  barberId?: string;
  statusFilter?: BookingStatus | 'ALL_FINAL' | string;
  status?: BookingStatus | 'ALL_FINAL' | string;
  fromDateIst?: string;
  fromDate?: string;
  toDateIst?: string;
  toDate?: string;
  searchToken?: number;
  tokenSearch?: string | number;
  page?: number;
  pageSize?: number;
  limit?: number;
  now?: Date;
}): Promise<
  StaffRosterResult<{
    items: HistoryBookingItem[];
    totalCount: number;
    totalCompletedRupees: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>
> {
  const {
    staffUser,
    salonId: requestedSalonId,
    barberId: requestedBarberId,
    statusFilter: rawStatusFilter,
    status: rawStatus,
    fromDateIst: rawFromDateIst,
    fromDate: rawFromDate,
    toDateIst: rawToDateIst,
    toDate: rawToDate,
    searchToken: rawSearchToken,
    tokenSearch: rawTokenSearch,
    page = 1,
    pageSize = 20,
    limit,
    now = new Date(),
  } = params;

  const statusFilter = (rawStatusFilter || rawStatus || 'ALL_FINAL') as BookingStatus | 'ALL_FINAL';
  const fromDateIst = rawFromDateIst || rawFromDate;
  const toDateIst = rawToDateIst || rawToDate;
  const searchToken =
    rawSearchToken ??
    (rawTokenSearch !== undefined && rawTokenSearch !== '' ? Number(rawTokenSearch) : undefined);
  const effectivePageSize = limit || pageSize;

  if (!staffUser.isActive) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Staff user is inactive.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  if (!canViewBookingHistory(policyUser)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  let resolvedSalonId: string;
  let resolvedBarberId: string | undefined;

  if (staffUser.role === Role.BARBER) {
    const barber = await prisma.barber.findUnique({
      where: { userId: staffUser.id },
      select: { id: true, salonId: true, status: true, isActive: true },
    });
    if (!barber || !barber.isActive || barber.status !== VerificationStatus.VERIFIED) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Barber not verified or inactive.' };
    }
    resolvedSalonId = barber.salonId;
    resolvedBarberId = barber.id; // Barbers strictly see only their own bookings
  } else if (staffUser.role === Role.OWNER) {
    const ownerSalons = await prisma.salon.findMany({
      where: { ownerId: staffUser.id },
      select: { id: true, status: true },
    });
    if (ownerSalons.length === 0) {
      return { ok: false, code: 'NOT_FOUND', message: 'No salon found.' };
    }
    if (requestedSalonId) {
      const match = ownerSalons.find((s) => s.id === requestedSalonId);
      if (!match) {
        return { ok: false, code: 'NOT_FOUND', message: 'Salon not found.' };
      }
      resolvedSalonId = match.id;
    } else {
      resolvedSalonId = ownerSalons[0].id;
    }

    if (requestedBarberId) {
      const barberMatch = await prisma.barber.findFirst({
        where: { id: requestedBarberId, salonId: resolvedSalonId },
      });
      if (!barberMatch) {
        return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
      }
      resolvedBarberId = barberMatch.id;
    }
  } else {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  // Resolve IST date range (default last 30 days up to today)
  const todayIst = utcToIstDetails(now).dateIst;
  const effectiveToDateIst = toDateIst || todayIst;
  let effectiveFromDateIst = fromDateIst;
  if (!effectiveFromDateIst) {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    effectiveFromDateIst = utcToIstDetails(d).dateIst;
  }

  const dFrom = new Date(effectiveFromDateIst + 'T00:00:00Z');
  const dTo = new Date(effectiveToDateIst + 'T00:00:00Z');
  const diffDays = Math.round((dTo.getTime() - dFrom.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return { ok: false, code: 'INVALID_INPUT', message: 'From date cannot be after to date.' };
  }
  if (diffDays > 92) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Date range cannot exceed 92 days.' };
  }

  const dayStartUtc = istToUtcDate(effectiveFromDateIst, 0);
  const dayEndUtc = istToUtcDate(effectiveToDateIst, 1440);

  // Status filtering: only final statuses
  const finalStatuses: BookingStatus[] = [
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.REJECTED,
    BookingStatus.NO_SHOW,
  ];

  let statusFilterArray: BookingStatus[];
  if (statusFilter && statusFilter !== 'ALL_FINAL') {
    if (!finalStatuses.includes(statusFilter as BookingStatus)) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Invalid status filter for history.' };
    }
    statusFilterArray = [statusFilter as BookingStatus];
  } else {
    statusFilterArray = finalStatuses;
  }

  const whereClause: Prisma.BookingWhereInput = {
    salonId: resolvedSalonId,
    ...(resolvedBarberId ? { barberId: resolvedBarberId } : {}),
    status: { in: statusFilterArray },
    startsAt: {
      gte: dayStartUtc,
      lt: dayEndUtc,
    },
    ...(typeof searchToken === 'number' && searchToken > 0 ? { token: searchToken } : {}),
  };

  const totalCount = await prisma.booking.count({ where: whereClause });

  // Sum of totalRupees for COMPLETED bookings within the filtered range
  const completedAggregate = await prisma.booking.aggregate({
    where: {
      ...whereClause,
      status: BookingStatus.COMPLETED,
    },
    _sum: {
      totalRupees: true,
    },
  });
  const totalCompletedRupees = completedAggregate._sum.totalRupees || 0;

  const take = Math.max(1, effectivePageSize);
  const curPage = Math.max(1, page);
  const skip = (curPage - 1) * take;

  const rawBookings = await prisma.booking.findMany({
    where: whereClause,
    orderBy: { startsAt: 'desc' },
    skip,
    take,
    include: {
      barber: { select: { displayName: true } },
      customer: { select: { name: true, phone: true } },
      items: {
        include: { service: { select: { name: true, nameHi: true } } },
      },
    },
  });

  const items: HistoryBookingItem[] = rawBookings.map((b) => {
    const { dateIst } = utcToIstDetails(b.startsAt);
    const timeIst = formatIstTime(b.startsAt);
    const rawPhone = b.customer?.phone || b.walkInPhone || null;
    const customerPhoneMasked = maskPhoneForRegister(rawPhone);
    const customerName = b.walkInName || b.customer?.name || null;

    return {
      id: b.id,
      token: b.token,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      dateIst,
      timeIst,
      customerName,
      customerPhoneMasked,
      source: b.source,
      status: b.status,
      cancelReason: b.cancelReason || null,
      totalRupees: b.totalRupees,
      barberName: b.barber.displayName,
      barberId: b.barberId,
      servicesSummary: b.items.map((i) => i.service?.name || 'Service'),
    };
  });

  const totalPages = Math.ceil(totalCount / take) || 1;

  return {
    ok: true,
    data: {
      items,
      totalCount,
      totalCompletedRupees,
      page: curPage,
      pageSize: take,
      totalPages,
    },
  };
}
