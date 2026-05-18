/**
 * cleanup-invalid-weekend-attendance.ts
 *
 * One-time cleanup script that removes semantically invalid Attendance rows
 * where the date falls on a weekend (Saturday or Sunday in IST) AND the
 * status is ABSENT or LEAVE.
 *
 * These rows were created by a historical bug in the live-injection path of
 * getAttendanceRecords() which lacked the non-working-day guard. They cause
 * the calendar frontend to incorrectly display "Worked on Weekend" for users
 * who did not actually work.
 *
 * SAFE TO RUN MULTIPLE TIMES — idempotent.
 *
 * PRESERVES:
 *   - PRESENT, LATE, WFH, HALF_DAY rows on weekends (legitimate weekend work)
 *
 * DELETES:
 *   - ABSENT rows on weekend dates
 *   - LEAVE rows on weekend dates
 *
 * Usage:
 *   npx ts-node scripts/cleanup-invalid-weekend-attendance.ts
 *
 * Or with the pg Pool directly (no Prisma needed):
 *   node -r ts-node/register scripts/cleanup-invalid-weekend-attendance.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** IST offset in milliseconds */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns the IST day-of-week for a UTC Date.
 * 0 = Sunday, 6 = Saturday
 */
function getISTDayOfWeek(utcDate: Date): number {
  return new Date(utcDate.getTime() + IST_OFFSET_MS).getUTCDay();
}

/**
 * Returns true if the given UTC Date falls on a Saturday or Sunday in IST.
 */
function isWeekendIST(utcDate: Date): boolean {
  const dow = getISTDayOfWeek(utcDate);
  return dow === 0 || dow === 6;
}

async function main() {
  console.log('=== Attendance Weekend Cleanup Script ===');
  console.log('Started at:', new Date().toISOString());
  console.log('');

  // ── Step 1: Fetch all ABSENT and LEAVE attendance rows ──────────────────────
  // We fetch all of them and filter in JS using IST day-of-week logic.
  // This avoids writing raw SQL with timezone arithmetic and keeps the logic
  // consistent with the rest of the codebase.
  console.log('Fetching ABSENT and LEAVE attendance rows...');

  const candidates = await prisma.attendance.findMany({
    where: {
      status: { in: ['ABSENT', 'LEAVE'] },
    },
    select: {
      id: true,
      userId: true,
      date: true,
      status: true,
    },
  });

  console.log(`Found ${candidates.length} ABSENT/LEAVE rows total.`);

  // ── Step 2: Filter to weekend dates only ────────────────────────────────────
  const weekendInvalidRows = candidates.filter((row) => isWeekendIST(row.date));

  console.log(`Of those, ${weekendInvalidRows.length} fall on weekend dates (IST).`);

  if (weekendInvalidRows.length === 0) {
    console.log('');
    console.log('✅ Nothing to clean up. Database is already clean.');
    return;
  }

  // ── Step 3: Log what will be deleted ────────────────────────────────────────
  console.log('');
  console.log('Rows to be deleted:');
  for (const row of weekendInvalidRows) {
    const dow = getISTDayOfWeek(row.date);
    const dayName = dow === 0 ? 'Sunday' : 'Saturday';
    const dateStr = new Date(row.date.getTime() + IST_OFFSET_MS).toISOString().split('T')[0];
    console.log(`  - id=${row.id} | userId=${row.userId} | date=${dateStr} (${dayName}) | status=${row.status}`);
  }

  // ── Step 4: Delete in a single batch ────────────────────────────────────────
  const idsToDelete = weekendInvalidRows.map((r) => r.id);

  console.log('');
  console.log(`Deleting ${idsToDelete.length} rows...`);

  const result = await prisma.attendance.deleteMany({
    where: {
      id: { in: idsToDelete },
      // Double-safety: only delete ABSENT/LEAVE — never touch work statuses
      status: { in: ['ABSENT', 'LEAVE'] },
    },
  });

  console.log(`✅ Deleted ${result.count} rows.`);
  console.log('');

  // ── Step 5: Verify no legitimate weekend work rows were touched ─────────────
  const remainingWeekendWork = await prisma.attendance.findMany({
    where: {
      status: { in: ['PRESENT', 'LATE', 'WFH', 'HALF_DAY'] },
    },
    select: { id: true, date: true, status: true },
  });

  const weekendWorkRows = remainingWeekendWork.filter((r) => isWeekendIST(r.date));
  console.log(`Verification: ${weekendWorkRows.length} legitimate weekend work rows remain untouched.`);
  console.log('');
  console.log('=== Cleanup Complete ===');
  console.log('Finished at:', new Date().toISOString());
}

main()
  .catch((err) => {
    console.error('Cleanup script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
