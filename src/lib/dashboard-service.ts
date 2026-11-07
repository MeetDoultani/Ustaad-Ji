import { prisma } from './db';
import { BookingStatus, BookingSource, Role, VerificationStatus, Prisma } from '@prisma/client';
import { CurrentUser } from './auth-server';
import {
  canUpdateBookingStatus,
  canCreateWalkIn,
  PolicyUser,
  PolicyBooking,
} from './policies';
import {
  validateBookingTransition,
  StatusTransitionErrorCode,
} from './booking-status';
import { cancelBooking } from './booking-service';
import {
  utcToIstDetails,
  istToUtcDate,
  toTokenDateUtc,
} from './time';
import { generateSlots } from './slots';
import { SLOT_GRID_MIN } from './booking-config';

export type StaffDashboardErrorCode =
  | StatusTransitionErrorCode
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'NO_FREE_TIME'
  | 'RATE_LIMIT_EXCEEDED'
  | 'WALKIN_LIMIT'
  | 'SERVICE_MISMATCH'
  | 'SERVICE_INACTIVE'
  | 'BARBER_SERVICE_MISMATCH'
  | 'INVALID_INPUT'
  | 'CHAIR_BUSY'
  | 'NO_SHOW_TOO_EARLY';

// In-memory staff walk-in rate tracker (staffUserId -> array of timestamps in ms)
// Note: As documented in docs/decisions.md, this must move to a shared store (e.g. Upstash Redis) in multi-instance production.
const staffWalkInRateHistory = new Map<string, number[]>();

export function checkStaffWalkInRateLimit(staffUserId: string, nowMs: number = Date.now()): boolean {
  const oneHourAgo = nowMs - 60 * 60 * 1000;
  const history = staffWalkInRateHistory.get(staffUserId) || [];
  const validHistory = history.filter((ts) => ts > oneHourAgo);
  if (validHistory.length >= 60) {
    return false;
  }
  validHistory.push(nowMs);
  staffWalkInRateHistory.set(staffUserId, validHistory);
  return true;
}

export function resetStaffWalkInRateLimitForTesting(staffUserId?: string): void {
  if (staffUserId) {
    staffWalkInRateHistory.delete(staffUserId);
  } else {
    staffWalkInRateHistory.clear();
  }
}

/**
 * Masks phone number on server for register ledger list: +91 ******3210
 * Full phone numbers are ONLY ever returned in getBookingDetailStaff for authorized staff.
 */
export function maskPhoneForRegister(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const clean = rawPhone.trim();
  if (clean.length <= 7) return clean;
  const last4 = clean.slice(-4);
  const prefix = clean.startsWith('+91') ? '+91 ' : clean.length > 10 ? clean.slice(0, 3) + ' ' : '';
  return `${prefix}******${last4}`;
}

export interface DashboardServiceResult<T> {
  ok: boolean;
  data?: T;
  code?: StaffDashboardErrorCode;
  message?: string;
}

export type StaffContextResult =
  | {
      ok: true;
      role: 'BARBER' | 'OWNER';
      salon: {
        id: string;
        name: string;
        nameHi: string | null;
        slug: string;
        status: VerificationStatus;
      };
      barber?: {
        id: string;
        displayName: string;
        status: VerificationStatus;
        isActive: boolean;
      };
      salons?: Array<{
        id: string;
        name: string;
        nameHi: string | null;
        slug: string;
        status: VerificationStatus;
      }>;
      barbers: Array<{
        id: string;
        displayName: string;
        status: VerificationStatus;
        isActive: boolean;
      }>;
    }
  | {
      ok: false;
      state: 'AWAITING_VERIFICATION' | 'SUSPENDED' | 'NOT_STAFF';
      message: string;
    };

/**
 * Loads staff context and enforces scoping and verification status:
 * - A barber belongs to their barber profile and assigned salon.
 * - An owner owns one or more salons; if multi-salon, allows selecting via requestedSalonId.
 * - Both salon and barber must be VERIFIED. If PENDING, SUSPENDED, or REJECTED, returns state indication.
 */
export async function getStaffDashboardContext(
  user: CurrentUser,
  requestedSalonId?: string
): Promise<StaffContextResult> {
  if (user.role === Role.BARBER) {
    const barber = await prisma.barber.findUnique({
      where: { userId: user.id },
      include: {
        salon: true,
      },
    });

    if (!barber) {
      return {
        ok: false,
        state: 'AWAITING_VERIFICATION',
        message: 'No barber profile found for your account.',
      };
    }

    if (
      barber.status === VerificationStatus.SUSPENDED ||
      barber.salon.status === VerificationStatus.SUSPENDED
    ) {
      return {
        ok: false,
        state: 'SUSPENDED',
        message: 'Your barber profile or salon has been suspended.',
      };
    }

    if (
      barber.status !== VerificationStatus.VERIFIED ||
      !barber.isActive ||
      barber.salon.status !== VerificationStatus.VERIFIED
    ) {
      return {
        ok: false,
        state: 'AWAITING_VERIFICATION',
        message: 'Your barber profile or salon is awaiting admin verification.',
      };
    }

    return {
      ok: true,
      role: 'BARBER',
      salon: {
        id: barber.salon.id,
        name: barber.salon.name,
        nameHi: barber.salon.nameHi,
        slug: barber.salon.slug,
        status: barber.salon.status,
      },
      barber: {
        id: barber.id,
        displayName: barber.displayName,
        status: barber.status,
        isActive: barber.isActive,
      },
      barbers: [
        {
          id: barber.id,
          displayName: barber.displayName,
          status: barber.status,
          isActive: barber.isActive,
        },
      ],
    };
  }

  if (user.role === Role.OWNER) {
    const salons = await prisma.salon.findMany({
      where: { ownerId: user.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        nameHi: true,
        slug: true,
        status: true,
      },
    });

    if (salons.length === 0) {
      return {
        ok: false,
        state: 'AWAITING_VERIFICATION',
        message: 'No salons registered under your account.',
      };
    }

    // Selected salon resolution: validate requestedSalonId or pick first
    const selectedSalon =
      (requestedSalonId && salons.find((s) => s.id === requestedSalonId)) || salons[0];

    if (selectedSalon.status === VerificationStatus.SUSPENDED) {
      return {
        ok: false,
        state: 'SUSPENDED',
        message: 'This salon has been suspended.',
      };
    }

    if (selectedSalon.status !== VerificationStatus.VERIFIED) {
      return {
        ok: false,
        state: 'AWAITING_VERIFICATION',
        message: 'This salon is awaiting admin verification.',
      };
    }

    // Load active & verified barbers for the salon
    const barbers = await prisma.barber.findMany({
      where: {
        salonId: selectedSalon.id,
        status: VerificationStatus.VERIFIED,
        isActive: true,
      },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        status: true,
        isActive: true,
      },
    });

    return {
      ok: true,
      role: 'OWNER',
      salon: selectedSalon,
      salons,
      barbers,
    };
  }

  return {
    ok: false,
    state: 'NOT_STAFF',
    message: 'Staff dashboard is reserved for barbers and salon owners.',
  };
}

export interface RegisterSummary {
  todayTokens: number;
  waiting: number;
  inChair: number;
  done: number;
  cancelledNoShow: number;
  earningsRupees: number;
}

export interface RegisterBookingItem {
  id: string;
  token: number;
  status: BookingStatus;
  source: BookingSource;
  startsAt: Date;
  endsAt: Date;
  totalRupees: number;
  customerName: string | null;
  customerPhone: string | null;
  barberId: string;
  barberName: string;
  services: Array<{
    id: string;
    name: string;
    nameHi: string | null;
    durationMin: number;
    priceRupees: number;
  }>;
  checkedInAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  notes: string | null;
}

/**
 * Fetch register bookings and summary counts for a salon on a given IST date.
 * Server strictly enforces scoping:
 * - Barbers see only bookings assigned to their barber profile.
 * - Owners see bookings for their verified salon, optionally filtered by barberId.
 */
export async function getRegisterBookings(params: {
  staffUser: CurrentUser;
  salonId: string;
  barberId?: string;
  dateIst: string;
  now?: Date;
}): Promise<
  DashboardServiceResult<{
    bookings: RegisterBookingItem[];
    summary: RegisterSummary;
    nextCustomer: RegisterBookingItem | null;
  }>
> {
  const { staffUser, salonId, barberId, dateIst } = params;

  // Validate staff context
  const context = await getStaffDashboardContext(staffUser, salonId);
  if (!context.ok) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: context.message,
    };
  }

  // Cross-salon security check: Return 404 (NOT_FOUND) if accessing someone else's salon
  if (context.salon.id !== salonId) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Salon not found.',
    };
  }

  // Enforce Barber scoping: Barbers CANNOT query any other barber's bookings
  let effectiveBarberId: string | undefined = barberId;
  if (context.role === 'BARBER') {
    effectiveBarberId = context.barber?.id;
  }

  // Convert IST calendar day to UTC range
  const dayStartUtc = istToUtcDate(dateIst, 0);
  const dayEndUtc = istToUtcDate(dateIst, 1440);

  const rawBookings = await prisma.booking.findMany({
    where: {
      salonId,
      ...(effectiveBarberId ? { barberId: effectiveBarberId } : {}),
      startsAt: {
        gte: dayStartUtc,
        lt: dayEndUtc,
      },
    },
    orderBy: { startsAt: 'asc' },
    include: {
      items: {
        include: {
          service: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      barber: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  const bookings: RegisterBookingItem[] = rawBookings.map((b) => {
    const customerName =
      b.source === BookingSource.WALK_IN
        ? (b.walkInName?.trim() || null)
        : (b.customer?.name?.trim() || null);

    const rawCustomerPhone =
      b.source === BookingSource.WALK_IN ? b.walkInPhone : b.customer?.phone || null;
    const customerPhone = maskPhoneForRegister(rawCustomerPhone);

    return {
      id: b.id,
      token: b.token,
      status: b.status,
      source: b.source,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      totalRupees: b.totalRupees,
      customerName,
      customerPhone,
      barberId: b.barberId,
      barberName: b.barber.displayName,
      services: b.items.map((item) => ({
        id: item.service.id,
        name: item.service.name,
        nameHi: item.service.nameHi,
        durationMin: item.durationMin,
        priceRupees: item.priceRupees,
      })),
      checkedInAt: b.checkedInAt,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      cancelledAt: b.cancelledAt,
      cancelReason: b.cancelReason,
      notes: b.notes,
    };
  });

  // Calculate summary counts
  const summary: RegisterSummary = {
    todayTokens: bookings.length,
    waiting: bookings.filter(
      (b) => b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.CHECKED_IN
    ).length,
    inChair: bookings.filter((b) => b.status === BookingStatus.IN_PROGRESS).length,
    done: bookings.filter((b) => b.status === BookingStatus.COMPLETED).length,
    cancelledNoShow: bookings.filter(
      (b) => b.status === BookingStatus.CANCELLED || b.status === BookingStatus.NO_SHOW
    ).length,
    earningsRupees: bookings
      .filter((b) => b.status === BookingStatus.COMPLETED)
      .reduce((sum, b) => sum + b.totalRupees, 0),
  };

  // Next customer: earliest CHECKED_IN booking, or fallback to earliest CONFIRMED
  // Only eligible if the register being viewed is today's register (dateIst === todayDateIst)
  const effectiveNow = params.now || new Date();
  const todayDateIst = utcToIstDetails(effectiveNow).dateIst;
  let nextCustomer: RegisterBookingItem | null = null;
  if (dateIst === todayDateIst) {
    const checkedInList = bookings.filter((b) => b.status === BookingStatus.CHECKED_IN);
    const confirmedList = bookings.filter((b) => b.status === BookingStatus.CONFIRMED);
    nextCustomer = checkedInList.length > 0 ? checkedInList[0] : confirmedList[0] || null;
  }

  return {
    ok: true,
    data: {
      bookings,
      summary,
      nextCustomer,
    },
  };
}

/**
 * Staff booking detail query with scoping protection.
 * Returns full customer phone and details for staff of this salon.
 * Returns 404 (NOT_FOUND) for records belonging to another salon.
 */
export async function getBookingDetailStaff(params: {
  staffUser: CurrentUser;
  bookingId: string;
}): Promise<DashboardServiceResult<RegisterBookingItem & { salonSlug: string; salonName: string }>> {
  const { staffUser, bookingId } = params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { service: true } },
      customer: true,
      barber: true,
      salon: true,
    },
  });

  if (!booking) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Verify staff context
  const context = await getStaffDashboardContext(staffUser, booking.salonId);
  if (!context.ok) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Cross-salon security check: 404 for records outside staff salon
  if (booking.salonId !== context.salon.id) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Barber scope check
  if (context.role === 'BARBER' && context.barber?.id !== booking.barberId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  const customerName =
    booking.source === BookingSource.WALK_IN
      ? (booking.walkInName?.trim() || null)
      : (booking.customer?.name?.trim() || null);

  const customerPhone =
    booking.source === BookingSource.WALK_IN
      ? booking.walkInPhone
      : booking.customer?.phone || null;

  return {
    ok: true,
    data: {
      id: booking.id,
      token: booking.token,
      status: booking.status,
      source: booking.source,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      totalRupees: booking.totalRupees,
      customerName,
      customerPhone,
      barberId: booking.barberId,
      barberName: booking.barber.displayName,
      salonSlug: booking.salon.slug,
      salonName: booking.salon.name,
      services: booking.items.map((item) => ({
        id: item.service.id,
        name: item.service.name,
        nameHi: item.service.nameHi,
        durationMin: item.durationMin,
        priceRupees: item.priceRupees,
      })),
      checkedInAt: booking.checkedInAt,
      startedAt: booking.startedAt,
      completedAt: booking.completedAt,
      cancelledAt: booking.cancelledAt,
      cancelReason: booking.cancelReason,
      notes: booking.notes,
    },
  };
}

/**
 * Execute a booking status transition requested by staff.
 * - Atomic conditional update: updateMany where id and status = expectedStatus
 * - Detects race condition and returns STATUS_CONFLICT if already changed
 * - Logs structured line without phone numbers
 */
export async function updateBookingStatusStaff(params: {
  staffUser: CurrentUser;
  bookingId: string;
  expectedStatus: BookingStatus;
  newStatus: BookingStatus;
  cancelReason?: string;
  now?: Date;
}): Promise<DashboardServiceResult<{ id: string; status: BookingStatus }>> {
  const { staffUser, bookingId, expectedStatus, newStatus, cancelReason, now = new Date() } =
    params;

  // Direct customer denial at service level
  if (staffUser.role === Role.CUSTOMER) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Customers are not permitted to update staff booking status.',
    };
  }

  // 1. Fetch current booking record
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      barber: true,
      salon: true,
    },
  });

  if (!booking) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Unverified or inactive salon/barber denial
  if (
    booking.salon.status !== VerificationStatus.VERIFIED ||
    booking.barber.status !== VerificationStatus.VERIFIED ||
    !booking.barber.isActive
  ) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Salon or barber is not verified or is inactive.',
    };
  }

  // 2. Security & Policy Check
  const policyUser: PolicyUser = {
    id: staffUser.id,
    role: staffUser.role as Role,
    isActive: staffUser.isActive,
  };

  const policyBooking: PolicyBooking = {
    id: booking.id,
    customerId: booking.customerId || '',
    barberId: booking.barberId,
    barberUserId: booking.barber.userId,
    salonId: booking.salonId,
    salonOwnerId: booking.salon.ownerId,
  };

  if (!canUpdateBookingStatus(policyUser, policyBooking)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // 3. If cancelling, route through cancelBooking with mandatory reason (3 to 200 chars)
  if (newStatus === BookingStatus.CANCELLED) {
    const cancelRes = await cancelBooking({
      actor: policyUser,
      bookingId,
      reason: cancelReason,
      now,
    });

    if (!cancelRes.ok) {
      return {
        ok: false,
        code: (cancelRes.code as StaffDashboardErrorCode) || 'INVALID_INPUT',
        message: cancelRes.message,
      };
    }

    // Structured audit log
    console.log(
      JSON.stringify({
        event: 'BOOKING_STATUS_CHANGE',
        staffUserId: staffUser.id,
        bookingId,
        from: expectedStatus,
        to: BookingStatus.CANCELLED,
        timestamp: now.toISOString(),
      })
    );

    return {
      ok: true,
      data: { id: bookingId, status: BookingStatus.CANCELLED },
    };
  }

  // 4. Validate Chair Busy if transitioning to IN_PROGRESS
  let isChairBusy = false;
  if (newStatus === BookingStatus.IN_PROGRESS) {
    const activeInChair = await prisma.booking.count({
      where: {
        barberId: booking.barberId,
        status: BookingStatus.IN_PROGRESS,
        id: { not: bookingId },
      },
    });
    if (activeInChair > 0) {
      isChairBusy = true;
    }
  }

  // 5. Pure State Machine Validation
  const validation = validateBookingTransition({
    from: expectedStatus,
    to: newStatus,
    startsAt: booking.startsAt,
    now,
    isChairBusy,
  });

  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      message:
        validation.code === 'CHAIR_BUSY'
          ? 'This barber already has a customer in the chair.'
          : validation.code === 'NO_SHOW_TOO_EARLY'
          ? 'Cannot mark as no-show before the appointment start time.'
          : validation.code === 'WRONG_DAY'
          ? 'You can check in only on the day of the booking.'
          : 'Invalid status transition.',
    };
  }

  // 6. Build timestamp updates
  const updateData: Prisma.BookingUpdateInput = {
    status: newStatus,
  };

  if (newStatus === BookingStatus.CHECKED_IN) {
    updateData.checkedInAt = now;
  } else if (newStatus === BookingStatus.IN_PROGRESS) {
    updateData.startedAt = now;
    if (!booking.checkedInAt) {
      // Also record checkedInAt if check-in was skipped
      updateData.checkedInAt = now;
    }
  } else if (newStatus === BookingStatus.COMPLETED) {
    updateData.completedAt = now;
  }

  // 7. Atomic conditional update to guard race conditions
  let result;
  try {
    result = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        status: expectedStatus, // Conditional match
      },
      data: updateData,
    });
  } catch (err: unknown) {
    const errorStr = String(err);
    const isUniqueViolation =
      (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') ||
      errorStr.includes('23505') ||
      errorStr.includes('barber_single_in_progress');

    if (isUniqueViolation) {
      return {
        ok: false,
        code: 'CHAIR_BUSY',
        message: 'This barber already has a customer in the chair.',
      };
    }
    throw err;
  }

  if (result.count === 0) {
    return {
      ok: false,
      code: 'STATUS_CONFLICT',
      message: 'Booking status was updated by another action. Refreshing register.',
    };
  }

  // 8. Structured server audit logging (NO phone numbers)
  console.log(
    JSON.stringify({
      event: 'BOOKING_STATUS_CHANGE',
      staffUserId: staffUser.id,
      bookingId,
      from: expectedStatus,
      to: newStatus,
      timestamp: now.toISOString(),
    })
  );

  return {
    ok: true,
    data: { id: bookingId, status: newStatus },
  };
}

/**
 * Creates a walk-in token for today IST.
 * - Earliest free slot today on 15-minute grid.
 * - Sequential daily token from DailyTokenCounter.
 * - Status = CHECKED_IN, checkedInAt = now.
 * - Rate limit: 60 walk-ins per staff user per hour.
 */
export async function createWalkInBooking(params: {
  staffUser: CurrentUser;
  barberId: string;
  serviceIds: string[];
  customerName?: string;
  customerPhone?: string;
  now?: Date;
}): Promise<
  DashboardServiceResult<{
    bookingId: string;
    token: number;
    barberName: string;
    startsAt: Date;
    endsAt: Date;
    totalRupees: number;
  }>
> {
  const { staffUser, barberId, serviceIds, customerName, customerPhone, now = new Date() } =
    params;

  // Direct customer denial at service level
  if (staffUser.role === Role.CUSTOMER) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Customers are not permitted to create walk-in bookings.',
    };
  }

  if (!serviceIds || serviceIds.length === 0 || serviceIds.length > 6) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Please select 1 to 6 services.',
    };
  }

  // 1. Load barber and salon
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        include: {
          hours: true,
        },
      },
      availability: true,
      timeOff: true,
    },
  });

  if (!barber || barber.status !== VerificationStatus.VERIFIED || !barber.isActive) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Barber not found, unverified, or inactive.',
    };
  }

  if (barber.salon.status !== VerificationStatus.VERIFIED) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Salon not verified or suspended.',
    };
  }

  // 2. Policy check
  const policyUser: PolicyUser = {
    id: staffUser.id,
    role: staffUser.role as Role,
    isActive: staffUser.isActive,
  };

  const policyBarber = {
    id: barber.id,
    userId: barber.userId,
    salonId: barber.salonId,
    salonOwnerId: barber.salon.ownerId,
  };

  if (!canCreateWalkIn(policyUser, policyBarber)) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'You are not authorized to create walk-in bookings for this chair.',
    };
  }

  // 3. Staff user rate limit: 60 walk-ins per staff user per hour
  if (!checkStaffWalkInRateLimit(staffUser.id, now.getTime())) {
    return {
      ok: false,
      code: 'WALKIN_LIMIT',
      message: 'Walk-in creation rate limit reached (60/hour). Please wait before adding more.',
    };
  }

  // 4. Validate services: must belong to salon, be active, and provided by this barber
  const allServices = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
  });

  if (allServices.length !== serviceIds.length) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Some selected services were not found.',
    };
  }

  const foreignService = allServices.some((s) => s.salonId !== barber.salonId);
  if (foreignService) {
    return {
      ok: false,
      code: 'SERVICE_MISMATCH',
      message: 'Selected services do not belong to this salon.',
    };
  }

  const inactiveService = allServices.some((s) => !s.isActive);
  if (inactiveService) {
    return {
      ok: false,
      code: 'SERVICE_INACTIVE',
      message: 'One or more selected services are currently unavailable.',
    };
  }

  const barberServices = await prisma.barberService.findMany({
    where: {
      barberId: barber.id,
      serviceId: { in: serviceIds },
    },
  });

  if (barberServices.length !== serviceIds.length) {
    return {
      ok: false,
      code: 'BARBER_SERVICE_MISMATCH',
      message: 'The selected barber does not provide all requested services.',
    };
  }

  const totalDurationMin = allServices.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPriceRupees = allServices.reduce((sum, s) => sum + s.priceRupees, 0);

  // 5. Earliest free slot lookup for today IST on 15-minute grid (without 15-min lead time)
  const { dateIst, minutesFromMidnight: nowIstMin } = utcToIstDetails(now);
  const dayStartUtc = istToUtcDate(dateIst, 0);
  const dayEndUtc = istToUtcDate(dateIst, 1440);

  const currentBookings = await prisma.booking.findMany({
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
      startsAt: { lt: dayEndUtc },
      endsAt: { gt: dayStartUtc },
    },
    select: { startsAt: true, endsAt: true, status: true },
  });

  // Round up now to the next 15-minute grid mark
  const remainder = nowIstMin % SLOT_GRID_MIN;
  const roundedNowMin = remainder === 0 ? nowIstMin : nowIstMin + (SLOT_GRID_MIN - remainder);
  const earliestAllowedStartUtc = istToUtcDate(dateIst, roundedNowMin);

  const slots = generateSlots({
    dateIst,
    durationMin: totalDurationMin,
    salonHours: barber.salon.hours,
    availability: barber.availability,
    timeOff: barber.timeOff,
    bookings: currentBookings,
    now,
    leadTimeMinutes: 0,
  });

  // Find candidate available slots starting at or after the rounded now
  const availableSlots = slots.filter(
    (s) => s.available && s.startsAt.getTime() >= earliestAllowedStartUtc.getTime()
  );

  if (availableSlots.length === 0) {
    return {
      ok: false,
      code: 'NO_FREE_TIME',
      message: 'No free time slots available today for this barber.',
    };
  }

  // 6. Transaction with retry upon concurrent slot collision (23P01)
  const tokenDate = toTokenDateUtc(dateIst);

  for (let attempt = 0; attempt < Math.min(availableSlots.length, 3); attempt++) {
    const candidateSlot = availableSlots[attempt];
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Allocate next daily token atomically
        const counter = await tx.dailyTokenCounter.upsert({
          where: {
            salonId_date: {
              salonId: barber.salonId,
              date: tokenDate,
            },
          },
          update: {
            last: { increment: 1 },
          },
          create: {
            salonId: barber.salonId,
            date: tokenDate,
            last: 1,
          },
        });

        const tokenNumber = counter.last;

        const created = await tx.booking.create({
          data: {
            token: tokenNumber,
            tokenDate,
            salonId: barber.salonId,
            barberId: barber.id,
            customerId: null,
            walkInName: customerName?.trim() ? customerName.trim() : null,
            walkInPhone: customerPhone?.trim() || null,
            type: 'IN_SALON',
            source: BookingSource.WALK_IN,
            status: BookingStatus.CHECKED_IN,
            checkedInAt: now,
            startsAt: candidateSlot.startsAt,
            endsAt: candidateSlot.endsAt,
            totalRupees: totalPriceRupees,
            items: {
              create: allServices.map((s) => ({
                serviceId: s.id,
                priceRupees: s.priceRupees,
                durationMin: s.durationMin,
              })),
            },
          },
        });

        return {
          bookingId: created.id,
          token: tokenNumber,
          barberName: barber.displayName,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          totalRupees: totalPriceRupees,
        };
      });

      // Structured audit log
      console.log(
        JSON.stringify({
          event: 'WALK_IN_TOKEN_CREATED',
          staffUserId: staffUser.id,
          bookingId: result.bookingId,
          token: result.token,
          barberId,
          timestamp: now.toISOString(),
        })
      );

      return { ok: true, data: result };
    } catch (err: unknown) {
      const errStr = String(err);
      if (errStr.includes('23P01') || errStr.includes('booking_no_overlap')) {
        // Slot collision in concurrent race - retry next available slot
        continue;
      }
      console.error('Failed to create walk-in booking transaction:', err);
      return {
        ok: false,
        code: 'NO_FREE_TIME',
        message: 'Could not secure slot. Please try another time.',
      };
    }
  }

  return {
    ok: false,
    code: 'NO_FREE_TIME',
    message: 'No free time slots available today for this barber.',
  };
}
