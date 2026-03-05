import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async checkIn(userId: string, latitude: number, longitude: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert: create or update existing record
    return this.prisma.attendance.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      update: {
        checkIn: new Date(),
        latitude,
        longitude,
      },
      create: {
        userId,
        date: today,
        checkIn: new Date(),
        latitude,
        longitude,
        status: 'PRESENT',
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async checkOut(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!attendance) {
      throw new BadRequestException('No check-in found for today. Please check in first.');
    }

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: { checkOut: new Date() },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findMyAttendance(userId: string) {
    return this.prisma.attendance.findMany({
      where: { userId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  async findAll(filters: any, user: any) {
    const where: Prisma.AttendanceWhereInput = {};

    // Role-based filtering
    const userRoles = user.roles.map((r: any) => r.role.name);
    
    if (userRoles.includes('EMPLOYEE') && !userRoles.includes('TEAM_LEAD') && !userRoles.includes('ADMIN')) {
      where.userId = user.id;
    } else if (userRoles.includes('TEAM_LEAD') && !userRoles.includes('ADMIN')) {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }
    // ADMIN: no filtering

    // Apply filters
    if (filters.startDate && filters.endDate) {
      where.date = { 
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate)
      };
    } else if (filters.startDate) {
      where.date = { gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      where.date = { lte: new Date(filters.endDate) };
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.userId && !userRoles.includes('EMPLOYEE')) {
      where.userId = filters.userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true, department: true },
          },
        },
        orderBy: { date: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit),
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
