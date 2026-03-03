import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { TicketFilterDto } from './dto/ticket-filter.dto';
import { TicketStatus } from '@prisma/client';
import { TicketWorkflowService } from './ticket-workflow.service';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private workflow: TicketWorkflowService,
  ) {}

  ////////////////////////////////////////////////////////////////
  // CREATE (PROJECT-SCOPED VALIDATION)
  ////////////////////////////////////////////////////////////////

  async create(user: any, dto: CreateTicketDto) {

  if (!dto.projectId) {
    throw new ForbiddenException('Project is required');
  }

  const project = await this.prisma.project.findUnique({
    where: { id: dto.projectId },
    include: { members: true },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  const isMember = project.members.some(
    (member) => member.userId === user.id,
  );

  if (!isMember) {
    throw new ForbiddenException('Not a project member');
  }

  return this.prisma.ticket.create({
    data: {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority ?? 'MEDIUM',
      projectId: dto.projectId,
      reporterId: user.id,
    },
    include: {
      reporter: true,
      assignee: true,
      project: true,
    },
  });
}
  ////////////////////////////////////////////////////////////////
  // FIND ALL (PROJECT-BASED VISIBILITY)
  ////////////////////////////////////////////////////////////////

  async findAll(user: any, filter: TicketFilterDto) {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      isDeleted: false,
    };

    if (user.role === 'ADMIN') {
      // ADMIN sees all tickets
    } else if (user.role === 'TEAM_LEAD') {
      // TEAM_LEAD sees tickets in led projects OR assigned to them OR created by them
      where.OR = [
        { project: { leadId: user.id } },
        { assignedToId: user.id },
        { reporterId: user.id }
      ];
    } else {
      // EMPLOYEE sees tickets in projects they're members of
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      });

      const projectIds = memberships.map((m) => m.projectId);

      where.projectId = {
        in: projectIds,
      };
    }

    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;
    if (filter.projectId) {
  if (user.role !== 'ADMIN') {
    const memberships = await this.prisma.projectMember.findFirst({
      where: {
        userId: user.id,
        projectId: filter.projectId,
      },
    });

    if (!memberships) {
      throw new ForbiddenException('Not your project');
    }
  }

  where.projectId = filter.projectId;
}
    if (filter.assignedToId) where.assignedToId = filter.assignedToId;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        include: {
          reporter: true,
          assignee: true,
          project: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit },
    };
  }

  ////////////////////////////////////////////////////////////////
  // FIND ONE (PROJECT VISIBILITY ENFORCED)
  ////////////////////////////////////////////////////////////////

  async findOne(user: any, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, isDeleted: false },
      include: {
        reporter: true,
        assignee: true,
        project: {
  include: {
    members: {
      include: {
        user: true,
      },
    },
  },
},
        comments: true,
        statusHistory: {
          include: {
            changedBy: true,
          },
          orderBy: {
            changedAt: 'desc',
          },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (user.role !== 'ADMIN') {
      if (user.role === 'TEAM_LEAD') {
        // TEAM_LEAD can access if: lead of project OR assigned OR reporter
        const isLead = ticket.project.leadId === user.id;
        const isAssigned = ticket.assignedToId === user.id;
        const isReporter = ticket.reporterId === user.id;
        
        if (!isLead && !isAssigned && !isReporter) {
          throw new ForbiddenException();
        }
      } else {
        // EMPLOYEE must be project member
        const membership = await this.prisma.projectMember.findFirst({
          where: {
            userId: user.id,
            projectId: ticket.projectId,
          },
        });

        if (!membership) {
          throw new ForbiddenException();
        }
      }
    }

    // 🔥 Transform response to match frontend contract
    // Construct plain object to avoid Prisma type conflicts
    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      priority: ticket.priority,
      status: ticket.status,
      projectId: ticket.projectId,
      reporterId: ticket.reporterId,
      assignedToId: ticket.assignedToId,
      resolution: ticket.resolution,
      isDeleted: ticket.isDeleted,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      reporter: ticket.reporter,
      assignee: ticket.assignee,
      project: ticket.project,
      comments: ticket.comments,
      statusHistory: ticket.statusHistory.map((entry) => ({
        id: entry.id,
        ticketId: entry.ticketId,
        status: entry.newStatus,
        changedById: entry.changedById,
        changedBy: entry.changedBy,
        createdAt: entry.changedAt,
      })),
    };
  }

  ////////////////////////////////////////////////////////////////
  // ASSIGN (ADMIN ONLY — PERMISSION GUARD HANDLES AUTH)
  ////////////////////////////////////////////////////////////////

async assign(user: any, id: string, dto: AssignTicketDto) {
  const ticket = await this.prisma.ticket.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!ticket || ticket.isDeleted) {
    throw new NotFoundException('Ticket not found');
  }

  // EMPLOYEE cannot assign
  if (user.role === 'EMPLOYEE') {
    throw new ForbiddenException(
      'Employees cannot assign tickets',
    );
  }

  // TEAM_LEAD can assign if: lead of project OR assigned OR reporter
  if (user.role === 'TEAM_LEAD') {
    const isLead = ticket.project.leadId === user.id;
    const isAssigned = ticket.assignedToId === user.id;
    const isReporter = ticket.reporterId === user.id;
    
    if (!isLead && !isAssigned && !isReporter) {
      throw new ForbiddenException('Not your project or ticket');
    }
  }

  // 🔥 NEW CHECK: Assigned user must be part of project
  const member = await this.prisma.projectMember.findFirst({
    where: {
      userId: dto.assignedToId,
      projectId: ticket.projectId,
    },
  });

  if (!member) {
    throw new ForbiddenException('User not part of project');
  }

  return this.prisma.ticket.update({
    where: { id },
    data: { assignedToId: dto.assignedToId },
  });
}
  ////////////////////////////////////////////////////////////////
  // UPDATE PRIORITY
  ////////////////////////////////////////////////////////////////

  async updatePriority(id: string, dto: UpdateTicketPriorityDto) {
    return this.prisma.ticket.update({
      where: { id },
      data: { priority: dto.priority },
    });
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE STATUS (WORKFLOW ENFORCED)
  ////////////////////////////////////////////////////////////////
async updateStatus(
  user: any,
  id: string,
  dto: UpdateTicketStatusDto,
) {
  const ticket = await this.prisma.ticket.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!ticket || ticket.isDeleted)
    throw new NotFoundException('Ticket not found');

  if (user.role === 'EMPLOYEE' && ticket.assignedToId !== user.id) {
  throw new ForbiddenException('Only assignee can update status');

  }

  // TEAM_LEAD can update status if: lead of project OR assigned OR reporter
  if (user.role === 'TEAM_LEAD') {
    const isLead = ticket.project.leadId === user.id;
    const isAssigned = ticket.assignedToId === user.id;
    const isReporter = ticket.reporterId === user.id;
    
    if (!isLead && !isAssigned && !isReporter) {
      throw new ForbiddenException('Not your project or ticket');
    }
  }

  this.workflow.validateTransition(ticket.status, dto.status);

  return this.prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedAt:
          dto.status === TicketStatus.RESOLVED
            ? new Date()
            : ticket.resolvedAt,
        closedAt:
          dto.status === TicketStatus.CLOSED
            ? new Date()
            : ticket.closedAt,
        resolution: dto.resolution ?? ticket.resolution,
      },
    });

    await tx.ticketStatusHistory.create({
      data: {
        ticketId: id,
        oldStatus: ticket.status,
        newStatus: dto.status,
        changedById: user.id,
      },
    });

    return updated;
  });
}

  ////////////////////////////////////////////////////////////////
  // SOFT DELETE
  ////////////////////////////////////////////////////////////////

async remove(user: any, id: string) {
  const ticket = await this.prisma.ticket.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!ticket || ticket.isDeleted) {
  throw new NotFoundException('Ticket not found');
}
  if (user.role === 'EMPLOYEE') {
    if (ticket.reporterId !== user.id) {
      throw new ForbiddenException(
        'You can only delete your own tickets',
      );
    }
  }

  // TEAM_LEAD can delete if: lead of project OR assigned OR reporter
  if (user.role === 'TEAM_LEAD') {
    const isLead = ticket.project.leadId === user.id;
    const isAssigned = ticket.assignedToId === user.id;
    const isReporter = ticket.reporterId === user.id;
    
    if (!isLead && !isAssigned && !isReporter) {
      throw new ForbiddenException('Not your project or ticket');
    }
  }

  return this.prisma.ticket.update({
    where: { id },
    data: { isDeleted: true },
  });
}
}