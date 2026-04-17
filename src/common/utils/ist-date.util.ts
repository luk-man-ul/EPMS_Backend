/**
 * IST Date Utilities
 *
 * Strategy: Store everything in UTC internally (Prisma/PostgreSQL default).
 * Convert to IST only when computing day boundaries for queries and logic.
 *
 * IST = UTC + 5:30 = UTC + 19800 seconds
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

/**
 * Returns the start of the current IST day as a UTC Date.
 * e.g. if IST is 2026-04-07 14:30, returns 2026-04-07T00:00:00 IST = 2026-04-06T18:30:00Z
 */
export function getISTStartOfDay(date?: Date): Date {
  const d = date ? new Date(date.getTime()) : new Date();
  // Shift to IST, zero out time, shift back to UTC
  const istMs = d.getTime() + IST_OFFSET_MS;
  const istMidnight = new Date(istMs);
  istMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(istMidnight.getTime() - IST_OFFSET_MS);
}

/**
 * Returns the end of the current IST day (23:59:59.999 IST) as a UTC Date.
 */
export function getISTEndOfDay(date?: Date): Date {
  const d = date ? new Date(date.getTime()) : new Date();
  const istMs = d.getTime() + IST_OFFSET_MS;
  const istEndOfDay = new Date(istMs);
  istEndOfDay.setUTCHours(23, 59, 59, 999);
  return new Date(istEndOfDay.getTime() - IST_OFFSET_MS);
}

/**
 * Returns the start of the NEXT IST day as a UTC Date.
 * Useful for lt: nextISTDay range queries.
 */
export function getISTStartOfNextDay(date?: Date): Date {
  const startOfDay = getISTStartOfDay(date);
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Returns the IST date string (YYYY-MM-DD) for a given UTC Date.
 * Use this instead of toISOString().split('T')[0] which gives UTC date.
 */
export function toISTDateString(date: Date): string {
  const istMs = date.getTime() + IST_OFFSET_MS;
  return new Date(istMs).toISOString().split('T')[0];
}

/**
 * Returns a UTC Date representing a specific IST time on the current IST day.
 * e.g. getISTTimeToday(9, 30) → 09:30:00 IST today as UTC
 */
export function getISTTimeToday(hours: number, minutes: number, date?: Date): Date {
  const startOfDay = getISTStartOfDay(date);
  return new Date(startOfDay.getTime() + (hours * 60 + minutes) * 60 * 1000);
}

/**
 * Returns a Date representing UTC midnight of the IST calendar date for the given UTC Date.
 *
 * Use this when writing to Prisma @db.Date columns.
 * PostgreSQL stores @db.Date using the UTC date of the provided Date object.
 * Without this, a dayStart of 2026-04-16T18:30:00Z (= IST Apr 17 midnight)
 * would be stored as Apr 16 in the DB — one day behind.
 *
 * e.g. input 2026-04-16T18:30:00Z (IST Apr 17) → returns 2026-04-17T00:00:00.000Z
 */
export function toISTDate(date: Date): Date {
  const istDateStr = toISTDateString(date);
  return new Date(`${istDateStr}T00:00:00.000Z`);
}
