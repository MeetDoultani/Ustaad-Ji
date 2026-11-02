'use server';

import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth-server';
import { getAvailableSlots, createBooking } from '@/lib/booking-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { SLOT_LOOKUPS_PER_IP_PER_MIN } from '@/lib/booking-config';

export interface SerializedSlot {
  startsAt: string;
  endsAt: string;
  timeStr: string;
  available: boolean;
  reason?: 'past' | 'booked' | 'time_off' | 'too_short';
}

export async function getSlotsAction({
  barberId,
  dateIst,
  serviceIds,
}: {
  barberId: string;
  dateIst: string;
  serviceIds: string[];
}): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
  slots?: SerializedSlot[];
}> {
  try {
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : headersList.get('x-real-ip') || '127.0.0.1';

    const rateLimitCheck = checkRateLimit(
      `slots:${ip}`,
      SLOT_LOOKUPS_PER_IP_PER_MIN,
      60 * 1000
    );

    if (!rateLimitCheck.allowed) {
      return {
        ok: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Bahut saari queries ki gayi hain. Kripya thoda ruk kar try karein.',
      };
    }

    const result = await getAvailableSlots({
      barberId,
      dateIst,
      serviceIds,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }

    const serialized: SerializedSlot[] = result.data.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      timeStr: s.timeStr,
      available: s.available,
      reason: s.reason,
    }));

    return {
      ok: true,
      slots: serialized,
    };
  } catch (error) {
    console.error('getSlotsAction error:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Slots fetch karne mein samasya aayi.',
    };
  }
}

export async function createBookingAction({
  salonId,
  barberId,
  serviceIds,
  startsAtIso,
}: {
  salonId: string;
  barberId: string;
  serviceIds: string[];
  startsAtIso: string;
}): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
  bookingId?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Booking confirm karne ke liye kripya login karein.',
      };
    }

    const startsAt = new Date(startsAtIso);
    if (isNaN(startsAt.getTime())) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Valid time slot chuniye.',
      };
    }

    const result = await createBooking({
      customerId: user.id,
      salonId,
      barberId,
      serviceIds,
      startsAt,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }

    return {
      ok: true,
      bookingId: result.data.id,
    };
  } catch (error) {
    console.error('createBookingAction error:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Booking confirm nahi ho saki. Kripya punah prayas karein.',
    };
  }
}
