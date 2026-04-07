-- Migration: finalize_attendance_table
-- Replaces the unused checkIn/checkOut/latitude/longitude fields on Attendance
-- with proper daily-summary fields: firstCheckIn, lastCheckOut, totalHours
-- Adds indexes for efficient date-range queries

-- Drop old unused columns
ALTER TABLE "Attendance" DROP COLUMN IF EXISTS "checkIn";
ALTER TABLE "Attendance" DROP COLUMN IF EXISTS "checkOut";
ALTER TABLE "Attendance" DROP COLUMN IF EXISTS "latitude";
ALTER TABLE "Attendance" DROP COLUMN IF EXISTS "longitude";

-- Add new daily-summary columns
ALTER TABLE "Attendance" ADD COLUMN "firstCheckIn" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "lastCheckOut" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");
CREATE INDEX IF NOT EXISTS "Attendance_userId_date_idx" ON "Attendance"("userId", "date");
