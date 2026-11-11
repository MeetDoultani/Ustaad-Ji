import { prisma } from './db';
import { BookingStatus, Role, ServiceCategory, VerificationStatus } from '@prisma/client';
import { CurrentUser } from './auth-server';
import {
  canManageSalonServices,
  canManageSalonHours,
  canManageStaffBarberSchedule,
  PolicyUser,
  PolicySalon,
  PolicyBarber,
} from './policies';
import { checkRateLimit } from './rate-limit';
import { utcToIstDetails } from './time';

export type StaffConfigErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'EDIT_LIMIT'
  | 'INVALID_HOURS'
  | 'OVERLAPPING_WINDOWS'
  | 'INVALID_TIMEOFF_RANGE'
  | 'TIMEOFF_IN_PAST'
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_BARBER';

export interface StaffConfigResult<T> {
  ok: boolean;
  data?: T;
  code?: StaffConfigErrorCode;
  message?: string;
}

// 60 edit actions per staff user per hour
const STAFF_EDIT_RATE_LIMIT = 60;
const STAFF_EDIT_WINDOW_MS = 60 * 60 * 1000;

export function checkStaffEditRateLimit(
  staffUserId: string,
  nowMs: number = Date.now()
): boolean {
  const result = checkRateLimit(
    `staff_edit:${staffUserId}`,
    STAFF_EDIT_RATE_LIMIT,
    STAFF_EDIT_WINDOW_MS,
    nowMs
  );
  return result.allowed;
}

export function logStaffConfigEvent(event: {
  staffUserId: string;
  entity: string;
  entityId: string;
  action: string;
  timestamp?: string;
}): void {
  const payload = {
    event: 'STAFF_CONFIG_CHANGE',
    staffUserId: event.staffUserId,
    entity: event.entity,
    entityId: event.entityId,
    action: event.action,
    timestamp: event.timestamp || new Date().toISOString(),
  };
  console.log(JSON.stringify(payload));
}

// ============================================================================
// PURE CONFLICT DETECTION & HELPER FUNCTIONS
// ============================================================================

export interface ScheduleConflictItem {
  bookingId: string;
  tokenNumber: number;
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  reason: 'CLOSED_DAY' | 'OUTSIDE_HOURS' | 'OUTSIDE_AVAILABILITY' | 'TIME_OFF_OVERLAP';
}

/**
 * Pure conflict detection: detects future active bookings that fall on a closed day
 * or outside open/close hours under new salon hours.
 */
export function detectHoursConflicts(
  newHours: Array<{ weekday: number; openMin: number; closeMin: number; isClosed: boolean }>,
  activeBookings: Array<{
    id: string;
    token: number;
    startsAt: Date;
    endsAt: Date;
    walkInName?: string | null;
    customer?: { name: string | null } | null;
  }>
): ScheduleConflictItem[] {
  const hoursMap = new Map<number, { openMin: number; closeMin: number; isClosed: boolean }>();
  for (const h of newHours) {
    hoursMap.set(h.weekday, h);
  }

  const conflicts: ScheduleConflictItem[] = [];

  for (const b of activeBookings) {
    const startDetails = utcToIstDetails(b.startsAt);
    const endDetails = utcToIstDetails(b.endsAt);
    const schedule = hoursMap.get(startDetails.weekday);

    const customerName = b.walkInName || (b.customer ? b.customer.name : null) || null;

    if (!schedule || schedule.isClosed) {
      conflicts.push({
        bookingId: b.id,
        tokenNumber: b.token,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        customerName,
        reason: 'CLOSED_DAY',
      });
    } else if (
      startDetails.minutesFromMidnight < schedule.openMin ||
      endDetails.minutesFromMidnight > schedule.closeMin
    ) {
      conflicts.push({
        bookingId: b.id,
        tokenNumber: b.token,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        customerName,
        reason: 'OUTSIDE_HOURS',
      });
    }
  }

  return conflicts;
}

/**
 * Pure conflict detection: detects future active bookings that fall outside revised barber shifts.
 */
export function detectAvailabilityConflicts(
  newWindows: Array<{ weekday: number; startMin: number; endMin: number }>,
  activeBookings: Array<{
    id: string;
    token: number;
    startsAt: Date;
    endsAt: Date;
    walkInName?: string | null;
    customer?: { name: string | null } | null;
  }>
): ScheduleConflictItem[] {
  // Group windows by weekday
  const windowsByDay = new Map<number, Array<{ startMin: number; endMin: number }>>();
  for (const w of newWindows) {
    const list = windowsByDay.get(w.weekday) || [];
    list.push({ startMin: w.startMin, endMin: w.endMin });
    windowsByDay.set(w.weekday, list);
  }

  const conflicts: ScheduleConflictItem[] = [];

  for (const b of activeBookings) {
    const startDetails = utcToIstDetails(b.startsAt);
    const endDetails = utcToIstDetails(b.endsAt);
    const dayWindows = windowsByDay.get(startDetails.weekday) || [];

    // An appointment is valid if it completely fits within AT LEAST ONE availability window
    const fitsInWindow = dayWindows.some(
      (win) =>
        startDetails.minutesFromMidnight >= win.startMin &&
        endDetails.minutesFromMidnight <= win.endMin
    );

    if (!fitsInWindow) {
      const customerName = b.walkInName || (b.customer ? b.customer.name : null) || null;
      conflicts.push({
        bookingId: b.id,
        tokenNumber: b.token,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        customerName,
        reason: 'OUTSIDE_AVAILABILITY',
      });
    }
  }

  return conflicts;
}

/**
 * Pure conflict detection: detects future active bookings that overlap with a time-off window.
 */
export function detectTimeOffConflicts(
  timeOff: { startsAt: Date; endsAt: Date },
  activeBookings: Array<{
    id: string;
    token: number;
    startsAt: Date;
    endsAt: Date;
    walkInName?: string | null;
    customer?: { name: string | null } | null;
  }>
): ScheduleConflictItem[] {
  const conflicts: ScheduleConflictItem[] = [];

  for (const b of activeBookings) {
    // Overlap condition: startsAt < timeOff.endsAt && endsAt > timeOff.startsAt
    if (b.startsAt < timeOff.endsAt && b.endsAt > timeOff.startsAt) {
      const customerName = b.walkInName || (b.customer ? b.customer.name : null) || null;
      conflicts.push({
        bookingId: b.id,
        tokenNumber: b.token,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        customerName,
        reason: 'TIME_OFF_OVERLAP',
      });
    }
  }

  return conflicts;
}

// ============================================================================
// 1. SERVICES AND RATE CARD MANAGEMENT
// ============================================================================

export interface ServiceInput {
  category: ServiceCategory;
  name: string;
  nameHi?: string | null;
  durationMin: number;
  priceRupees: number;
  isActive?: boolean;
  barberIds?: string[];
}

export async function getSalonServicesStaff(
  staffUser: CurrentUser,
  salonId: string
): Promise<StaffConfigResult<{
  services: Array<{
    id: string;
    salonId: string;
    category: ServiceCategory;
    name: string;
    nameHi: string | null;
    durationMin: number;
    priceRupees: number;
    isActive: boolean;
    sortOrder: number;
    barberIds: string[];
  }>;
  barbers: Array<{
    id: string;
    displayName: string;
    isActive: boolean;
    status: VerificationStatus;
  }>;
}>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can manage services.' };
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

  const [services, barbers] = await Promise.all([
    prisma.service.findMany({
      where: { salonId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        barbers: {
          select: { barberId: true },
        },
      },
    }),
    prisma.barber.findMany({
      where: {
        salonId,
        status: VerificationStatus.VERIFIED,
        isActive: true,
      },
      select: {
        id: true,
        displayName: true,
        isActive: true,
        status: true,
      },
      orderBy: { displayName: 'asc' },
    }),
  ]);

  return {
    ok: true,
    data: {
      services: services.map((s) => ({
        id: s.id,
        salonId: s.salonId,
        category: s.category,
        name: s.name,
        nameHi: s.nameHi,
        durationMin: s.durationMin,
        priceRupees: s.priceRupees,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        barberIds: s.barbers.map((b) => b.barberId),
      })),
      barbers,
    },
  };
}

export async function createServiceStaff(
  staffUser: CurrentUser,
  salonId: string,
  input: ServiceInput,
  now: Date = new Date()
): Promise<StaffConfigResult<{ id: string }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can create services.' };
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
  if (!canManageSalonServices(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Input validation
  const trimmedName = input.name ? input.name.trim() : '';
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Name must be between 2 and 60 characters.' };
  }

  if (
    !Number.isInteger(input.priceRupees) ||
    input.priceRupees < 1 ||
    input.priceRupees > 50000
  ) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Price must be an integer between 1 and 50000.' };
  }

  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < 15 ||
    input.durationMin > 240 ||
    input.durationMin % 15 !== 0
  ) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Duration must be a multiple of 15 between 15 and 240 minutes.' };
  }

  // Count existing services (max 60)
  const existingCount = await prisma.service.count({ where: { salonId } });
  if (existingCount >= 60) {
    return { ok: false, code: 'LIMIT_EXCEEDED', message: 'Maximum 60 services allowed per salon.' };
  }

  // Next sortOrder
  const lastService = await prisma.service.findFirst({
    where: { salonId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const nextSortOrder = (lastService?.sortOrder ?? 0) + 1;

  // Filter valid barbers of this salon
  let validBarberIds: string[] = [];
  if (input.barberIds && input.barberIds.length > 0) {
    const activeBarbers = await prisma.barber.findMany({
      where: {
        id: { in: input.barberIds },
        salonId,
        status: VerificationStatus.VERIFIED,
        isActive: true,
      },
      select: { id: true },
    });
    if (activeBarbers.length !== input.barberIds.length) {
      return { ok: false, code: 'INVALID_BARBER', message: 'One or more selected barbers are invalid or not active in this salon.' };
    }
    validBarberIds = activeBarbers.map((b) => b.id);
  }

  const created = await prisma.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        salonId,
        category: input.category,
        name: trimmedName,
        nameHi: input.nameHi ? input.nameHi.trim() : null,
        priceRupees: input.priceRupees,
        durationMin: input.durationMin,
        isActive: input.isActive !== undefined ? input.isActive : true,
        sortOrder: nextSortOrder,
      },
    });

    if (validBarberIds.length > 0) {
      await tx.barberService.createMany({
        data: validBarberIds.map((bId) => ({
          barberId: bId,
          serviceId: service.id,
        })),
      });
    }

    return service;
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Service',
    entityId: created.id,
    action: 'CREATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: created.id } };
}

export async function updateServiceStaff(
  staffUser: CurrentUser,
  salonId: string,
  serviceId: string,
  input: ServiceInput,
  now: Date = new Date()
): Promise<StaffConfigResult<{ id: string }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can update services.' };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { salon: { select: { id: true, ownerId: true, status: true } } },
  });

  if (!service || service.salonId !== salonId || service.salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Service not found.' };
  }

  if (service.salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: service.salon.id, ownerId: service.salon.ownerId };
  if (!canManageSalonServices(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  const trimmedName = input.name ? input.name.trim() : '';
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Name must be between 2 and 60 characters.' };
  }

  if (
    !Number.isInteger(input.priceRupees) ||
    input.priceRupees < 1 ||
    input.priceRupees > 50000
  ) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Price must be an integer between 1 and 50000.' };
  }

  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < 15 ||
    input.durationMin > 240 ||
    input.durationMin % 15 !== 0
  ) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Duration must be a multiple of 15 between 15 and 240 minutes.' };
  }

  // Filter valid barbers of this salon
  let validBarberIds: string[] | null = null;
  if (input.barberIds !== undefined) {
    if (input.barberIds.length > 0) {
      const activeBarbers = await prisma.barber.findMany({
        where: {
          id: { in: input.barberIds },
          salonId,
          status: VerificationStatus.VERIFIED,
          isActive: true,
        },
        select: { id: true },
      });
      if (activeBarbers.length !== input.barberIds.length) {
        return { ok: false, code: 'INVALID_BARBER', message: 'One or more selected barbers are invalid or not active in this salon.' };
      }
      validBarberIds = activeBarbers.map((b) => b.id);
    } else {
      validBarberIds = [];
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id: serviceId },
      data: {
        category: input.category,
        name: trimmedName,
        nameHi: input.nameHi !== undefined ? (input.nameHi ? input.nameHi.trim() : null) : undefined,
        priceRupees: input.priceRupees,
        durationMin: input.durationMin,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
      },
    });

    if (validBarberIds !== null) {
      await tx.barberService.deleteMany({ where: { serviceId } });
      if (validBarberIds.length > 0) {
        await tx.barberService.createMany({
          data: validBarberIds.map((bId) => ({
            barberId: bId,
            serviceId,
          })),
        });
      }
    }
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Service',
    entityId: serviceId,
    action: 'UPDATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: serviceId } };
}

export async function setBarberServicesStaff(
  staffUser: CurrentUser,
  salonId: string,
  serviceId: string,
  barberIds: string[],
  now: Date = new Date()
): Promise<StaffConfigResult<{ count: number }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can assign barbers to services.' };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { salon: { select: { id: true, ownerId: true, status: true } } },
  });

  if (!service || service.salonId !== salonId || service.salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Service not found.' };
  }

  if (service.salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: service.salon.id, ownerId: service.salon.ownerId };
  if (!canManageSalonServices(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  if (barberIds.length > 0) {
    const activeBarbers = await prisma.barber.findMany({
      where: {
        id: { in: barberIds },
        salonId,
        status: VerificationStatus.VERIFIED,
        isActive: true,
      },
      select: { id: true },
    });

    if (activeBarbers.length !== barberIds.length) {
      return {
        ok: false,
        code: 'INVALID_BARBER',
        message: 'Passing a barber from another salon, or an unverified/inactive barber, is rejected.',
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.barberService.deleteMany({ where: { serviceId } });
    if (barberIds.length > 0) {
      await tx.barberService.createMany({
        data: barberIds.map((bId) => ({ barberId: bId, serviceId })),
      });
    }
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'BarberService',
    entityId: serviceId,
    action: 'SET_BARBERS',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { count: barberIds.length } };
}

export async function toggleServiceActiveStaff(
  staffUser: CurrentUser,
  salonId: string,
  serviceId: string,
  isActive: boolean,
  now: Date = new Date()
): Promise<StaffConfigResult<{ id: string; isActive: boolean }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can toggle service status.' };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { salon: { select: { id: true, ownerId: true, status: true } } },
  });

  if (!service || service.salonId !== salonId || service.salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Service not found.' };
  }

  if (service.salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: service.salon.id, ownerId: service.salon.ownerId };
  if (!canManageSalonServices(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: { isActive },
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Service',
    entityId: serviceId,
    action: isActive ? 'ACTIVATE' : 'SOFT_DELETE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: serviceId, isActive } };
}

export async function reorderServicesStaff(
  staffUser: CurrentUser,
  salonId: string,
  serviceId: string,
  direction: 'UP' | 'DOWN',
  now: Date = new Date()
): Promise<StaffConfigResult<{ ok: true }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can reorder services.' };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { salon: { select: { id: true, ownerId: true, status: true } } },
  });

  if (!service || service.salonId !== salonId || service.salon.ownerId !== staffUser.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Service not found.' };
  }

  if (service.salon.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Salon is not verified.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policySalon: PolicySalon = { id: service.salon.id, ownerId: service.salon.ownerId };
  if (!canManageSalonServices(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Get all services of this salon sorted by sortOrder asc
  const allServices = await prisma.service.findMany({
    where: { salonId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, sortOrder: true },
  });

  const currentIndex = allServices.findIndex((s) => s.id === serviceId);
  if (currentIndex === -1) {
    return { ok: false, code: 'NOT_FOUND', message: 'Service not found.' };
  }

  const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= allServices.length) {
    // Already at the boundary, nothing to move
    return { ok: true, data: { ok: true } };
  }

  const currentItem = allServices[currentIndex];
  const targetItem = allServices[targetIndex];

  // Swap their sortOrder atomically
  await prisma.$transaction([
    prisma.service.update({
      where: { id: currentItem.id },
      data: { sortOrder: targetItem.sortOrder },
    }),
    prisma.service.update({
      where: { id: targetItem.id },
      data: { sortOrder: currentItem.sortOrder },
    }),
  ]);

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Service',
    entityId: serviceId,
    action: `REORDER_${direction}`,
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { ok: true } };
}



// ============================================================================
// 2. SALON OPENING HOURS MANAGEMENT
// ============================================================================

export interface SalonHoursDayInput {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  openMin: number;
  closeMin: number;
  isClosed: boolean;
}

export async function getSalonHoursStaff(
  staffUser: CurrentUser,
  salonId: string
): Promise<StaffConfigResult<SalonHoursDayInput[]>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can view salon hours.' };
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

  const existingHours = await prisma.salonHours.findMany({
    where: { salonId },
    select: { weekday: true, openMin: true, closeMin: true, isClosed: true },
  });

  const hoursMap = new Map<number, SalonHoursDayInput>();
  for (const h of existingHours) {
    hoursMap.set(h.weekday, h);
  }

  // Ensure all 7 weekdays exist (default: 9:00 AM - 9:00 PM / 540 - 1260, open)
  const result: SalonHoursDayInput[] = [];
  for (let d = 0; d < 7; d++) {
    const existing = hoursMap.get(d);
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        weekday: d,
        openMin: 540,
        closeMin: 1260,
        isClosed: false,
      });
    }
  }

  return { ok: true, data: result };
}

export async function updateSalonHoursStaff(
  staffUser: CurrentUser,
  salonId: string,
  hoursInput: SalonHoursDayInput[],
  now: Date = new Date()
): Promise<StaffConfigResult<{ conflicts: ScheduleConflictItem[] }>> {
  if (staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only salon owners can update salon hours.' };
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
  if (!canManageSalonHours(policyUser, policySalon)) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Validate 7 weekdays
  if (!Array.isArray(hoursInput) || hoursInput.length !== 7) {
    return { ok: false, code: 'INVALID_HOURS', message: 'Hours must be specified for all 7 weekdays.' };
  }

  const weekdaysSeen = new Set<number>();
  for (const day of hoursInput) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6) {
      return { ok: false, code: 'INVALID_HOURS', message: 'Invalid weekday specified.' };
    }
    if (weekdaysSeen.has(day.weekday)) {
      return { ok: false, code: 'INVALID_HOURS', message: 'Duplicate weekday in hours.' };
    }
    weekdaysSeen.add(day.weekday);

    if (
      !Number.isInteger(day.openMin) ||
      !Number.isInteger(day.closeMin) ||
      day.openMin < 0 ||
      day.openMin > 1440 ||
      day.closeMin < 0 ||
      day.closeMin > 1440 ||
      day.openMin % 15 !== 0 ||
      day.closeMin % 15 !== 0
    ) {
      return { ok: false, code: 'INVALID_HOURS', message: 'Hours must be on 15-minute intervals between 0 and 1440.' };
    }

    if (!day.isClosed && day.closeMin <= day.openMin) {
      return { ok: false, code: 'INVALID_HOURS', message: 'Close time must be after open time.' };
    }
  }

  // Single interactive transaction upserting all 7 days
  await prisma.$transaction(
    hoursInput.map((day) =>
      prisma.salonHours.upsert({
        where: {
          salonId_weekday: {
            salonId,
            weekday: day.weekday,
          },
        },
        update: {
          openMin: day.openMin,
          closeMin: day.closeMin,
          isClosed: day.isClosed,
        },
        create: {
          salonId,
          weekday: day.weekday,
          openMin: day.openMin,
          closeMin: day.closeMin,
          isClosed: day.isClosed,
        },
      })
    )
  );

  // Pure conflict detection against future active bookings
  const futureActiveBookings = await prisma.booking.findMany({
    where: {
      salonId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS] },
      startsAt: { gte: now },
    },
    select: {
      id: true,
      token: true,
      startsAt: true,
      endsAt: true,
      walkInName: true,
      customer: { select: { name: true } },
    },
  });

  const conflicts = detectHoursConflicts(hoursInput, futureActiveBookings);

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'SalonHours',
    entityId: salonId,
    action: 'UPDATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { conflicts } };
}

// ============================================================================
// 3. BARBER AVAILABILITY MANAGEMENT
// ============================================================================

export interface AvailabilityWindowInput {
  weekday: number;
  startMin: number;
  endMin: number;
}

export async function getBarberAvailabilityStaff(
  staffUser: CurrentUser,
  barberId: string
): Promise<StaffConfigResult<{
  barber: { id: string; displayName: string; salonId: string };
  salonHours: SalonHoursDayInput[];
  windows: AvailabilityWindowInput[];
}>> {
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        select: {
          id: true,
          ownerId: true,
          status: true,
          hours: {
            select: { weekday: true, openMin: true, closeMin: true, isClosed: true },
          },
        },
      },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canManageStaffBarberSchedule(policyUser, policyBarber)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || barber.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Barber or salon is not verified.' };
  }

  const windows = await prisma.availability.findMany({
    where: { barberId },
    orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    select: { weekday: true, startMin: true, endMin: true },
  });

  return {
    ok: true,
    data: {
      barber: { id: barber.id, displayName: barber.displayName, salonId: barber.salonId },
      salonHours: barber.salon.hours,
      windows,
    },
  };
}

export async function updateBarberAvailabilityStaff(
  staffUser: CurrentUser,
  barberId: string,
  windowsInput: AvailabilityWindowInput[],
  now: Date = new Date()
): Promise<StaffConfigResult<{ conflicts: ScheduleConflictItem[] }>> {
  if (staffUser.role !== Role.BARBER && staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only barbers and salon owners can manage barber schedules.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canManageStaffBarberSchedule(policyUser, policyBarber)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || barber.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Barber or salon is not verified.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Validate windows
  const countByDay = new Map<number, number>();
  const windowsByDay = new Map<number, AvailabilityWindowInput[]>();

  for (const win of windowsInput) {
    if (!Number.isInteger(win.weekday) || win.weekday < 0 || win.weekday > 6) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Invalid weekday.' };
    }

    if (
      !Number.isInteger(win.startMin) ||
      !Number.isInteger(win.endMin) ||
      win.startMin < 0 ||
      win.startMin > 1440 ||
      win.endMin < 0 ||
      win.endMin > 1440 ||
      win.startMin % 15 !== 0 ||
      win.endMin % 15 !== 0
    ) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Window times must be multiples of 15 between 0 and 1440.' };
    }

    if (win.endMin <= win.startMin) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Window end must be strictly after start.' };
    }

    const currentCount = countByDay.get(win.weekday) || 0;
    if (currentCount >= 4) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Maximum 4 windows allowed per day.' };
    }
    countByDay.set(win.weekday, currentCount + 1);

    const dayWindows = windowsByDay.get(win.weekday) || [];
    // Check overlap with existing windows on this weekday
    for (const existing of dayWindows) {
      if (win.startMin < existing.endMin && win.endMin > existing.startMin) {
        return { ok: false, code: 'OVERLAPPING_WINDOWS', message: 'Availability windows on the same day cannot overlap.' };
      }
    }
    dayWindows.push(win);
    windowsByDay.set(win.weekday, dayWindows);
  }

  // Concurrency-safe atomic replacement with row locking
  await prisma.$transaction(async (tx) => {
    // Explicit row lock on target Barber record
    await tx.$queryRaw`SELECT id FROM "Barber" WHERE id = ${barberId} FOR UPDATE;`;

    // Delete existing windows
    await tx.availability.deleteMany({
      where: { barberId },
    });

    // Insert replacement windows
    if (windowsInput.length > 0) {
      await tx.availability.createMany({
        data: windowsInput.map((w) => ({
          barberId,
          weekday: w.weekday,
          startMin: w.startMin,
          endMin: w.endMin,
        })),
      });
    }
  });

  // Non-blocking conflict check against future active bookings
  const futureActiveBookings = await prisma.booking.findMany({
    where: {
      barberId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS] },
      startsAt: { gte: now },
    },
    select: {
      id: true,
      token: true,
      startsAt: true,
      endsAt: true,
      walkInName: true,
      customer: { select: { name: true } },
    },
  });

  const conflicts = detectAvailabilityConflicts(windowsInput, futureActiveBookings);

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'Availability',
    entityId: barberId,
    action: 'UPDATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { conflicts } };
}

// ============================================================================
// 4. TIME OFF MANAGEMENT
// ============================================================================

export interface TimeOffInput {
  startsAt: Date;
  endsAt: Date;
  reason?: string | null;
}

export async function getBarberTimeOffStaff(
  staffUser: CurrentUser,
  barberId: string,
  now: Date = new Date()
): Promise<StaffConfigResult<Array<{
  id: string;
  barberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}>>> {
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canManageStaffBarberSchedule(policyUser, policyBarber)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || barber.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Barber or salon is not verified.' };
  }

  const timeOffList = await prisma.timeOff.findMany({
    where: {
      barberId,
      endsAt: { gte: now },
    },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      barberId: true,
      startsAt: true,
      endsAt: true,
      reason: true,
    },
  });

  return {
    ok: true,
    data: timeOffList.map((t) => ({
      id: t.id,
      barberId: t.barberId,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      reason: t.reason,
    })),
  };
}

export async function createBarberTimeOffStaff(
  staffUser: CurrentUser,
  barberId: string,
  input: TimeOffInput,
  now: Date = new Date()
): Promise<StaffConfigResult<{ id: string; conflicts: ScheduleConflictItem[] }>> {
  if (staffUser.role !== Role.BARBER && staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only barbers and salon owners can manage barber schedules.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canManageStaffBarberSchedule(policyUser, policyBarber)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || barber.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Barber or salon is not verified.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  // Validation
  if (input.endsAt <= input.startsAt) {
    return { ok: false, code: 'INVALID_TIMEOFF_RANGE', message: 'End time must be after start time.' };
  }

  if (input.endsAt <= now) {
    return { ok: false, code: 'TIMEOFF_IN_PAST', message: 'End time must be in the future.' };
  }

  const maxDurationMs = 90 * 24 * 60 * 60 * 1000;
  if (input.endsAt.getTime() - input.startsAt.getTime() > maxDurationMs) {
    return { ok: false, code: 'INVALID_TIMEOFF_RANGE', message: 'Time-off duration cannot exceed 90 days.' };
  }

  const reasonTrimmed = input.reason ? input.reason.trim() : null;
  if (reasonTrimmed && reasonTrimmed.length > 100) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Reason must be at most 100 characters.' };
  }

  // Max 50 future time-off entries
  const futureEntriesCount = await prisma.timeOff.count({
    where: {
      barberId,
      endsAt: { gte: now },
    },
  });
  if (futureEntriesCount >= 50) {
    return { ok: false, code: 'LIMIT_EXCEEDED', message: 'Maximum 50 future time-off entries allowed.' };
  }

  const created = await prisma.timeOff.create({
    data: {
      barberId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: reasonTrimmed,
    },
  });

  // Non-blocking conflict check against future active bookings
  const overlappingBookings = await prisma.booking.findMany({
    where: {
      barberId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: {
      id: true,
      token: true,
      startsAt: true,
      endsAt: true,
      walkInName: true,
      customer: { select: { name: true } },
    },
  });

  const conflicts = detectTimeOffConflicts(input, overlappingBookings);

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'TimeOff',
    entityId: created.id,
    action: 'CREATE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { id: created.id, conflicts } };
}

export async function deleteBarberTimeOffStaff(
  staffUser: CurrentUser,
  barberId: string,
  timeOffId: string,
  now: Date = new Date()
): Promise<StaffConfigResult<{ ok: true }>> {
  if (staffUser.role !== Role.BARBER && staffUser.role !== Role.OWNER) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Only barbers and salon owners can manage barber schedules.' };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        select: {
          id: true,
          ownerId: true,
          status: true,
        },
      },
    },
  });

  if (!barber) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  const policyUser: PolicyUser = { id: staffUser.id, role: staffUser.role, isActive: staffUser.isActive };
  const policyBarber: PolicyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canManageStaffBarberSchedule(policyUser, policyBarber)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Barber not found.' };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED || barber.status !== VerificationStatus.VERIFIED) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Barber or salon is not verified.' };
  }

  const timeOff = await prisma.timeOff.findUnique({
    where: { id: timeOffId },
  });

  if (!timeOff || timeOff.barberId !== barberId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Time-off record not found.' };
  }

  if (!checkStaffEditRateLimit(staffUser.id, now.getTime())) {
    return { ok: false, code: 'EDIT_LIMIT', message: 'Staff edit rate limit exceeded.' };
  }

  await prisma.timeOff.delete({
    where: { id: timeOffId },
  });

  logStaffConfigEvent({
    staffUserId: staffUser.id,
    entity: 'TimeOff',
    entityId: timeOffId,
    action: 'DELETE',
    timestamp: now.toISOString(),
  });

  return { ok: true, data: { ok: true } };
}

// ============================================================================
// EXPORT ALIASES (Matching prompt terminology)
// ============================================================================
export const createService = createServiceStaff;
export const updateService = updateServiceStaff;
export const toggleServiceActive = toggleServiceActiveStaff;
export const reorderServices = reorderServicesStaff;
export const setBarberServices = setBarberServicesStaff;
export const saveSalonHours = updateSalonHoursStaff;
export const saveBarberAvailability = updateBarberAvailabilityStaff;
export const createTimeOff = createBarberTimeOffStaff;
export const deleteTimeOff = deleteBarberTimeOffStaff;



