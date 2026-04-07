import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AttendanceSessionService } from './attendance-session.service';
import { getISTStartOfDay, getISTStartOfNextDay, getISTTimeToday, toISTDateString } from '../common/utils/ist-date.util';

// IST thresholds — must match attendance-finalization.service.ts
const LATE_HOUR = 10;
const LATE_MINUTE = 30;
const HALF_DAY_CHECKIN_HOUR = 12;
const HALF_DAY_CHECKIN_MINUTE = 30;
const HALF_DAY_HOURS = 4;
const MAX_SESSION_HOURS = 12; // matches AttendanceSessionService.MAX_SESSION_HOURS

type AttendanceStatusValue = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'WFH' | 'ABSENT';

/**
 * Compute a real-time attendance status from live session data.
 * Uses the same priority and thresholds as AttendanceFinalizationService.calculateDailyStatus().
 *
 * Priority: WFH > HALF_DAY > LATE > PRESENT
 *
 * @param isWfh - true if the employee is permanent WFH or has an approved WFH request for today
 */
function calculateLiveStatus(
  sessions: Array<{ checkIn: string | Date; checkOut: string | Date | null; workMode: string }>,
  isWfh: boolean = false,
): AttendanceStatusValue {
  // WFH takes priority — check before anything else
  if (isWfh) {
    if (!sessions || sessions.length === 0) return 'WFH';
    // Still compute firstCheckIn/totalHours for display, but status is WFH
    return 'WFH';
  }

  if (!sessions || sessions.length === 0) return 'ABSENT';

  // Sort ascending by checkIn
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
  );

  const firstCheckIn = new Date(sorted[0].checkIn);

  // Total hours — include ongoing open sessions using current time as end.
  // Cap each session at MAX_SESSION_HOURS to prevent stale/cross-day inflation.
  const now = new Date();
  const maxSessionMs = MAX_SESSION_HOURS * 60 * 60 * 1000;
  const totalHours = sorted.reduce((sum, s) => {
    const start = new Date(s.checkIn);
    const end = s.checkOut ? new Date(s.checkOut) : now;
    const rawDuration = end.getTime() - start.getTime();
    // Skip invalid/negative durations (clock skew, bad data)
    if (rawDuration <= 0) return sum;
    // Cap at MAX_SESSION_HOURS to guard against cross-day or stale sessions
    const duration = Math.min(rawDuration, maxSessionMs);
    return sum + duration / (1000 * 60 * 60);
  }, 0);

  // Compute IST thresholds relative to the check-in day
  const lateThreshold = getISTTimeToday(LATE_HOUR, LATE_MINUTE, firstCheckIn);
  const halfDayCheckInThreshold = getISTTimeToday(HALF_DAY_CHECKIN_HOUR, HALF_DAY_CHECKIN_MINUTE, firstCheckIn);

  // HALF_DAY: very late check-in OR short hours
  if (firstCheckIn > halfDayCheckInThreshold) return 'HALF_DAY';
  if (totalHours > 0 && totalHours < HALF_DAY_HOURS) return 'HALF_DAY';

  // LATE: check-in after 10:30 AM IST
  if (firstCheckIn > lateThreshold) return 'LATE';

  return 'PRESENT';
}

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private sessionService: AttendanceSessionService,
  ) {}

  async checkIn(userId: string, latitude: number, longitude: number) {
    return this.sessionService.checkIn(userId, latitude, longitude);
  }

  async checkOut(userId: string) {
    return this.sessionService.checkOut(userId);
  }

  /**
   * GET /attendance/my
   * Returns finalized Attendance rows for the current user.
   * Falls back to live session grouping for days not yet finalized.
   */
  async findMyAttendance(userId: string, filters: any = {}) {
    return this.getAttendanceRecords({ ...filters, userId }, { id: userId, role: 'EMPLOYEE' });
  }

  async findTodayAttendance(userId: string) {
    return this.sessionService.getTodaySessions(userId);
  }

  /**
   * GET /attendance
   * Returns finalized Attendance rows with optional filters.
   * Falls back to live session grouping for days not yet finalized (today).
   */
  async findAll(filters: any, user: any) {
    return this.getAttendanceRecords(filters, user);
  }

  async midnightAutoCheckout() {
    return this.sessionService.midnightAutoCheckout();
  }

  async autoCheckoutLongSessions() {
    return this.sessionService.autoCheckoutLongSessions();
  }

  /**
   * Core query: reads from the Attendance (finalized) table.
   * For today (not yet finalized), merges live session data.
   */
  private async getAttendanceRecords(filters: any, user: any) {
    const userRole = user.role;
    const where: any = {};

    // Role-based scoping
    if (userRole === 'EMPLOYEE') {
      where.userId = user.id;
    } else if (userRole === 'TEAM_LEAD') {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }
    // ADMIN: no restriction

    // Explicit userId filter (admin/team lead only)
    if (filters.userId && userRole !== 'EMPLOYEE') {
      where.userId = filters.userId;
    }

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Date range filter — Attendance.date is @db.Date stored as UTC midnight
    if (filters.startDate) {
      where.date = { ...where.date, gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      const nextDay = new Date(end);
      nextDay.setUTCDate(end.getUTCDate() + 1);
      where.date = { ...where.date, lt: nextDay };
    }

    const pageNumber = Number(filters.page) || 1;
    const limitNumber = Number(filters.limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, department: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limitNumber,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    // Normalize: serialize date as YYYY-MM-DD string and include sessions array
    // (sessions are empty for finalized records — live sessions only on /today)
    const data = records.map((r) => ({
      userId: r.userId,
      user: r.user,
      date: toISTDateString(r.date),
      firstCheckIn: r.firstCheckIn?.toISOString() ?? null,
      lastCheckOut: r.lastCheckOut?.toISOString() ?? null,
      totalHours: r.totalHours,
      status: r.status,
      sessions: [], // finalized records don't carry raw sessions
    }));

    // If today is within the requested range and has no finalized record yet,
    // supplement with live session data with a computed real status.
    // When a status filter is active, only inject today's records whose live
    // status matches the filter — avoids polluting filtered results.
    const todayStr = toISTDateString(new Date());
    const hasToday = !filters.startDate || filters.startDate <= todayStr;
    const todayAlreadyFinalized = data.some((r) => r.date === todayStr);
    const statusFilterActive = !!filters.status;

    if (hasToday && !todayAlreadyFinalized) {
      const liveData = await this.sessionService.getAllSessions(
        { startDate: todayStr, endDate: todayStr },
        user,
      );

      // Fetch WFH context for all users in the live result in one query
      const liveUserIds = liveData.data.map((r: any) => r.userId);
      const todayIST = getISTStartOfDay();

      // Approved WFH requests covering today
      const wfhRequests = liveUserIds.length > 0
        ? await this.prisma.wfhRequest.findMany({
            where: {
              userId: { in: liveUserIds },
              status: 'APPROVED',
              fromDate: { lte: todayIST },
              toDate: { gte: todayIST },
            },
            select: { userId: true },
          })
        : [];
      const wfhRequestUserIds = new Set(wfhRequests.map((r) => r.userId));

      // Permanent WFH employees
      const permanentWfhUsers = liveUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: liveUserIds }, workMode: 'WFH' },
            select: { id: true },
          })
        : [];
      const permanentWfhUserIds = new Set(permanentWfhUsers.map((u) => u.id));

      // Normalize live records: derive firstCheckIn/lastCheckOut from sessions
      // sorted ascending so index 0 is always the earliest check-in.
      // Compute a real status using the same logic as finalization — no temp labels.
      const liveRecords = liveData.data.map((record: any) => {
        const sorted = [...(record.sessions ?? [])].sort(
          (a: any, b: any) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
        );
        const completedSorted = sorted.filter((s: any) => s.checkOut);
        const isWfh = permanentWfhUserIds.has(record.userId) || wfhRequestUserIds.has(record.userId);
        return {
          ...record,
          firstCheckIn: sorted[0]?.checkIn ?? null,
          lastCheckOut: completedSorted.at(-1)?.checkOut ?? null,
          status: calculateLiveStatus(record.sessions ?? [], isWfh),
        };
      });

      // If a status filter is active, only include today's records that match
      const toInject = statusFilterActive
        ? liveRecords.filter((r: any) => r.status === filters.status)
        : liveRecords;

      data.unshift(...toInject);
    }

    return {
      data,
      total: total + (hasToday && !todayAlreadyFinalized ? 1 : 0),
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  private async getTeamMemberIds(teamLeadId: string): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { leadId: teamLeadId },
      include: { members: { select: { userId: true } } },
    });

    const memberIds = new Set<string>();
    projects.forEach(project => {
      project.members.forEach(member => memberIds.add(member.userId));
    });

    return Array.from(memberIds);
  }
}
