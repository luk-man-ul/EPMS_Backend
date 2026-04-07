import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getISTStartOfDay,
  getISTStartOfNextDay,
  getISTEndOfDay,
  getISTTimeToday,
  toISTDateString,
} from '../common/utils/ist-date.util';

@Injectable()
export class AttendanceSessionService {
  private readonly logger = new Logger(AttendanceSessionService.name);
  
  // Office coordinates
  private readonly OFFICE_LATITUDE = 11.982748317280704;
  private readonly OFFICE_LONGITUDE = 75.36459629666871;
  private readonly ALLOWED_RADIUS_METERS = 250;
  private readonly MAX_SESSION_HOURS = 12;

  constructor(private prisma: PrismaService) {
    // Run recovery on service initialization
    this.logger.log('AttendanceSessionService initialized - starting recovery process');
    this.recoverOldSessions().catch(err => {
      this.logger.error('Failed to recover old sessions on startup', err.stack);
    });
  }

  /**
   * PART 1: Fix existing broken records
   * Auto-close any sessions that are still open from previous days
   */
  private async recoverOldSessions() {
    try {
      const todayIST = getISTStartOfDay();

      this.logger.log(`Starting recovery process - checking for sessions before ${todayIST.toISOString()}`);

      const oldOpenSessions = await this.prisma.attendanceSession.findMany({
        where: {
          checkOut: null,
          checkIn: {
            lt: todayIST,
          },
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });

      if (oldOpenSessions.length > 0) {
        this.logger.warn(`Found ${oldOpenSessions.length} old open sessions to recover`);

        for (const session of oldOpenSessions) {
          // Set checkout to end of that IST day (23:59:59.999 IST)
          const endOfDay = getISTEndOfDay(session.checkIn);

          await this.prisma.attendanceSession.update({
            where: { id: session.id },
            data: { checkOut: endOfDay },
          });

          this.logger.log(
            `Recovered broken attendance session from previous day - ` +
            `User: ${session.user.email}, Session ID: ${session.id}, ` +
            `CheckIn: ${session.checkIn.toISOString()}, CheckOut set to: ${endOfDay.toISOString()}`
          );
        }

        this.logger.log(`Recovery complete - ${oldOpenSessions.length} sessions recovered`);
      } else {
        this.logger.log('No old open sessions found - database is clean');
      }
    } catch (error) {
      this.logger.error('Error during recovery process', error.stack);
      throw error;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @returns distance in meters
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  async checkIn(userId: string, latitude?: number, longitude?: number) {
    this.logger.log(`Check-in attempt - User: ${userId}, Location: (${latitude}, ${longitude})`);

    // Validate location is provided
    if (!latitude || !longitude) {
      this.logger.warn(`Check-in rejected - Missing location data for user ${userId}`);
      throw new BadRequestException('Location is required for check-in');
    }

    // Determine if this user is allowed to check in remotely today
    const isWfh = await this.isWfhAllowed(userId);

    if (isWfh) {
      this.logger.log(`WFH check-in allowed for user ${userId} - skipping geofence validation`);
    } else {
      // Calculate distance from office
      const distance = this.calculateDistance(
        latitude,
        longitude,
        this.OFFICE_LATITUDE,
        this.OFFICE_LONGITUDE,
      );

      this.logger.log(`Distance from office: ${distance.toFixed(2)} meters (allowed: ${this.ALLOWED_RADIUS_METERS}m)`);

      // Enforce geofencing
      if (distance > this.ALLOWED_RADIUS_METERS) {
        this.logger.warn(
          `Check-in rejected - User ${userId} is ${distance.toFixed(2)}m from office (limit: ${this.ALLOWED_RADIUS_METERS}m)`
        );
        throw new BadRequestException(
          `You are outside the allowed office area. You must be within ${this.ALLOWED_RADIUS_METERS} meters of the office to check in.`,
        );
      }
    }

    // Check if there's an active session (checkOut is null)
    const activeSession = await this.prisma.attendanceSession.findFirst({
      where: {
        userId,
        checkOut: null,
      },
      orderBy: {
        checkIn: 'desc',
      },
    });

    if (activeSession) {
      // Compare IST date strings for reliable same-day detection
      const todayDateString = toISTDateString(new Date());
      const sessionDateString = toISTDateString(activeSession.checkIn);

      this.logger.log(
        `Active session found - Session ID: ${activeSession.id}, ` +
        `CheckIn: ${activeSession.checkIn.toISOString()}, ` +
        `Today (IST): ${todayDateString}, Session Date (IST): ${sessionDateString}`
      );

      // CASE A: Session started today (IST) - block check-in
      if (todayDateString === sessionDateString) {
        this.logger.warn(
          `Check-in rejected - User ${userId} already has an active session today (Session ID: ${activeSession.id})`
        );
        throw new BadRequestException('You must check out before checking in again.');
      }

      // CASE B: Session started on previous IST day - auto-close it
      this.logger.log(`Auto-closing previous day session for user ${userId} (Session ID: ${activeSession.id})`);

      // Set checkout to end of that IST day (23:59:59.999 IST)
      const endOfSessionDay = getISTEndOfDay(activeSession.checkIn);

      await this.prisma.attendanceSession.update({
        where: { id: activeSession.id },
        data: { checkOut: endOfSessionDay },
      });

      this.logger.log(
        `Auto-closed previous day session during check-in - ` +
        `User: ${userId}, Session ID: ${activeSession.id}, ` +
        `CheckOut set to: ${endOfSessionDay.toISOString()}`
      );
    }

    // Create new session with location and work mode
    const newSession = await this.prisma.attendanceSession.create({
      data: {
        userId,
        checkIn: new Date(),
        latitude,
        longitude,
        workMode: isWfh ? 'WFH' : 'ON_SITE',
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    this.logger.log(
      `Check-in successful - User: ${userId}, Session ID: ${newSession.id}, ` +
      `Mode: ${newSession.workMode}, Time: ${newSession.checkIn.toISOString()}`
    );

    return newSession;
  }

  /**
   * Determines if a user is allowed to check in remotely today.
   * Returns true if:
   *   1. The user has an APPROVED WfhRequest covering today's date, OR
   *   2. The user's default workMode is WFH
   */
  private async isWfhAllowed(userId: string): Promise<boolean> {
    const todayIST = getISTStartOfDay();

    // Check for an approved WFH request covering today (IST)
    const approvedRequest = await this.prisma.wfhRequest.findFirst({
      where: {
        userId,
        status: 'APPROVED',
        fromDate: { lte: todayIST },
        toDate: { gte: todayIST },
      },
    });

    if (approvedRequest) {
      this.logger.log(`User ${userId} has an approved WFH request covering today`);
      return true;
    }

    // Fall back to the user's default work mode
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { workMode: true },
    });

    if (user?.workMode === 'WFH') {
      this.logger.log(`User ${userId} has default workMode = WFH`);
      return true;
    }

    return false;
  }

  async checkOut(userId: string) {
    this.logger.log(`Check-out attempt - User: ${userId}`);

    // Find the latest active session
    const activeSession = await this.prisma.attendanceSession.findFirst({
      where: {
        userId,
        checkOut: null,
      },
      orderBy: {
        checkIn: 'desc',
      },
    });

    if (!activeSession) {
      this.logger.warn(`Check-out rejected - No active session found for user ${userId}`);
      throw new BadRequestException('No active check-in found.');
    }

    this.logger.log(
      `Active session found - Session ID: ${activeSession.id}, ` +
      `CheckIn: ${activeSession.checkIn.toISOString()}`
    );

    // Update with checkout time
    const checkOutTime = new Date();
    const updatedSession = await this.prisma.attendanceSession.update({
      where: { id: activeSession.id },
      data: { checkOut: checkOutTime },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    const duration = (checkOutTime.getTime() - activeSession.checkIn.getTime()) / (1000 * 60 * 60);
    
    this.logger.log(
      `Check-out successful - User: ${userId}, Session ID: ${updatedSession.id}, ` +
      `Duration: ${duration.toFixed(2)} hours, CheckOut: ${checkOutTime.toISOString()}`
    );

    return updatedSession;
  }

  /**
   * PART 4: Midnight auto-checkout job
   * This should be called by a cron job daily at 23:59
   * Closes all sessions that are still open from previous days
   */
  async midnightAutoCheckout() {
    this.logger.log('Midnight auto-checkout job started');

    try {
      const todayIST = getISTStartOfDay();

      const sessionsToClose = await this.prisma.attendanceSession.findMany({
        where: {
          checkOut: null,
          checkIn: {
            lt: todayIST,
          },
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });

      if (sessionsToClose.length > 0) {
        this.logger.warn(`Midnight job: Found ${sessionsToClose.length} sessions to auto-close`);

        for (const session of sessionsToClose) {
          // Set checkout to 23:59:59.999 IST of the checkIn IST day
          const endOfDay = getISTEndOfDay(session.checkIn);

          await this.prisma.attendanceSession.update({
            where: { id: session.id },
            data: { checkOut: endOfDay },
          });

          this.logger.log(
            `Auto checkout executed by midnight job - ` +
            `User: ${session.user.email}, Session ID: ${session.id}, ` +
            `CheckIn: ${session.checkIn.toISOString()}, CheckOut set to: ${endOfDay.toISOString()}`
          );
        }

        this.logger.log(`Midnight auto-checkout completed - ${sessionsToClose.length} sessions closed`);
      } else {
        this.logger.log('Midnight job: No sessions to close');
      }

      return {
        message: 'Midnight auto-checkout completed',
        sessionsClosed: sessionsToClose.length,
      };
    } catch (error) {
      this.logger.error('Error during midnight auto-checkout', error.stack);
      throw error;
    }
  }

  /**
   * PART 3: Auto-checkout for sessions exceeding maximum duration
   * Checks and closes sessions that have been open for more than MAX_SESSION_HOURS
   */
  async autoCheckoutLongSessions() {
    this.logger.log(`Auto-checkout long sessions job started (max duration: ${this.MAX_SESSION_HOURS} hours)`);

    try {
      const maxDuration = this.MAX_SESSION_HOURS * 60 * 60 * 1000; // Convert hours to milliseconds
      const cutoffTime = new Date(Date.now() - maxDuration);

      const longSessions = await this.prisma.attendanceSession.findMany({
        where: {
          checkOut: null,
          checkIn: {
            lt: cutoffTime,
          },
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });

      if (longSessions.length > 0) {
        this.logger.warn(
          `Found ${longSessions.length} sessions exceeding ${this.MAX_SESSION_HOURS} hours`
        );

        for (const session of longSessions) {
          // Set checkout to checkIn + MAX_SESSION_HOURS
          const autoCheckoutTime = new Date(session.checkIn.getTime() + maxDuration);

          await this.prisma.attendanceSession.update({
            where: { id: session.id },
            data: { checkOut: autoCheckoutTime },
          });

          this.logger.log(
            `Session auto closed due to max duration exceeded - ` +
            `User: ${session.user.email}, Session ID: ${session.id}, ` +
            `CheckIn: ${session.checkIn.toISOString()}, ` +
            `CheckOut set to: ${autoCheckoutTime.toISOString()} (${this.MAX_SESSION_HOURS}h limit)`
          );
        }

        this.logger.log(`Auto-checkout long sessions completed - ${longSessions.length} sessions closed`);
      } else {
        this.logger.log('No long-running sessions found');
      }

      return {
        message: 'Auto-checkout for long sessions completed',
        sessionsClosed: longSessions.length,
      };
    } catch (error) {
      this.logger.error('Error during auto-checkout long sessions', error.stack);
      throw error;
    }
  }

  async getTodaySessions(userId: string) {
    const todayIST = getISTStartOfDay();
    const tomorrowIST = getISTStartOfNextDay();

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        userId,
        checkIn: {
          gte: todayIST,
          lt: tomorrowIST,
        },
      },
      orderBy: {
        checkIn: 'asc',
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    // Calculate total hours
    let totalHours = 0;
    sessions.forEach((session) => {
      if (session.checkOut) {
        const hours = (session.checkOut.getTime() - session.checkIn.getTime()) / (1000 * 60 * 60);
        totalHours += hours;
      }
    });

    return {
      sessions,
      totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
    };
  }

  async getMySessions(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where: { userId },
        orderBy: { checkIn: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.attendanceSession.count({ where: { userId } }),
    ]);

    return {
      data: sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllSessions(filters: any, user: any) {
    const userRole = user.role;
    const where: any = {};

    // Role-based filtering
    if (userRole === 'EMPLOYEE') {
      where.userId = user.id;
    } else if (userRole === 'TEAM_LEAD') {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }
    // ADMIN: no filtering

    // Date range filtering
    if (filters.startDate && filters.endDate) {
      const end = new Date(filters.endDate);
      const nextDay = new Date(end);
      nextDay.setUTCDate(end.getUTCDate() + 1);
      where.checkIn = {
        gte: new Date(filters.startDate),
        lt: nextDay,
      };
    } else if (filters.startDate) {
      where.checkIn = { gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      const end = new Date(filters.endDate);
      const nextDay = new Date(end);
      nextDay.setUTCDate(end.getUTCDate() + 1);
      where.checkIn = { lt: nextDay };
    }

    // User filter (for admins/team leads)
    if (filters.userId && userRole !== 'EMPLOYEE') {
      where.userId = filters.userId;
    }

    // Convert pagination parameters to numbers
    const pageNumber = Number(filters.page) || 1;
    const limitNumber = Number(filters.limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    const [sessions, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true, department: true },
          },
        },
        orderBy: { checkIn: 'desc' },
        skip,
        take: limitNumber,
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);

    // Group sessions by date and user, calculate total hours
    const groupedData = this.groupSessionsByDateAndUser(sessions);

    return {
      data: groupedData,
      total: groupedData.length,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(groupedData.length / limitNumber),
    };
  }

  private groupSessionsByDateAndUser(sessions: any[]) {
    const grouped = new Map<string, any>();

    sessions.forEach((session) => {
      // Use IST date string so sessions after 18:30 UTC don't shift to the next day
      const date = toISTDateString(new Date(session.checkIn));
      const key = `${session.userId}-${date}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          userId: session.userId,
          user: session.user,
          date,
          sessions: [],
          totalHours: 0,
        });
      }

      const group = grouped.get(key);
      group.sessions.push(session);

      // Calculate hours if session is complete
      if (session.checkOut) {
        const hours = (session.checkOut.getTime() - session.checkIn.getTime()) / (1000 * 60 * 60);
        group.totalHours += hours;
      }
    });

    // Convert map to array and round total hours
    return Array.from(grouped.values()).map((group) => ({
      ...group,
      totalHours: Math.round(group.totalHours * 100) / 100,
    }));
  }

  private async getTeamMemberIds(teamLeadId: string): Promise<string[]> {
    const projects = await this.prisma.project.findMany({
      where: { leadId: teamLeadId },
      include: { members: { select: { userId: true } } },
    });

    const memberIds = new Set<string>();
    projects.forEach((project) => {
      project.members.forEach((member) => memberIds.add(member.userId));
    });

    return Array.from(memberIds);
  }
}
