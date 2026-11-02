/**
 * Time utilities for Indian Salon Booking.
 * Database stores UTC (timestamptz), while all salon business logic
 * and daily hours operate in Indian Standard Time (IST / Asia/Kolkata, UTC+05:30).
 *
 * IST is fixed at UTC+05:30 (+330 minutes) with no daylight saving time (DST).
 * All calculations here use pure UTC arithmetic with the +330 min offset or
 * Intl.DateTimeFormat with timeZone: 'Asia/Kolkata', completely independent
 * of the server's local environment timezone.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

/**
 * Format minutes from midnight (0..1439) into 12-hour AM/PM string.
 * Example: 570 -> "9:30 AM", 720 -> "12:00 PM", 1260 -> "9:00 PM"
 */
export function formatMinutesToTime(minutes: number): string {
  if (minutes < 0 || isNaN(minutes)) return '12:00 AM';
  const normalized = Math.floor(minutes) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const paddedMins = mins.toString().padStart(2, '0');

  return `${hours12}:${paddedMins} ${period}`;
}

/**
 * Convert a UTC Date to its IST calendar date string (YYYY-MM-DD),
 * weekday (0 = Sunday ... 6 = Saturday), and minutes-from-midnight (0..1439).
 * Uses pure UTC arithmetic with the +330 minute IST offset, guaranteeing
 * identical results on servers running under any local timezone (UTC, EST, IST, etc.).
 */
export function utcToIstDetails(date: Date = new Date()): {
  dateIst: string;
  weekday: number;
  minutesFromMidnight: number;
  year: number;
  month: number;
  day: number;
} {
  const istWallClockTime = new Date(date.getTime() + IST_OFFSET_MS);

  const year = istWallClockTime.getUTCFullYear();
  const month = istWallClockTime.getUTCMonth() + 1;
  const day = istWallClockTime.getUTCDate();
  const weekday = istWallClockTime.getUTCDay();
  const hours = istWallClockTime.getUTCHours();
  const minutes = istWallClockTime.getUTCMinutes();

  const paddedMonth = month.toString().padStart(2, '0');
  const paddedDay = day.toString().padStart(2, '0');
  const dateIst = `${year}-${paddedMonth}-${paddedDay}`;
  const minutesFromMidnight = hours * 60 + minutes;

  return {
    dateIst,
    weekday,
    minutesFromMidnight,
    year,
    month,
    day,
  };
}

/**
 * Convert an IST calendar date string ("YYYY-MM-DD") and minutes-from-midnight (0..1440)
 * into a UTC Date object.
 * Example: ("2026-11-05", 570) -> UTC Date for 2026-11-05 09:30 IST (04:00:00.000Z UTC).
 */
export function istToUtcDate(dateIst: string, minutesFromMidnight: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIst.trim());
  if (!match) {
    throw new Error(`Invalid IST date format: "${dateIst}". Expected YYYY-MM-DD.`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // UTC epoch milliseconds of midnight for that calendar date, minus 330 min offset to IST midnight, plus slot minutes
  const istMidnightUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS;
  const slotUtcMs = istMidnightUtcMs + minutesFromMidnight * 60 * 1000;

  return new Date(slotUtcMs);
}

/**
 * List the next N calendar dates (YYYY-MM-DD) in IST starting from now.
 * e.g., getNextIstDates(14, now) returns [today, tomorrow, ..., day 13].
 */
export function getNextIstDates(count: number, now: Date = new Date()): string[] {
  if (count <= 0) return [];
  const { dateIst } = utcToIstDetails(now);
  const dates: string[] = [];

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIst)!;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  for (let i = 0; i < count; i++) {
    const dayMs = Date.UTC(y, m - 1, d + i, 0, 0, 0, 0);
    const dayDate = new Date(dayMs);
    const yr = dayDate.getUTCFullYear();
    const mo = (dayDate.getUTCMonth() + 1).toString().padStart(2, '0');
    const da = dayDate.getUTCDate().toString().padStart(2, '0');
    dates.push(`${yr}-${mo}-${da}`);
  }

  return dates;
}

/**
 * Format a UTC Date instant as IST 12-hour time (e.g. "10:30 AM").
 */
export function formatIstTime(date: Date): string {
  const { minutesFromMidnight } = utcToIstDetails(date);
  return formatMinutesToTime(minutesFromMidnight);
}

/**
 * Format a date as a localised IST string in English or Hindi.
 * Example (EN): "Thu, 5 Nov" or "Thu, 5 Nov 2026"
 * Example (HI): "गुरु, 5 नवं"
 */
export function formatIstDate(
  dateOrDateIst: Date | string,
  locale: 'en' | 'hi' = 'en',
  options?: Intl.DateTimeFormatOptions
): string {
  const utcDate =
    typeof dateOrDateIst === 'string'
      ? istToUtcDate(dateOrDateIst, 720) // Midday IST
      : dateOrDateIst;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };

  const intlLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(intlLocale, options || defaultOptions).format(utcDate);
}

/**
 * Normalise an IST date string or UTC Date to a UTC midnight Date
 * for Postgres @db.Date column (Booking.tokenDate).
 * Example: '2026-11-05' -> 2026-11-05T00:00:00.000Z.
 */
export function toTokenDateUtc(dateIstOrUtcDate: string | Date): Date {
  const dateStr =
    typeof dateIstOrUtcDate === 'string'
      ? dateIstOrUtcDate.trim()
      : utcToIstDetails(dateIstOrUtcDate).dateIst;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format for toTokenDateUtc: "${dateStr}". Expected YYYY-MM-DD.`);
  }

  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

export interface SalonHourRecord {
  weekday: number;
  openMin: number;
  closeMin: number;
  isClosed: boolean;
}

/**
 * Check if a salon is currently open in IST time given its hours schedule.
 */
export function isSalonOpenNow(
  hours: SalonHourRecord[] | undefined,
  currentDate: Date = new Date()
): boolean {
  if (!hours || hours.length === 0) return false;

  const { weekday, minutesFromMidnight } = utcToIstDetails(currentDate);
  const todayHour = hours.find((h) => h.weekday === weekday);

  if (!todayHour || todayHour.isClosed) {
    return false;
  }

  return (
    minutesFromMidnight >= todayHour.openMin &&
    minutesFromMidnight < todayHour.closeMin
  );
}

export function getIstWeekdayAndMinutes(date: Date = new Date()): {
  weekday: number;
  minutesFromMidnight: number;
} {
  const { weekday, minutesFromMidnight } = utcToIstDetails(date);
  return { weekday, minutesFromMidnight };
}
