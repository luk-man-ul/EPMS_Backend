import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getISTStartOfDay,
  getISTStartOfNextDay,
  getISTTimeToday,
  toISTDateString,
  toISTDate,
} from '../common/utils/ist-date.util';

/**
 * AttendanceFinalizationService
 *
 * Runs once per day (after midnight auto-checkout) to convert raw
 * AttendanceSession records into a single Attendance daily-summary row
 * per employee.
 *
 * Architecture:
 *   AttendanceSession  →  raw event log  (source of truth, never modified here)
 *   Attendance         →  daily summary  (derived, written by this service)
 */
@Injectable()
export class AttendanceFinalizationService {
  private readonly logger = new Logger(AttendanceFinalizationService.name);

  // Thresholds (IST)
  private readonly LATE_HOUR = 11;
  private readonly LATE_MINUTE = 0;
  private readonly HALF_DAY_CHECKIN_HOUR = 12;
  private readonly HALF_DAY_CHECKIN_MINUTE = 30;
  private readonly HALF_DAY_HOURS = 4;

  // Office geofence — must match AttendanceSessionService constants
  private readonly OFFICE_LATITUDE = 11.982748317280704;
  private readonly OFFICE_LONGITUDE = 75.36459629666871;
  private readonly ALLOWED_RADIUS_METERS = 250;

  /**
   * Haversine distance between two GPS coordinates.
   * Returns distance in meters.
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Returns true if the given coordinates are outside the office geofence.
   */
  private isOutsideOffice(lat: number, lng: number): boolean {
    return (
      this.calculateDistance(lat, lng, this.OFFICE_LATITUDE, this.OFFICE_LONGITUDE) >
      this.ALLOWED_RADIUS_METERS
    );
  }

  constructor(private prisma: PrismaService) {}

  /**
   * Finalize attendance for a specific IST day.
   * Defaults to "today" (the day that just ended when called at 23:59 IST).
   */
  async finalizeDay(targetDate?: Date): Promise<{ finalized: number; absent: number }> {
    const dayStart = getISTStartOfDay(targetDate);
    const dayEnd = getISTStartOfNextDay(targetDate);
    const dateStr = toISTDateString(dayStart);
    // UTC midnight of the IST calendar date — correct value for @db.Date columns
    const istDate = toISTDate(dayStart);

    this.logger.log(`Starting attendance finalization for IST date: ${dateStr}`);

    // ── Step 1: Fetch all active employees (non-admin) ──────────────────────
    const employees = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: { role: { name: { not: 'ADMIN' } } },
        },
      },
      select: { id: true, email: true, workMode: true },
    });

    this.logger.log(`Processing ${employees.length} employees for ${dateStr}`);

    // ── Step 2: Fetch all sessions for this IST day in one query ─────────────
    const allSessions = await this.prisma.attendanceSession.findMany({
      where: {
        checkIn: { gte: dayStart, lt: dayEnd },
      },
      select: {
        userId: true,
        checkIn: true,
        checkOut: true,
        latitude: true,
        longitude: true,
      },
    });

    // Group sessions by userId
    const sessionsByUser = new Map<string, typeof allSessions>();
    for (const session of allSessions) {
      if (!sessionsByUser.has(session.userId)) {
        sessionsByUser.set(session.userId, []);
      }
      sessionsByUser.get(session.userId)!.push(session);
    }

    // ── Step 2b: Fetch all approved WFH requests covering this day ───────────
    // WfhRequest.fromDate/toDate are @db.Date stored as UTC midnight of the IST date.
    // Use istDate (UTC midnight) for comparison — not dayStart (IST midnight as UTC).
    const wfhRequests = await this.prisma.wfhRequest.findMany({
      where: {
        status: 'APPROVED',
        fromDate: { lte: istDate },
        toDate: { gte: istDate },
      },
      select: { userId: true },
    });
    const wfhUserIds = new Set(wfhRequests.map((r) => r.userId));

    // ── Step 2c: Fetch all approved Leave requests covering this day ──────────
    // LeaveRequest.startDate/endDate are @db.Date — same normalization required.
    const leaveRequests = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: istDate },
        endDate: { gte: istDate },
      },
      select: { userId: true },
    });
    const leaveUserIds = new Set(leaveRequests.map((r) => r.userId));

    const lateThreshold = getISTTimeToday(this.LATE_HOUR, this.LATE_MINUTE, dayStart);
    const halfDayCheckInThreshold = getISTTimeToday(this.HALF_DAY_CHECKIN_HOUR, this.HALF_DAY_CHECKIN_MINUTE, dayStart);
    let finalized = 0;
    let absent = 0;

    // ── Step 3: Calculate metrics and upsert Attendance row per employee ─────
    for (const employee of employees) {
      const sessions = sessionsByUser.get(employee.id) ?? [];

      const isWfh = employee.workMode === 'WFH' || wfhUserIds.has(employee.id);
      const isOnLeave = leaveUserIds.has(employee.id);

      const { status, firstCheckIn, lastCheckOut, totalHours } =
        this.calculateDailyStatus(sessions, lateThreshold, halfDayCheckInThreshold, isWfh, isOnLeave);

      if (status === 'ABSENT') {
        absent++;
      } else {
        finalized++;
      }

      // UPSERT — safe to run multiple times (idempotent)
      await this.prisma.attendance.upsert({
        where: {
          userId_date: {
            userId: employee.id,
            date: istDate,
          },
        },
        create: {
          userId: employee.id,
          date: istDate,
          // @ts-ignore — new fields; run `prisma migrate dev && prisma generate` to resolve
          firstCheckIn,
          lastCheckOut,
          totalHours,
          status,
        },
        update: {
          // @ts-ignore — new fields; run `prisma migrate dev && prisma generate` to resolve
          firstCheckIn,
          lastCheckOut,
          totalHours,
          status,
        },
      });
    }

    this.logger.log(
      `Finalization complete for ${dateStr} — ` +
      `Present/Late/WFH/HalfDay: ${finalized}, Absent: ${absent}`,
    );

    return { finalized, absent };
  }

  /**
   * Determine the daily attendance status and metrics from a list of sessions.
   * Public so AttendanceService can reuse this for live-today stats.
   *
   * Priority order (IST):
   *   1. No sessions + on approved leave              → LEAVE
   *   2. No sessions                                  → ABSENT
   *   3. Has session + WFH eligible + outside office  → WFH
   *   4. Has session + all closed + totalHours < 4    → HALF_DAY (checked BEFORE LATE)
   *   5. Has session + firstCheckIn > 11:00 AM        → LATE
   *   6. Has session otherwise                        → PRESENT
   *
   * HALF_DAY is intentionally evaluated before LATE because working fewer than
   * 4 hours is the more critical violation. An employee who arrives late but
   * completes a full day is marked LATE. An employee who arrives on time but
   * leaves early (< 4h) is marked HALF_DAY. An employee who arrives late AND
   * works < 4h is marked HALF_DAY (the more severe status).
   */
  calculateDailyStatus(
    sessions: Array<{
      checkIn: Date;
      checkOut: Date | null;
      latitude?: number | null;
      longitude?: number | null;
    }>,
    lateThreshold: Date,
    halfDayCheckInThreshold: Date,
    isWfh: boolean = false,
    isOnLeave: boolean = false,
  ): {
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'WFH' | 'LEAVE';
    firstCheckIn: Date | null;
    lastCheckOut: Date | null;
    totalHours: number;
  } {
    // No session → LEAVE if on approved leave, otherwise ABSENT
    if (sessions.length === 0) {
      return {
        status: isOnLeave ? 'LEAVE' : 'ABSENT',
        firstCheckIn: null,
        lastCheckOut: null,
        totalHours: 0,
      };
    }

    // First check-in (earliest)
    const firstCheckIn = sessions.reduce(
      (min, s) => (s.checkIn < min ? s.checkIn : min),
      sessions[0].checkIn,
    );

    // Last check-out (latest completed session)
    const completedSessions = sessions.filter((s) => s.checkOut !== null);
    const lastCheckOut =
      completedSessions.length > 0
        ? completedSessions.reduce(
            (max, s) => (s.checkOut! > max ? s.checkOut! : max),
            completedSessions[0].checkOut!,
          )
        : null;

    // Total hours across all completed sessions
    const totalHours = completedSessions.reduce((sum, s) => {
      const hours = (s.checkOut!.getTime() - s.checkIn.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    const roundedHours = Math.round(totalHours * 100) / 100;

    // 1. WFH — eligible AND checked in from outside office
    //    If eligible but inside office → treat as normal onsite (PRESENT/LATE/HALF_DAY)
    if (isWfh) {
      const earliestSession = sessions.reduce(
        (min, s) => (s.checkIn < min.checkIn ? s : min),
        sessions[0],
      );
      const lat = earliestSession.latitude;
      const lng = earliestSession.longitude;
      if (lat != null && lng != null && this.isOutsideOffice(lat, lng)) {
        return { status: 'WFH', firstCheckIn, lastCheckOut, totalHours: roundedHours };
      }
    }

    // 2. HALF_DAY — all sessions closed AND totalHours < 4
    //    Evaluated BEFORE LATE: an employee who arrives late AND works < 4h
    //    is HALF_DAY (the more severe outcome — they didn't complete a workday).
    //    Requires lastCheckOut != null so a still-active session is never
    //    prematurely classified as HALF_DAY mid-day.
    if (lastCheckOut !== null && roundedHours < this.HALF_DAY_HOURS) {
      return { status: 'HALF_DAY', firstCheckIn, lastCheckOut, totalHours: roundedHours };
    }

    // 3. LATE — checked in after 11:00 AM IST
    //    Only reached if the employee completed a full day (>= 4h or still active).
    if (firstCheckIn > lateThreshold) {
      return { status: 'LATE', firstCheckIn, lastCheckOut, totalHours: roundedHours };
    }

    // 4. PRESENT
    return { status: 'PRESENT', firstCheckIn, lastCheckOut, totalHours: roundedHours };
  }
}
