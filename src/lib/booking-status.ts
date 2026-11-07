import { BookingStatus } from '@prisma/client';
import { utcToIstDetails } from './time';

export type StatusTransitionErrorCode =
  | 'INVALID_TRANSITION'
  | 'NO_SHOW_TOO_EARLY'
  | 'CHAIR_BUSY'
  | 'STATUS_CONFLICT'
  | 'WRONG_DAY';

/**
 * Strict Allowed Transitions State Machine:
 * - PENDING: CONFIRMED, REJECTED, CANCELLED
 * - CONFIRMED: CHECKED_IN, IN_PROGRESS, NO_SHOW, CANCELLED
 * - CHECKED_IN: IN_PROGRESS, NO_SHOW, CANCELLED
 * - IN_PROGRESS: COMPLETED
 * - COMPLETED, CANCELLED, REJECTED, NO_SHOW are final: no transitions out.
 */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  [BookingStatus.PENDING]: [
    BookingStatus.CONFIRMED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.CHECKED_IN,
    BookingStatus.IN_PROGRESS,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CHECKED_IN]: [
    BookingStatus.IN_PROGRESS,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.REJECTED]: [],
  [BookingStatus.NO_SHOW]: [],
};

/**
 * Checks if a given status transition is structurally allowed by the state machine.
 */
export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

/**
 * Returns all reachable next statuses from a given current status.
 */
export function getAllowedNextStatuses(current: BookingStatus): readonly BookingStatus[] {
  return ALLOWED_TRANSITIONS[current] || [];
}

/**
 * Checks whether the given status is a terminal / final state.
 */
export function isFinalStatus(status: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[status]?.length === 0;
}

export interface TransitionValidationParams {
  from: BookingStatus;
  to: BookingStatus;
  startsAt: Date;
  now?: Date;
  isChairBusy?: boolean;
}

export type TransitionValidationResult =
  | { ok: true }
  | { ok: false; code: StatusTransitionErrorCode };

/**
 * Pure validation of booking transition rules:
 * 1. Must be an allowed transition.
 * 2. NO_SHOW allowed only after startsAt has passed.
 * 3. IN_PROGRESS allowed only if chair is not busy (barber has at most 1 IN_PROGRESS booking).
 */
export function validateBookingTransition(
  params: TransitionValidationParams
): TransitionValidationResult {
  const { from, to, startsAt, now = new Date(), isChairBusy = false } = params;

  if (!isValidTransition(from, to)) {
    return { ok: false, code: 'INVALID_TRANSITION' };
  }

  // Check-In & Start Wrong-Day Guard: CONFIRMED -> CHECKED_IN / IN_PROGRESS allowed ONLY on same IST calendar day
  if (
    from === BookingStatus.CONFIRMED &&
    (to === BookingStatus.CHECKED_IN || to === BookingStatus.IN_PROGRESS)
  ) {
    const startsAtDateIst = utcToIstDetails(startsAt).dateIst;
    const nowDateIst = utcToIstDetails(now).dateIst;
    if (startsAtDateIst !== nowDateIst) {
      return { ok: false, code: 'WRONG_DAY' };
    }
  }

  if (to === BookingStatus.NO_SHOW) {
    if (now.getTime() < startsAt.getTime()) {
      return { ok: false, code: 'NO_SHOW_TOO_EARLY' };
    }
  }

  if (to === BookingStatus.IN_PROGRESS) {
    if (isChairBusy) {
      return { ok: false, code: 'CHAIR_BUSY' };
    }
  }

  return { ok: true };
}
