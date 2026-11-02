'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth-server';
import { cancelBooking, rescheduleBooking } from '@/lib/booking-service';
import { PolicyUser } from '@/lib/policies';

export async function cancelBookingAction({
  bookingId,
  reason,
}: {
  bookingId: string;
  reason?: string;
}): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Kripya login karein.',
      };
    }

    const result = await cancelBooking({
      actor: user as PolicyUser,
      bookingId,
      reason,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }

    revalidatePath('/bookings');
    revalidatePath(`/bookings/${bookingId}`);

    return {
      ok: true,
      message: 'Booking successfully cancel ho gayi.',
    };
  } catch (error) {
    console.error('cancelBookingAction error:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Booking cancel nahi ho saki.',
    };
  }
}

export async function rescheduleBookingAction({
  bookingId,
  newStartsAtIso,
}: {
  bookingId: string;
  newStartsAtIso: string;
}): Promise<{
  ok: boolean;
  code?: string;
  message?: string;
  newBookingId?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Kripya login karein.',
      };
    }

    const newStartsAt = new Date(newStartsAtIso);
    if (isNaN(newStartsAt.getTime())) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Valid time slot chuniye.',
      };
    }

    const result = await rescheduleBooking({
      actor: user as PolicyUser,
      bookingId,
      newStartsAt,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
      };
    }

    revalidatePath('/bookings');
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath(`/bookings/${result.data.id}`);

    return {
      ok: true,
      message: 'Booking successfully reschedule ho gayi.',
      newBookingId: result.data.id,
    };
  } catch (error) {
    console.error('rescheduleBookingAction error:', error);
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: 'Reschedule karte samay samasya aayi.',
    };
  }
}
