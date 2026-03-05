import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LeaveService {
  constructor(private prisma: PrismaService) {}

  async create(dto: any, userId: string) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate > endDate) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    return this.prisma.leaveRequest.create({
      data: {
        userId,
        type: dto.type,
        startDate,
        endDate,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findMyLeaveRequests(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { userId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPendingApprovals(user: any) {
    const where: Prisma.LeaveRequestWhereInput = {
      status: 'PENDING',
    };

    const userRoles = user.roles.map((r: any) => r.role.name);
    
    if (userRoles.includes('TEAM_LEAD') && !userRoles.includes('ADMIN')) {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }

    return this.prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true, department: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveLeave(leaveId: string, user: any) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
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

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestException('Leave request is not in PENDING status and cannot be approved');
    }

    const userRoles = user.roles.map((r: any) => r.role.name);
    const isAdmin = userRoles.includes('ADMIN');
    const isTeamLead = userRoles.includes('TEAM_LEAD') &&
      leave.user.projectMembers.some((pm: any) => pm.project.leadId === user.id);

    if (!isAdmin && !isTeamLead) {
      throw new ForbiddenException('You do not have authority to approve this leave request');
    }

    return this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async rejectLeave(leaveId: string, reason: string | undefined, user: any) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
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

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestException('Leave request is not in PENDING status and cannot be rejected');
    }

    const userRoles = user.roles.map((r: any) => r.role.name);
    const isAdmin = userRoles.includes('ADMIN');
    const isTeamLead = userRoles.includes('TEAM_LEAD') &&
      leave.user.projectMembers.some((pm: any) => pm.project.leadId === user.id);

    if (!isAdmin && !isTeamLead) {
      throw new ForbiddenException('You do not have authority to reject this leave request');
    }

    return this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: 'REJECTED',
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findAll(filters: any, user: any) {
    const where: Prisma.LeaveRequestWhereInput = {};

    const userRoles = user.roles.map((r: any) => r.role.name);
    
    if (userRoles.includes('EMPLOYEE') && !userRoles.includes('TEAM_LEAD') && !userRoles.includes('ADMIN')) {
      where.userId = user.id;
    } else if (userRoles.includes('TEAM_LEAD') && !userRoles.includes('ADMIN')) {
      const teamMemberIds = await this.getTeamMemberIds(user.id);
      where.userId = { in: teamMemberIds };
    }

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.startDate && filters.endDate) {
      where.startDate = { gte: new Date(filters.startDate) };
      where.endDate = { lte: new Date(filters.endDate) };
    } else if (filters.startDate) {
      where.startDate = { gte: new Date(filters.startDate) };
    } else if (filters.endDate) {
      where.endDate = { lte: new Date(filters.endDate) };
    }
    if (filters.userId && !userRoles.includes('EMPLOYEE')) {
      where.userId = filters.userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true, department: true },
          },
          approvedBy: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.leaveRequest.count({ where }),
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
