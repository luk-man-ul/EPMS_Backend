import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { getISTStartOfDay } from '../common/utils/ist-date.util';

@Injectable()
export class WfhRequestService {
  constructor(private prisma: PrismaService) {}

  async createRequest(userId: string, dto: CreateWfhRequestDto) {
    // Normalize to IST start-of-day for clean date comparison
    const fromDate = getISTStartOfDay(new Date(dto.fromDate));
    const toDate = getISTStartOfDay(new Date(dto.toDate));

    if (fromDate > toDate) {
      throw new BadRequestException('fromDate cannot be after toDate');
    }

    // Check for overlapping APPROVED or PENDING requests for this user
    const overlapping = await this.prisma.wfhRequest.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        'You already have a pending or approved WFH request that overlaps with this date range',
      );
    }

    return this.prisma.wfhRequest.create({
      data: {
        userId,
        fromDate,
        toDate,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async getMyRequests(userId: string) {
    return this.prisma.wfhRequest.findMany({
      where: { userId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingRequests(user: any) {
    const where: any = { status: 'PENDING' };

    // Team leads only see requests from their team members
    if (user.role === 'TEAM_LEAD') {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }
    // ADMIN sees all pending requests — no additional filter

    return this.prisma.wfhRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, department: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRequestStatus(requestId: string, adminUser: any, status: 'APPROVED' | 'REJECTED') {
    const request = await this.prisma.wfhRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          include: {
            projectMembers: {
              include: { project: true },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('WFH request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `WFH request has already been ${request.status.toLowerCase()} and cannot be updated`,
      );
    }

    // Team leads can only act on requests from their team members
    if (adminUser.role === 'TEAM_LEAD') {
      const isTeamMember = request.user.projectMembers.some(
        (pm: any) => pm.project.leadId === adminUser.id,
      );
      if (!isTeamMember) {
        throw new ForbiddenException('You do not have authority to act on this WFH request');
      }
    }

    const updatedRequest = await this.prisma.wfhRequest.update({
      where: { id: requestId },
      data: {
        status,
        approvedById: adminUser.id,
        approvedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return updatedRequest;
  }

  async getAllRequests(filters: any, user: any) {
    const where: any = {};

    // Scope by role
    if (user.role === 'EMPLOYEE') {
      where.userId = user.id;
    } else if (user.role === 'TEAM_LEAD') {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.userId && user.role !== 'EMPLOYEE') {
      where.userId = filters.userId;
    }
    if (filters.fromDate) {
      where.fromDate = { gte: new Date(filters.fromDate) };
    }
    if (filters.toDate) {
      where.toDate = { lte: new Date(filters.toDate) };
    }

    const pageNumber = Number(filters.page) || 1;
    const limitNumber = Number(filters.limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    const [data, total] = await Promise.all([
      this.prisma.wfhRequest.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, department: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      this.prisma.wfhRequest.count({ where }),
    ]);

    return {
      data,
      total,
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
    projects.forEach((project) => {
      project.members.forEach((member) => memberIds.add(member.userId));
    });

    return Array.from(memberIds);
  }
}
