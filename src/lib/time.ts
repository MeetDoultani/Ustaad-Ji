/**
 * Time utilities for Indian Salon Booking.
 * Database stores UTC (timestamptz), while all salon business logic
 * and daily hours operate in Indian Standard Time (IST / Asia/Kolkata, UTC+05:30).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

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
 * Get current day of week (0=Sunday ... 6=Saturday) and minutes from midnight in IST.
 */
export function getIstWeekdayAndMinutes(date: Date = new Date()): {
  weekday: number;
  minutesFromMidnight: number;
} {
  const istDateString = date.toLocaleString('en-US', { timeZone: IST_TIMEZONE });
  const istDate = new Date(istDateString);
  const weekday = istDate.getDay(); // 0 is Sunday
  const minutesFromMidnight = istDate.getHours() * 60 + istDate.getMinutes();

  return { weekday, minutesFromMidnight };
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

  const { weekday, minutesFromMidnight } = getIstWeekdayAndMinutes(currentDate);
  const todayHour = hours.find((h) => h.weekday === weekday);

  if (!todayHour || todayHour.isClosed) {
    return false;
  }

  return (
    minutesFromMidnight >= todayHour.openMin &&
    minutesFromMidnight < todayHour.closeMin
  );
}
