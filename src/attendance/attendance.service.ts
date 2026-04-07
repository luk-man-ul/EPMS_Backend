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
    const todayStr = toISTDateString(new Date());
    const hasToday = !filters.startDate || filters.startDate <= todayStr;
    const todayAlreadyFinalized = data.some((r) => r.date === todayStr);

    if (hasToday && !todayAlreadyFinalized) {
      const liveData = await this.sessionService.getAllSessions(
        { ...filters, startDate: todayStr, endDate: todayStr },
        user,
      );
      // Prepend live today records (they have sessions[] but no status)
      data.unshift(...liveData.data);
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
