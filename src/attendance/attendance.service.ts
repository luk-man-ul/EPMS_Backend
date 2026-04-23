import {
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceFinalizationService } from './attendance-finalization.service';
import { getISTStartOfDay, getISTStartOfNextDay, getISTTimeToday, toISTDateString, toISTDate } from '../common/utils/ist-date.util';

// IST thresholds — must match attendance-finalization.service.ts
const LATE_HOUR = 11;
const LATE_MINUTE = 0;
const HALF_DAY_CHECKIN_HOUR = 12;
const HALF_DAY_CHECKIN_MINUTE = 30;

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private sessionService: AttendanceSessionService,
    private finalizationService: AttendanceFinalizationService,
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
   * Manual trigger for finalization — used for debugging and backfill.
   * Pass targetDate as YYYY-MM-DD to finalize a specific past day.
   * Defaults to today (IST) if no date provided.
   */
  async runFinalization(targetDateStr?: string): Promise<{ finalized: number; absent: number }> {
    const targetDate = targetDateStr
      ? new Date(`${targetDateStr}T12:00:00`)  // noon anchor avoids IST day shift
      : undefined;
    return this.finalizationService.finalizeDay(targetDate);
  }

  /**
   * GET /attendance/sessions?userId=<id>&date=YYYY-MM-DD
   *
   * Returns all raw AttendanceSession rows for a specific user on a specific
   * IST calendar day. Works for today, past days, and any future date.
   *
   * Uses the same IST day-boundary utilities as the rest of the system so
   * sessions after 18:30 UTC (midnight IST) are never shifted to the wrong day.
   */
  async getSessionsByDate(
    userId: string,
    date: string,
  ): Promise<Array<{
    id: string;
    checkIn: string;
    checkOut: string | null;
    duration: number | null;
  }>> {
    // Noon anchor: prevents IST day shift when constructing the Date object
    const dayStart = getISTStartOfDay(new Date(`${date}T12:00:00`));
    const dayEnd   = getISTStartOfNextDay(new Date(`${date}T12:00:00`));

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        userId,
        checkIn: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { checkIn: 'asc' },
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      checkIn: s.checkIn.toISOString(),
      checkOut: s.checkOut?.toISOString() ?? null,
      // duration in hours, rounded to 2 decimal places; null if session still open
      duration: s.checkOut !== null
        ? Math.round(((s.checkOut.getTime() - s.checkIn.getTime()) / 3_600_000) * 100) / 100
        : null,
    }));
  }

  /**
   * Core query: reads from the Attendance (finalized) table.
   * For today (not yet finalized), merges live session data.
   */
  private async getAttendanceRecords(filters: any, user: any) {
    const userRole = user.role;
    const where: any = {};

    // Role-based scoping
    let scopedUserIds: string[] | null = null;
    if (userRole === 'EMPLOYEE') {
      where.userId = user.id;
      scopedUserIds = [user.id];
    } else if (userRole === 'TEAM_LEAD') {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
      scopedUserIds = teamMemberIds;
    }
    // ADMIN: no restriction

    // Explicit userId filter (admin/team lead only)
    if (filters.userId && userRole !== 'EMPLOYEE') {
      where.userId = filters.userId;
      scopedUserIds = [filters.userId];
    }

    // Resolve all employee IDs in scope (needed for today's absent injection)
    const employeeWhere: any = {
      status: 'ACTIVE',
      roles: { some: { role: { name: { not: 'ADMIN' } } } },
    };
    if (scopedUserIds) employeeWhere.id = { in: scopedUserIds };
    const allEmployeeIds: string[] = scopedUserIds ?? await this.prisma.user
      .findMany({ where: employeeWhere, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Date range filter — Attendance.date is @db.Date stored as UTC midnight of the IST date
    if (filters.startDate) {
      where.date = { ...where.date, gte: new Date(`${filters.startDate}T00:00:00.000Z`) };
    }
    if (filters.endDate) {
      // lt: day after endDate (UTC midnight)
      const endDateStr = filters.endDate as string;
      const endPlusOne = new Date(new Date(`${endDateStr}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
      where.date = { ...where.date, lt: endPlusOne };
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
    const hasToday = (!filters.startDate || filters.startDate <= todayStr)
                  && (!filters.endDate   || filters.endDate   >= todayStr);
    const todayAlreadyFinalized = data.some((r) => r.date === todayStr);
    const statusFilterActive = !!filters.status;

    if (hasToday && !todayAlreadyFinalized) {
      const todayIST = getISTStartOfDay();

      // Fetch all today's sessions for scoped users
      const sessionWhere: any = {
        checkIn: { gte: todayIST, lt: getISTStartOfNextDay() },
      };
      if (allEmployeeIds.length > 0) sessionWhere.userId = { in: allEmployeeIds };

      const todaySessions = await this.prisma.attendanceSession.findMany({
        where: sessionWhere,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, department: true } },
        },
        orderBy: { checkIn: 'asc' },
      });
      // Group sessions by userId
      const sessionsByUser = new Map<string, typeof todaySessions>();
      for (const s of todaySessions) {
        if (!sessionsByUser.has(s.userId)) sessionsByUser.set(s.userId, []);
        sessionsByUser.get(s.userId)!.push(s);
      }

      // Determine which users to process for today (allEmployeeIds already accounts for userId filter)
      const todayUserIds = allEmployeeIds;

      // Fetch WFH context for all today's users in one query
      // WfhRequest/LeaveRequest dates are @db.Date stored as UTC midnight — use toISTDate() for comparison.
      const todayISTDate = toISTDate(todayIST);
      const [wfhRequests, permanentWfhUsers, userMap, leaveRequests] = await Promise.all([
        this.prisma.wfhRequest.findMany({
          where: {
            userId: { in: todayUserIds },
            status: 'APPROVED',
            fromDate: { lte: todayISTDate },
            toDate: { gte: todayISTDate },
          },
          select: { userId: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: todayUserIds }, workMode: 'WFH' },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: todayUserIds } },
          select: { id: true, firstName: true, lastName: true, email: true, department: true },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            userId: { in: todayUserIds },
            status: 'APPROVED',
            startDate: { lte: todayISTDate },
            endDate: { gte: todayISTDate },
          },
          select: { userId: true },
        }),
      ]);

      const wfhRequestUserIds = new Set(wfhRequests.map((r) => r.userId));
      const permanentWfhUserIds = new Set(permanentWfhUsers.map((u) => u.id));
      const userInfoMap = new Map(userMap.map((u) => [u.id, u]));
      const leaveUserIds = new Set(leaveRequests.map((r) => r.userId));

      const lateThreshold = getISTTimeToday(LATE_HOUR, LATE_MINUTE, todayIST);
      const halfDayThreshold = getISTTimeToday(HALF_DAY_CHECKIN_HOUR, HALF_DAY_CHECKIN_MINUTE, todayIST);

      const liveRecords: any[] = [];

      for (const uid of todayUserIds) {
        const sessions = sessionsByUser.get(uid) ?? [];
        const isWfh = permanentWfhUserIds.has(uid) || wfhRequestUserIds.has(uid);
        const isOnLeave = leaveUserIds.has(uid);
        const { status, firstCheckIn, lastCheckOut, totalHours } =
          this.finalizationService.calculateDailyStatus(sessions, lateThreshold, halfDayThreshold, isWfh, isOnLeave);

        const userInfo = userInfoMap.get(uid);
        const sorted = [...sessions].sort(
          (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
        );

        liveRecords.push({
          userId: uid,
          user: userInfo ?? null,
          date: todayStr,
          firstCheckIn: firstCheckIn?.toISOString() ?? null,
          lastCheckOut: lastCheckOut?.toISOString() ?? null,
          totalHours: Math.round(totalHours * 100) / 100,
          status,
          sessions: sorted,
        });
      }

      // If a status filter is active, only include today's records that match
      const toInject = statusFilterActive
        ? liveRecords.filter((r: any) => r.status === filters.status)
        : liveRecords;

      data.unshift(...toInject);
    }

    // Count how many live records were injected for today (before status filter)
    // We track this via allEmployeeIds length when today is in range and not finalized
    const liveInjectedCount = (hasToday && !todayAlreadyFinalized)
      ? (filters.userId && userRole !== 'EMPLOYEE' ? 1 : allEmployeeIds.length)
      : 0;

    return {
      data,
      total: total + liveInjectedCount,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  /**
   * GET /attendance/stats
   * Returns aggregated attendance statistics for the given date range / user scope.
   *
   * Single-day mode: counts each user's status for that day directly.
   * Range mode: aggregates all rows normally, then normalizes by totalDays.
   *   Missing users per day are counted as ABSENT.
   *   Returns normalized averages + attendanceRate in meta.
   */
  async getStats(filters: any, user: any): Promise<{
    totalEmployees: number;
    present: number;
    onsite: number;
    wfh: number;
    late: number;
    halfDay: number;
    onLeave: number;
    absent: number;
    meta?: { mode: string; totalDays: number; avgAttendance: number };
  }> {
    // ── 1. Resolve date range ────────────────────────────────────────────────
    const todayStr = toISTDateString(new Date());
    const startDate: string = filters.startDate || todayStr;
    const endDate: string   = filters.endDate   || todayStr;
    const isSingleDay = startDate === endDate;

    const startIST = getISTStartOfDay(new Date(`${startDate}T12:00:00`));
    const endIST   = getISTStartOfNextDay(new Date(`${endDate}T12:00:00`));

    // ── 2. Scope ─────────────────────────────────────────────────────────────
    const userRole = user.role;
    let scopedUserIds: string[] | null = null;

    if (userRole === 'EMPLOYEE') {
      scopedUserIds = [user.id];
    } else if (userRole === 'TEAM_LEAD') {
      scopedUserIds = await this.getTeamMemberIds(user.id);
    }
    if (filters.userId && userRole !== 'EMPLOYEE') {
      scopedUserIds = [filters.userId];
    }

    // ── 3. Total employees ───────────────────────────────────────────────────
    const employeeWhere: any = {
      status: 'ACTIVE',
      roles: { some: { role: { name: { not: 'ADMIN' } } } },
    };
    if (scopedUserIds) employeeWhere.id = { in: scopedUserIds };

    const [totalEmployees, allEmployeeIds] = await Promise.all([
      this.prisma.user.count({ where: employeeWhere }),
      scopedUserIds
        ? Promise.resolve(scopedUserIds)
        : this.prisma.user.findMany({ where: employeeWhere, select: { id: true } })
            .then((rows) => rows.map((r) => r.id)),
    ]);

    // ── 4. Fetch finalized Attendance rows ───────────────────────────────────
    // Attendance.date is stored as UTC midnight of the IST calendar date.
    // Build query boundaries as UTC midnight values from the YYYY-MM-DD strings.
    const attendanceDateStart = new Date(`${startDate}T00:00:00.000Z`);
    const attendanceDateEnd   = new Date(`${endDate}T00:00:00.000Z`);
    attendanceDateEnd.setUTCDate(attendanceDateEnd.getUTCDate() + 1); // lt: day after endDate

    const attendanceWhere: any = { date: { gte: attendanceDateStart, lt: attendanceDateEnd } };
    if (scopedUserIds) attendanceWhere.userId = { in: scopedUserIds };

    const attendanceRows = await this.prisma.attendance.findMany({
      where: attendanceWhere,
      select: { userId: true, status: true, date: true },
    });

    // ── 5. Live data for today if not yet finalized ──────────────────────────
    const todayIST = getISTStartOfDay();
    const todayInRange = startIST <= todayIST && todayIST < endIST;
    const todayAlreadyFinalized = attendanceRows.some(
      (r) => toISTDateString(r.date) === todayStr,
    );

    const liveRows: Array<{ userId: string; status: string; date: string }> = [];

    if (todayInRange && !todayAlreadyFinalized) {
      const sessionWhere: any = {
        checkIn: { gte: todayIST, lt: getISTStartOfNextDay() },
      };
      if (scopedUserIds) sessionWhere.userId = { in: scopedUserIds };

      const todaySessions = await this.prisma.attendanceSession.findMany({
        where: sessionWhere,
        select: { userId: true, checkIn: true, checkOut: true, latitude: true, longitude: true },
      });

      const sessionsByUser = new Map<string, typeof todaySessions>();
      for (const s of todaySessions) {
        if (!sessionsByUser.has(s.userId)) sessionsByUser.set(s.userId, []);
        sessionsByUser.get(s.userId)!.push(s);
      }

      // Fetch WFH context (workMode + approved requests) for all employees
      // WfhRequest/LeaveRequest dates are @db.Date stored as UTC midnight — use toISTDate() for comparison.
      const todayISTDate = toISTDate(todayIST);
      const [wfhRequests, permanentWfhUsers, onLeaveUsers] = await Promise.all([
        this.prisma.wfhRequest.findMany({
          where: {
            userId: { in: allEmployeeIds },
            status: 'APPROVED',
            fromDate: { lte: todayISTDate },
            toDate: { gte: todayISTDate },
          },
          select: { userId: true },
        }),
        this.prisma.user.findMany({
          where: { id: { in: allEmployeeIds }, workMode: 'WFH' },
          select: { id: true },
        }),
        this.prisma.leaveRequest.findMany({
          where: {
            userId: { in: allEmployeeIds },
            status: 'APPROVED',
            startDate: { lte: todayISTDate },
            endDate: { gte: todayISTDate },
          },
          select: { userId: true },
        }),
      ]);

      const wfhRequestIds = new Set(wfhRequests.map((r) => r.userId));
      const permanentWfhIds = new Set(permanentWfhUsers.map((u) => u.id));
      const onLeaveIds = new Set(onLeaveUsers.map((r) => r.userId));
      const lateThreshold = getISTTimeToday(LATE_HOUR, LATE_MINUTE, todayIST);
      const halfDayThreshold = getISTTimeToday(HALF_DAY_CHECKIN_HOUR, HALF_DAY_CHECKIN_MINUTE, todayIST);

      for (const uid of allEmployeeIds) {
        const sessions = sessionsByUser.get(uid) ?? [];
        const isWfh = permanentWfhIds.has(uid) || wfhRequestIds.has(uid);
        const isOnLeave = onLeaveIds.has(uid);

        const { status } = this.finalizationService.calculateDailyStatus(
          sessions, lateThreshold, halfDayThreshold, isWfh, isOnLeave,
        );
        liveRows.push({ userId: uid, status, date: todayStr });
      }
    }

    // ── 6. Combine finalized + live rows ─────────────────────────────────────
    const allRows = [
      ...attendanceRows.map((r) => ({ userId: r.userId, status: r.status as string, date: toISTDateString(r.date) })),
      ...liveRows,
    ];

    // ── 7. Raw status counter ─────────────────────────────────────────────────
    // present = users with session (PRESENT + LATE + HALF_DAY + WFH)
    // onsite  = users with session AND onsite (PRESENT + LATE + HALF_DAY)
    // wfh     = users with session AND WFH
    // absent  = totalEmployees - present - onLeave (per day)
    const raw = { present: 0, onsite: 0, wfh: 0, late: 0, halfDay: 0, onLeave: 0, absent: 0 };

    const applyStatus = (status: string) => {
      if      (status === 'PRESENT')  { raw.present++; raw.onsite++; }
      else if (status === 'LATE')     { raw.present++; raw.onsite++; raw.late++; }
      else if (status === 'HALF_DAY') { raw.present++; raw.onsite++; raw.halfDay++; }
      else if (status === 'WFH')      { raw.present++; raw.wfh++; }
      else if (status === 'LEAVE')    { raw.onLeave++; }
      else if (status === 'ABSENT')   { raw.absent++; }
    };

    // ── 8. Single-day: count directly ────────────────────────────────────────
    if (isSingleDay) {
      for (const row of allRows) applyStatus(row.status);
      // Absent = totalEmployees - present - onLeave (no double counting)
      raw.absent = Math.max(0, totalEmployees - raw.present - raw.onLeave);
      return { totalEmployees, ...raw };
    }

    // ── 9. Range mode: count raw totals across all days ──────────────────────
    for (const row of allRows) applyStatus(row.status);

    const totalDays = Math.round(
      (endIST.getTime() - startIST.getTime()) / (24 * 60 * 60 * 1000),
    );

    // Missing (userId, date) pairs → ABSENT
    const coveredPairs = new Set(allRows.map((r) => `${r.userId}::${r.date}`));
    const rangeDates: string[] = [];
    for (let d = new Date(startIST); d < endIST; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      rangeDates.push(toISTDateString(d));
    }
    for (const dateStr of rangeDates) {
      for (const uid of allEmployeeIds) {
        if (!coveredPairs.has(`${uid}::${dateStr}`)) {
          raw.absent++;
        }
      }
    }

    // attendanceRate = % of employee-days where the employee was present
    const attendanceRate = totalEmployees > 0 && totalDays > 0
      ? Math.round((raw.present / (totalEmployees * totalDays)) * 1000) / 10
      : 0;

    // Return raw integer counts — no averaging or division.
    // The frontend receives the same shape as single-day mode.
    // attendanceRate (%) is the only derived value, kept in meta.
    return {
      totalEmployees,
      present:  raw.present,
      onsite:   raw.onsite,
      wfh:      raw.wfh,
      late:     raw.late,
      halfDay:  raw.halfDay,
      onLeave:  raw.onLeave,
      absent:   raw.absent,
      meta: {
        mode: 'range',
        totalDays,
        avgAttendance: attendanceRate,
      },
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
