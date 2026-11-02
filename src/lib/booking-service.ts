import { BookingStatus, BookingType, BookingSource, Role, Prisma } from '@prisma/client';
import { prisma } from './db';
import {
  MAX_ACTIVE_BOOKINGS_PER_CUSTOMER,
  MAX_BOOKINGS_CREATED_PER_HOUR,
  CANCEL_CUTOFF_MIN,
  ACTIVE_STATUSES,
  SLOT_GRID_MIN,
  MIN_LEAD_MIN,
  MAX_ADVANCE_DAYS,
} from './booking-config';
import {
  utcToIstDetails,
  istToUtcDate,
  toTokenDateUtc,
  getNextIstDates,
} from './time';
import { generateSlots, GeneratedSlot } from './slots';
import {
  PolicyUser,
  canViewBooking,
  canCancelBooking,
  canCreateBooking,
  canRescheduleBooking,
} from './policies';

export type BookingWithDetails = Prisma.BookingGetPayload<{
  include: {
    items: { include: { service: true } };
    salon: true;
    barber: { include: { user: true } };
    customer: true;
  };
}>;

export type CustomerBookingSummary = Prisma.BookingGetPayload<{
  include: {
    items: { include: { service: true } };
    salon: true;
    barber: { include: { user: true } };
  };
}>;

export interface BookingServiceError {
  ok: false;
  code:
    | 'UNAUTHORIZED'
    | 'NOT_FOUND'
    | 'INVALID_INPUT'
    | 'ACTIVE_LIMIT_EXCEEDED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'CUSTOMER_OVERLAP'
    | 'SLOT_TAKEN'
    | 'CUTOFF_PASSED'
    | 'INVALID_STATUS'
    | 'UNKNOWN_ERROR';
  message: string;
}

export interface BookingServiceSuccess<T> {
  ok: true;
  data: T;
}


export type BookingServiceResult<T> = BookingServiceSuccess<T> | BookingServiceError;

/**
 * Fetch available slots for a barber on an IST date given selected service IDs.
 */
export async function getAvailableSlots({
  barberId,
  dateIst,
  serviceIds,
  now = new Date(),
}: {
  barberId: string;
  dateIst: string;
  serviceIds: string[];
  now?: Date;
}): Promise<BookingServiceResult<GeneratedSlot[]>> {
  if (!barberId || !dateIst || !serviceIds || serviceIds.length === 0) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Barber, date aur kam se kam ek service chuniye.',
    };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: {
        include: {
          hours: true,
        },
      },
      services: {
        where: {
          serviceId: { in: serviceIds },
        },
        include: {
          service: true,
        },
      },
      availability: true,
      timeOff: true,
    },
  });

  if (!barber || !barber.isActive || barber.status !== 'VERIFIED') {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Barber upalabdh nahi hai.',
    };
  }

  // Validate that all requested services are provided by this barber and active
  const matchedServices = barber.services
    .map((bs) => bs.service)
    .filter((s) => s.isActive);

  if (matchedServices.length !== serviceIds.length) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Kuch chuni gayi services yeh barber perform nahi karte.',
    };
  }

  const totalDurationMin = matchedServices.reduce((sum, s) => sum + s.durationMin, 0);

  // Fetch bookings on this calendar date for the barber
  // Date window in IST starts at midnight and ends at midnight + 1 day
  const dayStartUtc = istToUtcDate(dateIst, 0);
  const dayEndUtc = istToUtcDate(dateIst, 1440);

  const bookings = await prisma.booking.findMany({
    where: {
      barberId,
      status: { in: [...ACTIVE_STATUSES] },
      startsAt: { lt: dayEndUtc },
      endsAt: { gt: dayStartUtc },
    },
    select: {
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });

  const slots = generateSlots({
    dateIst,
    durationMin: totalDurationMin,
    salonHours: barber.salon.hours,
    availability: barber.availability,
    timeOff: barber.timeOff,
    bookings,
    now,
  });

  return { ok: true, data: slots };
}

/**
 * Create a new booking inside a single interactive transaction.
 */
export async function createBooking({
  customerId,
  salonId,
  barberId,
  serviceIds,
  startsAt,
  now = new Date(),
}: {
  customerId: string;
  salonId: string;
  barberId: string;
  serviceIds: string[];
  startsAt: Date;
  now?: Date;
}): Promise<BookingServiceResult<BookingWithDetails>> {
  // 1. Basic validation
  if (!customerId || !salonId || !barberId || !Array.isArray(serviceIds) || serviceIds.length === 0) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Sabhi zaroori jankari bharein.',
    };
  }

  if (serviceIds.length > 6) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Ek baar mein maximum 6 services book ki ja sakti hain.',
    };
  }

  const uniqueServiceIds = Array.from(new Set(serviceIds));
  if (uniqueServiceIds.length !== serviceIds.length) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Duplicate services chuni gayi hain.',
    };
  }

  const { dateIst, minutesFromMidnight, weekday } = utcToIstDetails(startsAt);

  // 1a. Grid alignment check: 15-minute grid (off-grid rejection)
  if (
    minutesFromMidnight % SLOT_GRID_MIN !== 0 ||
    startsAt.getUTCSeconds() !== 0 ||
    startsAt.getUTCMilliseconds() !== 0
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Time slot 15 minute ke interval par hona chahiye (jaise 10:00, 10:15).',
    };
  }

  // 1b. Past & minimum lead time check
  if (startsAt.getTime() < now.getTime() + MIN_LEAD_MIN * 60 * 1000) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Kam se kam 15 minute pehle ka slot book karein.',
    };
  }

  // 1c. Advance booking window check (14 days)
  const allowedDates = getNextIstDates(MAX_ADVANCE_DAYS + 1, now);
  if (!allowedDates.includes(dateIst)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `Aap maximum ${MAX_ADVANCE_DAYS} din aage tak ka slot book kar sakte hain.`,
    };
  }

  // 2. Fetch Customer and verify authorization directly in core service
  const customer = await prisma.user.findUnique({
    where: { id: customerId },
  });

  if (!customer || !customer.isActive || customer.role !== Role.CUSTOMER || !canCreateBooking(customer as PolicyUser)) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Customer booking ke liye customer account se login karein.',
    };
  }

  // 3. Rate limits and concurrency guards
  // a. Max active bookings limit (5)
  const activeCount = await prisma.booking.count({
    where: {
      customerId,
      status: { in: [...ACTIVE_STATUSES] },
      endsAt: { gt: now },
    },
  });

  if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_CUSTOMER) {
    return {
      ok: false,
      code: 'ACTIVE_LIMIT_EXCEEDED',
      message: 'Aapke paas pehle se 5 active bookings hain.',
    };
  }

  // b. Hourly creation rate limit (5)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const createdLastHour = await prisma.booking.count({
    where: {
      customerId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (createdLastHour >= MAX_BOOKINGS_CREATED_PER_HOUR) {
    return {
      ok: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Aap 1 ghante mein 5 se zyada booking nahi bana sakte.',
    };
  }

  // 4. Validate Salon, Barber, Services
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
  });
  if (!salon || salon.status !== 'VERIFIED') {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Salon uplabdh nahi hai.',
    };
  }

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    include: {
      salon: { include: { hours: true } },
      services: {
        where: { serviceId: { in: uniqueServiceIds } },
        include: { service: true },
      },
      availability: true,
      timeOff: true,
    },
  });

  if (!barber || !barber.isActive || barber.status !== 'VERIFIED' || barber.salonId !== salonId) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Barber uplabdh nahi hai ya is salon se nahi juda hai.',
    };
  }

  const validServices = barber.services
    .map((bs) => bs.service)
    .filter((s) => s.isActive && s.salonId === salonId);

  if (validServices.length !== uniqueServiceIds.length) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Kuch services is salon ya barber ke paas uplabdh nahi hain.',
    };
  }

  // Duration and Price calculation strictly from database records
  const totalDurationMin = validServices.reduce((sum, s) => sum + s.durationMin, 0);
  const totalRupees = validServices.reduce((sum, s) => sum + s.priceRupees, 0);
  const endsAt = new Date(startsAt.getTime() + totalDurationMin * 60 * 1000);

  // Operational hours check (Salon hours and Barber availability)
  const daySalonHour = barber.salon.hours.find((h) => h.weekday === weekday);
  if (!daySalonHour || daySalonHour.isClosed) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Salon is din band hai.',
    };
  }
  const slotStartMin = minutesFromMidnight;
  const slotEndMin = slotStartMin + totalDurationMin;
  if (slotStartMin < daySalonHour.openMin || slotEndMin > daySalonHour.closeMin) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Chuna gaya slot salon ke khulne ke samay se bahar hai.',
    };
  }
  const isWithinBarberAvailability = barber.availability.some(
    (a) => a.weekday === weekday && slotStartMin >= a.startMin && slotEndMin <= a.endMin
  );
  if (!isWithinBarberAvailability) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Chuna gaya slot barber ke working hours se bahar hai.',
    };
  }

  // 5. Customer Overlap Check: customer cannot have an active booking overlapping this window at ANY salon
  const customerOverlap = await prisma.booking.findFirst({
    where: {
      customerId,
      status: { in: [...ACTIVE_STATUSES] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });

  if (customerOverlap) {
    return {
      ok: false,
      code: 'CUSTOMER_OVERLAP',
      message: 'Aapka is samay kisi doosre salon ya barber ke saath pehle se appointment hai.',
    };
  }

  // 6. Execute inside interactive transaction with Supabase timeout configuration
  const tokenDate = toTokenDateUtc(startsAt);
  const initialStatus = salon.requiresApproval ? BookingStatus.PENDING : BookingStatus.CONFIRMED;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Double check customer overlap inside tx to guard concurrent submissions from same customer
        const customerOverlapInsideTx = await tx.booking.findFirst({
          where: {
            customerId,
            status: { in: [...ACTIVE_STATUSES] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });

        if (customerOverlapInsideTx) {
          throw new Error('CUSTOMER_OVERLAP_ERROR');
        }
        // Double-check slot availability inside transaction
        const dayStartUtc = istToUtcDate(dateIst, 0);
        const dayEndUtc = istToUtcDate(dateIst, 1440);

        const currentBookings = await tx.booking.findMany({
          where: {
            barberId,
            status: { in: [...ACTIVE_STATUSES] },
            startsAt: { lt: dayEndUtc },
            endsAt: { gt: dayStartUtc },
          },
          select: { startsAt: true, endsAt: true, status: true },
        });

        const slots = generateSlots({
          dateIst,
          durationMin: totalDurationMin,
          salonHours: barber.salon.hours,
          availability: barber.availability,
          timeOff: barber.timeOff,
          bookings: currentBookings,
          now,
        });

        const requestedSlot = slots.find(
          (s) => s.startsAt.getTime() === startsAt.getTime()
        );

        if (!requestedSlot || !requestedSlot.available) {
          throw new Error('SLOT_TAKEN_ERROR');
        }

        // Allocate next daily token atomically
        const counter = await tx.dailyTokenCounter.upsert({
          where: {
            salonId_date: {
              salonId,
              date: tokenDate,
            },
          },
          update: {
            last: { increment: 1 },
          },
          create: {
            salonId,
            date: tokenDate,
            last: 1,
          },
        });

        const token = counter.last;

        // Insert Booking and BookingItems
        const newBooking = await tx.booking.create({
          data: {
            token,
            tokenDate,
            salonId,
            barberId,
            customerId,
            type: BookingType.IN_SALON,
            source: BookingSource.ONLINE,
            status: initialStatus,
            startsAt,
            endsAt,
            totalRupees,
            items: {
              create: validServices.map((service) => ({
                serviceId: service.id,
                priceRupees: service.priceRupees,
                durationMin: service.durationMin,
              })),
            },
          },
          include: {
            items: {
              include: {
                service: true,
              },
            },
            salon: true,
            barber: {
              include: {
                user: true,
              },
            },
            customer: true,
          },
        });

        return newBooking;
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return { ok: true, data: result };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.message === 'CUSTOMER_OVERLAP_ERROR') {
      return {
        ok: false,
        code: 'CUSTOMER_OVERLAP',
        message: 'Aapka is samay kisi doosre salon ya barber ke saath pehle se appointment hai.',
      };
    }

    if (
      err.message === 'SLOT_TAKEN_ERROR' ||
      err.code === '23P01' || // PostgreSQL exclusion_violation
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034' || error.message.includes('booking_no_overlap'))) ||
      (err.message && err.message.includes('booking_no_overlap'))
    ) {
      return {
        ok: false,
        code: 'SLOT_TAKEN',
        message: 'Yeh slot bhar gaya hai, kripya doosra time chuniye.',
      };
    }


    console.error('Failed to create booking:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Booking banate samay samasya aayi. Kripya punah prayas karein.',
    };
  }
}

/**
 * Cancel a booking.
 * Enforces cancellation policy and 60-minute cutoff for customers.
 */
export async function cancelBooking({
  actor,
  bookingId,
  reason,
  now = new Date(),
}: {
  actor: PolicyUser;
  bookingId: string;
  reason?: string;
  now?: Date;
}): Promise<BookingServiceResult<BookingWithDetails>> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      salon: true,
      barber: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Booking nahi mili.',
    };
  }

  const policyBooking = {
    id: booking.id,
    customerId: booking.customerId || '',
    barberId: booking.barberId,
    barberUserId: booking.barber.userId,
    salonId: booking.salonId,
    salonOwnerId: booking.salon.ownerId,
  };

  if (!canCancelBooking(actor, policyBooking)) {
    return {
      ok: false,
      code: 'NOT_FOUND', // Uniform 404 for security
      message: 'Booking nahi mili.',
    };
  }

  // Check current status
  if (
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.COMPLETED ||
    booking.status === BookingStatus.REJECTED
  ) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      message: 'Yeh booking pehle se complete ya cancel ho chuki hai.',
    };
  }

  // Staff cancellations bypass the customer 60-min cutoff, but MUST provide a non-empty reason
  if (actor.role !== Role.CUSTOMER) {
    if (!reason || reason.trim().length === 0) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Staff cancellation ke liye reason likhna zaroori hai.',
      };
    }
  } else {
    // Customer 60-minute cancellation cutoff check
    const cutoffTimeMs = booking.startsAt.getTime() - CANCEL_CUTOFF_MIN * 60 * 1000;
    if (now.getTime() > cutoffTimeMs) {
      return {
        ok: false,
        code: 'CUTOFF_PASSED',
        message: 'Appointment shuru hone ke 1 ghante pehle tak hi cancel kiya ja sakta hai.',
      };
    }
  }

  const cancelReason =
    actor.role === Role.CUSTOMER
      ? (reason && reason.trim() ? reason.trim() : 'Customer cancelled online')
      : reason!.trim();

  const updatedBooking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CANCELLED,
      cancelledAt: now,
      cancelReason,
    },
    include: {
      items: { include: { service: true } },
      salon: true,
      barber: { include: { user: true } },
      customer: true,
    },
  });

  return { ok: true, data: updatedBooking };
}

/**
 * Reschedule a booking to a new startsAt instant.
 * Inside a single interactive transaction, cancels the old booking first so the exclusion constraint
 * is not tripped, then inserts the new booking. If anything fails, transaction rolls back.
 */
export async function rescheduleBooking({
  actor,
  bookingId,
  newStartsAt,
  now = new Date(),
}: {
  actor: PolicyUser;
  bookingId: string;
  newStartsAt: Date;
  now?: Date;
}): Promise<BookingServiceResult<BookingWithDetails>> {
  const oldBooking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { service: true } },
      salon: { include: { hours: true } },
      barber: {
        include: {
          salon: { include: { hours: true } },
          services: { include: { service: true } },
          availability: true,
          timeOff: true,
        },
      },
    },
  });

  if (!oldBooking) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Booking nahi mili.',
    };
  }

  const policyBooking = {
    id: oldBooking.id,
    customerId: oldBooking.customerId || '',
    barberId: oldBooking.barberId,
    barberUserId: oldBooking.barber.userId,
    salonId: oldBooking.salonId,
    salonOwnerId: oldBooking.salon.ownerId,
  };

  if (!canRescheduleBooking(actor, policyBooking)) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Booking nahi mili.',
    };
  }

  // Only active bookings can be rescheduled
  if (
    oldBooking.status !== BookingStatus.PENDING &&
    oldBooking.status !== BookingStatus.CONFIRMED
  ) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      message: 'Kewal active bookings ko reschedule kiya ja sakta hai.',
    };
  }

  // Customer 60-minute cutoff from old booking startsAt
  if (actor.role === Role.CUSTOMER) {
    const cutoffTimeMs = oldBooking.startsAt.getTime() - CANCEL_CUTOFF_MIN * 60 * 1000;
    if (now.getTime() > cutoffTimeMs) {
      return {
        ok: false,
        code: 'CUTOFF_PASSED',
        message: 'Reschedule ke liye appointment se kam se kam 1 ghanta pehle request karein.',
      };
    }
  }

  const totalDurationMin = oldBooking.items.reduce((sum, i) => sum + i.durationMin, 0);
  const totalRupees = oldBooking.items.reduce((sum, i) => sum + i.priceRupees, 0);
  const newEndsAt = new Date(newStartsAt.getTime() + totalDurationMin * 60 * 1000);

  const { dateIst, minutesFromMidnight } = utcToIstDetails(newStartsAt);

  // Grid alignment check: 15-minute grid
  if (
    minutesFromMidnight % SLOT_GRID_MIN !== 0 ||
    newStartsAt.getUTCSeconds() !== 0 ||
    newStartsAt.getUTCMilliseconds() !== 0
  ) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Time slot 15 minute ke interval par hona chahiye.',
    };
  }

  // Lead time check
  if (newStartsAt.getTime() < now.getTime() + MIN_LEAD_MIN * 60 * 1000) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Kam se kam 15 minute pehle ka slot chuniye.',
    };
  }

  // Advance booking window check (14 days)
  const allowedDates = getNextIstDates(MAX_ADVANCE_DAYS + 1, now);
  if (!allowedDates.includes(dateIst)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: `Aap maximum ${MAX_ADVANCE_DAYS} din aage tak ka slot book kar sakte hain.`,
    };
  }

  const tokenDate = toTokenDateUtc(newStartsAt);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Step 1: Mark old booking as CANCELLED (RESCHEDULED) before creating the new booking
        // to prevent PostgreSQL booking_no_overlap exclusion conflict if shifting windows overlap
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: 'RESCHEDULED',
          },
        });

        // Step 2: Customer overlap check with other active bookings (excluding old booking)
        if (oldBooking.customerId) {
          const overlap = await tx.booking.findFirst({
            where: {
              customerId: oldBooking.customerId,
              id: { not: bookingId },
              status: { in: [...ACTIVE_STATUSES] },
              startsAt: { lt: newEndsAt },
              endsAt: { gt: newStartsAt },
            },
          });

          if (overlap) {
            throw new Error('CUSTOMER_OVERLAP_ERROR');
          }
        }

        // Step 3: Validate new slot availability for barber
        const dayStartUtc = istToUtcDate(dateIst, 0);
        const dayEndUtc = istToUtcDate(dateIst, 1440);

        const currentBookings = await tx.booking.findMany({
          where: {
            barberId: oldBooking.barberId,
            id: { not: bookingId },
            status: { in: [...ACTIVE_STATUSES] },
            startsAt: { lt: dayEndUtc },
            endsAt: { gt: dayStartUtc },
          },
          select: { startsAt: true, endsAt: true, status: true },
        });

        const slots = generateSlots({
          dateIst,
          durationMin: totalDurationMin,
          salonHours: oldBooking.barber.salon.hours,
          availability: oldBooking.barber.availability,
          timeOff: oldBooking.barber.timeOff,
          bookings: currentBookings,
          now,
        });

        const requestedSlot = slots.find(
          (s) => s.startsAt.getTime() === newStartsAt.getTime()
        );

        if (!requestedSlot || !requestedSlot.available) {
          throw new Error('SLOT_TAKEN_ERROR');
        }

        // Step 4: Allocate token for new date
        const counter = await tx.dailyTokenCounter.upsert({
          where: {
            salonId_date: {
              salonId: oldBooking.salonId,
              date: tokenDate,
            },
          },
          update: {
            last: { increment: 1 },
          },
          create: {
            salonId: oldBooking.salonId,
            date: tokenDate,
            last: 1,
          },
        });

        const token = counter.last;

        // Step 5: Create new booking row
        const newBooking = await tx.booking.create({
          data: {
            token,
            tokenDate,
            salonId: oldBooking.salonId,
            barberId: oldBooking.barberId,
            customerId: oldBooking.customerId,
            type: oldBooking.type,
            source: oldBooking.source,
            status: oldBooking.status, // preserve previous PENDING or CONFIRMED status
            startsAt: newStartsAt,
            endsAt: newEndsAt,
            totalRupees,
            items: {
              create: oldBooking.items.map((item) => ({
                serviceId: item.serviceId,
                priceRupees: item.priceRupees,
                durationMin: item.durationMin,
              })),
            },
          },
          include: {
            items: { include: { service: true } },
            salon: true,
            barber: { include: { user: true } },
            customer: true,
          },
        });

        return newBooking;
      },
      {
        maxWait: 10000,
        timeout: 15000,
      }
    );

    return { ok: true, data: result };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.message === 'CUSTOMER_OVERLAP_ERROR') {
      return {
        ok: false,
        code: 'CUSTOMER_OVERLAP',
        message: 'Aapka is samay kisi doosre appointment ke saath conflict hai.',
      };
    }

    if (
      err.message === 'SLOT_TAKEN_ERROR' ||
      err.code === '23P01' ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034' || error.message.includes('booking_no_overlap'))) ||
      (err.message && err.message.includes('booking_no_overlap'))
    ) {
      return {
        ok: false,
        code: 'SLOT_TAKEN',
        message: 'Yeh slot bhar gaya hai, kripya doosra time chuniye.',
      };
    }


    console.error('Failed to reschedule booking:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Reschedule karte samay samasya aayi. Kripya punah prayas karein.',
    };
  }
}

/**
 * Get booking by ID with authorization check.
 */
export async function getBookingForUser(
  actor: PolicyUser | null | undefined,
  bookingId: string
): Promise<BookingWithDetails | null> {
  if (!bookingId) return null;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: { include: { service: true } },
      salon: true,
      barber: { include: { user: true } },
      customer: true,
    },
  });

  if (!booking) return null;

  const policyBooking = {
    id: booking.id,
    customerId: booking.customerId || '',
    barberId: booking.barberId,
    barberUserId: booking.barber.userId,
    salonId: booking.salonId,
    salonOwnerId: booking.salon.ownerId,
  };

  if (!canViewBooking(actor, policyBooking)) {
    return null; // Uniform 404
  }

  return booking;
}

/**
 * List all bookings for a customer divided into upcoming and past.
 */
export async function listBookingsForCustomer(
  customerId: string,
  now = new Date()
): Promise<{
  upcoming: CustomerBookingSummary[];
  past: CustomerBookingSummary[];
}> {
  const allBookings = await prisma.booking.findMany({
    where: { customerId },
    include: {
      items: { include: { service: true } },
      salon: true,
      barber: { include: { user: true } },
    },
    orderBy: { startsAt: 'asc' },
  });

  const upcoming: CustomerBookingSummary[] = [];
  const past: CustomerBookingSummary[] = [];


  for (const b of allBookings) {
    const isUpcoming =
      ACTIVE_STATUSES.includes(b.status) && b.endsAt.getTime() > now.getTime();

    if (isUpcoming) {
      upcoming.push(b);
    } else {
      past.push(b);
    }
  }

  // Upcoming sorted ascending by startsAt
  upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  // Past sorted descending by startsAt
  past.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return { upcoming, past };
}
