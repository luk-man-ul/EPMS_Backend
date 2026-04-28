import { toISTDateString } from './ist-date.util';

/**
 * Returns the IST day-of-week for a UTC Date.
 * IST = UTC + 5h30m
 * Returns 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
function getISTDayOfWeek(date: Date): number {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istMs = date.getTime() + IST_OFFSET_MS;
  return new Date(istMs).getUTCDay();
}

/**
 * Returns true if the given UTC Date falls on a working day in IST:
 * - Not Saturday (6) or Sunday (0)
 * - Not present in holidayDates (Set of YYYY-MM-DD IST strings)
 */
export function isWorkingDay(date: Date, holidayDates?: Set<string>): boolean {
  const dow = getISTDayOfWeek(date);
  if (dow === 0 || dow === 6) return false;
  if (holidayDates?.has(toISTDateString(date))) return false;
  return true;
}

/**
 * Returns an array of IST YYYY-MM-DD strings for all working days in [start, end).
 * Iterates day by day using IST midnight boundaries.
 */
export function getWorkingDaysInRange(
  start: Date,
  end: Date,
  holidayDates?: Set<string>,
): string[] {
  const result: string[] = [];
  // Advance by 24h at a time; use IST date string to avoid DST issues
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  let current = new Date(start.getTime());
  while (current < end) {
    if (isWorkingDay(current, holidayDates)) {
      result.push(toISTDateString(current));
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}

/**
 * Returns the count of working days in [start, end).
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidayDates?: Set<string>,
): number {
  return getWorkingDaysInRange(start, end, holidayDates).length;
}
