import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttendanceSessionService {
  // Office coordinates
  private readonly OFFICE_LATITUDE = 11.982748317280704;
  private readonly OFFICE_LONGITUDE = 75.36459629666871;
  private readonly ALLOWED_RADIUS_METERS = 250;

  constructor(private prisma: PrismaService) {}

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
    // Validate location is provided
    if (!latitude || !longitude) {
      throw new BadRequestException('Location is required for check-in');
    }

    // Calculate distance from office
    const distance = this.calculateDistance(
      latitude,
      longitude,
      this.OFFICE_LATITUDE,
      this.OFFICE_LONGITUDE,
    );

    // Enforce geofencing
    if (distance > this.ALLOWED_RADIUS_METERS) {
      throw new BadRequestException(
        `You are outside the allowed office area. You must be within ${this.ALLOWED_RADIUS_METERS} meters of the office to check in.`,
      );
    }

    // Check if there's an active session (checkOut is null)
    const activeSession = await this.prisma.attendanceSession.findFirst({
      where: {
        userId,
        checkOut: null,
      },
    });

    if (activeSession) {
      throw new BadRequestException('You must check out before checking in again.');
    }

    // Create new session with location
    return this.prisma.attendanceSession.create({
      data: {
        userId,
        checkIn: new Date(),
        latitude,
        longitude,
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async checkOut(userId: string) {
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
      throw new BadRequestException('No active check-in found.');
    }

    // Update with checkout time
    return this.prisma.attendanceSession.update({
      where: { id: activeSession.id },
      data: { checkOut: new Date() },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async getTodaySessions(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        userId,
        checkIn: {
          gte: today,
          lt: tomorrow,
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
      where.checkIn = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    } else if (filters.startDate) {
      where.checkIn = { gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      where.checkIn = { lte: new Date(filters.endDate) };
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
      const date = new Date(session.checkIn).toISOString().split('T')[0];
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
