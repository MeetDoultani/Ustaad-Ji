import { BookingStatus } from '@prisma/client';
import {
  SLOT_GRID_MIN,
  MIN_LEAD_MIN,
  MAX_ADVANCE_DAYS,
  ACTIVE_STATUSES,
} from './booking-config';
import {
  utcToIstDetails,
  istToUtcDate,
  formatMinutesToTime,
  getNextIstDates,
} from './time';

export type SlotUnavailableReason = 'past' | 'booked' | 'time_off' | 'too_short';

export interface GeneratedSlot {
  startsAt: Date;
  endsAt: Date;
  timeStr: string;
  available: boolean;
  reason?: SlotUnavailableReason;
}

export interface SalonHourInput {
  weekday: number;
  openMin: number;
  closeMin: number;
  isClosed: boolean;
}

export interface AvailabilityInput {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface TimeOffInput {
  startsAt: Date;
  endsAt: Date;
}

export interface BookingInput {
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
}

export interface GenerateSlotsParams {
  dateIst: string;
  durationMin: number;
  salonHours: SalonHourInput[];
  availability: AvailabilityInput[];
  timeOff: TimeOffInput[];
  bookings: BookingInput[];
  now?: Date;
}

/**
 * Pure slot generator for a given barber on a specific IST date.
 * - Enforces 15-minute clock grid (SLOT_GRID_MIN)
 * - Intersects barber Availability with SalonHours
 * - Evaluates candidate slots for past/lead time (MIN_LEAD_MIN), time off,
 *   active bookings, and window boundaries (too_short)
 * - Bounded to [todayIst, todayIst + MAX_ADVANCE_DAYS]
 */
export function generateSlots({
  dateIst,
  durationMin,
  salonHours,
  availability,
  timeOff,
  bookings,
  now = new Date(),
}: GenerateSlotsParams): GeneratedSlot[] {
  if (!dateIst || !/^\d{4}-\d{2}-\d{2}$/.test(dateIst.trim()) || durationMin <= 0) {
    return [];
  }

  // 1. Check date horizon against today's IST date
  const allowedDates = getNextIstDates(MAX_ADVANCE_DAYS + 1, now);
  if (!allowedDates.includes(dateIst.trim())) {
    return [];
  }

  // 2. Determine IST weekday for the date
  // Using midday IST (720 min) guarantees the correct calendar day regardless of server TZ
  const middayUtc = istToUtcDate(dateIst, 720);
  const { weekday } = utcToIstDetails(middayUtc);

  // 3. Check Salon Hours for this weekday
  const daySalonHours = salonHours.find((h) => h.weekday === weekday);
  if (!daySalonHours || daySalonHours.isClosed) {
    return [];
  }

  // 4. Check Barber Availability for this weekday
  const dayAvailabilities = availability.filter((a) => a.weekday === weekday);
  if (dayAvailabilities.length === 0) {
    return [];
  }

  // 5. Intersect Barber Availability with Salon Hours to get valid working windows
  const windows: Array<{ startMin: number; endMin: number }> = [];
  for (const avail of dayAvailabilities) {
    const windowStart = Math.max(avail.startMin, daySalonHours.openMin);
    const windowEnd = Math.min(avail.endMin, daySalonHours.closeMin);
    if (windowEnd > windowStart) {
      windows.push({ startMin: windowStart, endMin: windowEnd });
    }
  }

  if (windows.length === 0) {
    return [];
  }

  // Sort windows by startMin
  windows.sort((a, b) => a.startMin - b.startMin);

  // Filter active bookings and time-off relevant to this date
  const activeBookings = bookings.filter((b) =>
    ACTIVE_STATUSES.includes(b.status as BookingStatus)
  );

  const slots: GeneratedSlot[] = [];
  const minLeadTimeMs = now.getTime() + MIN_LEAD_MIN * 60 * 1000;

  // 6. Generate candidate slots on a 15-minute grid within each window
  for (const win of windows) {
    // Snap window start to the first 15-minute boundary >= win.startMin
    const remainder = win.startMin % SLOT_GRID_MIN;
    let slotStartMin = remainder === 0 ? win.startMin : win.startMin + (SLOT_GRID_MIN - remainder);

    while (slotStartMin < win.endMin) {
      const slotEndMin = slotStartMin + durationMin;
      const startsAt = istToUtcDate(dateIst, slotStartMin);
      const endsAt = istToUtcDate(dateIst, slotEndMin);
      const timeStr = formatMinutesToTime(slotStartMin);

      let available = true;
      let reason: SlotUnavailableReason | undefined;

      // Rule a: Window boundary check (too_short)
      if (slotEndMin > win.endMin) {
        available = false;
        reason = 'too_short';
      }

      // Rule b: TimeOff overlap check
      if (available) {
        const hasTimeOffOverlap = timeOff.some(
          (to) => startsAt < to.endsAt && endsAt > to.startsAt
        );
        if (hasTimeOffOverlap) {
          available = false;
          reason = 'time_off';
        }
      }

      // Rule c: Active booking overlap check
      if (available) {
        const hasBookingOverlap = activeBookings.some(
          (b) => startsAt < b.endsAt && endsAt > b.startsAt
        );
        if (hasBookingOverlap) {
          available = false;
          reason = 'booked';
        }
      }

      // Rule d: Past / Minimum lead time check
      if (available) {
        if (startsAt.getTime() < minLeadTimeMs) {
          available = false;
          reason = 'past';
        }
      }

      slots.push({
        startsAt,
        endsAt,
        timeStr,
        available,
        reason,
      });

      slotStartMin += SLOT_GRID_MIN;
    }
  }

  // Sort slots chronologically
  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return slots;
}
