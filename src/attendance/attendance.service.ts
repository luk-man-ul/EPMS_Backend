import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AttendanceSessionService } from './attendance-session.service';
import { getISTStartOfDay, getISTStartOfNextDay, toISTDateString } from '../common/utils/ist-date.util';

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
    // supplement with live session data so the UI shows "In Progress" correctly.
    // Skip this supplement when a status filter is active — live sessions have no
    // status and would pollute filtered results.
    const todayStr = toISTDateString(new Date());
    const hasToday = !filters.startDate || filters.startDate <= todayStr;
    const todayAlreadyFinalized = data.some((r) => r.date === todayStr);
    const statusFilterActive = !!filters.status;

    if (hasToday && !todayAlreadyFinalized && !statusFilterActive) {
      const liveData = await this.sessionService.getAllSessions(
        { startDate: todayStr, endDate: todayStr },
        user,
      );

      // Normalize live records: derive firstCheckIn/lastCheckOut from sessions
      // sorted ascending so index 0 is always the earliest check-in
      const liveRecords = liveData.data.map((record: any) => {
        const sorted = [...(record.sessions ?? [])].sort(
          (a: any, b: any) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
        );
        const completedSorted = sorted.filter((s: any) => s.checkOut);
        return {
          ...record,
          firstCheckIn: sorted[0]?.checkIn ?? null,
          lastCheckOut: completedSorted.at(-1)?.checkOut ?? null,
        };
      });

      data.unshift(...liveRecords);
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
