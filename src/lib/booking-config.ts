import { BookingStatus } from '@prisma/client';

/**
 * Slot start times must lie on 15-minute clock grid boundaries (:00, :15, :30, :45).
 */
export const SLOT_GRID_MIN = 15;

/**
 * Minimum lead time: slots starting in less than 15 minutes from now cannot be booked.
 */
export const MIN_LEAD_MIN = 15;

/**
 * Maximum advance booking horizon: appointments can be booked up to 14 days in advance.
 */
export const MAX_ADVANCE_DAYS = 14;

/**
 * Customer cancellation cutoff: customers may cancel online only at least 60 minutes prior to startsAt.
 */
export const CANCEL_CUTOFF_MIN = 60;

/**
 * Maximum concurrent active/future bookings permitted per customer across all salons.
 */
export const MAX_ACTIVE_BOOKINGS_PER_CUSTOMER = 5;

/**
 * Maximum bookings a customer is permitted to create within a 1-hour window.
 */
export const MAX_BOOKINGS_CREATED_PER_HOUR = 5;

/**
 * Rate limit for slot availability lookup queries per IP per minute.
 */
export const SLOT_LOOKUPS_PER_IP_PER_MIN = 60;

/**
 * Booking statuses that represent an active commitment occupying a barber's schedule.
 */
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.IN_PROGRESS,
] as const;
