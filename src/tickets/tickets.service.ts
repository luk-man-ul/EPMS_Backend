import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { TicketFilterDto } from './dto/ticket-filter.dto';
import { TicketStatus } from '@prisma/client';
import { TicketWorkflowService } from './ticket-workflow.service';
import { CommentsService } from '../comments/comments.service';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private workflow: TicketWorkflowService,
    private commentsService: CommentsService,
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

  // Validate taskId if provided
  if (dto.taskId) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.projectId !== dto.projectId) {
      throw new ForbiddenException('Task does not belong to this project');
    }
  }

  // Validate assignedToId if provided
  if (dto.assignedToId) {
    const assigneeMember = project.members.some(
      (member) => member.userId === dto.assignedToId,
    );

    if (!assigneeMember) {
      throw new ForbiddenException('Assigned user is not a project member');
    }
  }

  return this.prisma.ticket.create({
    data: {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority ?? 'MEDIUM',
      projectId: dto.projectId,
      taskId: dto.taskId,
      reporterId: user.id,
      assignedToId: dto.assignedToId,
    },
    include: {
      reporter: true,
      assignee: true,
      project: true,
      task: true,
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
    if (filter.type) where.type = filter.type;
    
    // Search in title and description
    if (filter.search) {
      const searchCondition = {
        OR: [
          { title: { contains: filter.search, mode: 'insensitive' as const } },
          { description: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      };
      
      // Merge with existing where conditions
      if (where.OR) {
        // If there's already an OR condition (for TEAM_LEAD), we need to combine them
        where.AND = [
          { OR: where.OR },
          searchCondition,
        ];
        delete where.OR;
      } else {
        // No existing OR, just add the search condition
        where.OR = searchCondition.OR;
      }
    }
    
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

    // Fetch comments from generic Comment table
    const comments = await this.commentsService.getComments('ticket', id);

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
      comments,
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
  // UPDATE TICKET (REPORTER CAN UPDATE THEIR OWN TICKETS)
  ////////////////////////////////////////////////////////////////

  async update(user: any, id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, isDeleted: false },
      include: { project: true },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    // Check permissions
    if (user.role === 'ADMIN') {
      // ADMIN can update any ticket
    } else if (user.role === 'TEAM_LEAD') {
      // TEAM_LEAD can update if: lead of project OR reporter
      const isLead = ticket.project.leadId === user.id;
      const isReporter = ticket.reporterId === user.id;

      if (!isLead && !isReporter) {
        throw new ForbiddenException('You can only update tickets you created or in projects you lead');
      }
    } else {
      // EMPLOYEE can only update their own tickets
      if (ticket.reporterId !== user.id) {
        throw new ForbiddenException('You can only update your own tickets');
      }
    }

    // Update ticket
    return this.prisma.ticket.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        priority: dto.priority,
      },
      include: {
        reporter: true,
        assignee: true,
        project: true,
      },
    });
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

  // Check if ticket is already assigned (prevent reassignment for non-ADMIN)
  if (ticket.assignedToId && user.role !== 'ADMIN') {
    throw new ForbiddenException(
      'Ticket is already assigned. Only ADMIN can reassign tickets.',
    );
  }

  // Assigned user must be part of project
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
  // SELF-ASSIGN (EMPLOYEE CAN ASSIGN TO THEMSELVES)
  ////////////////////////////////////////////////////////////////

  async selfAssign(user: any, id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!ticket || ticket.isDeleted) {
      throw new NotFoundException('Ticket not found');
    }

    // 1. Check if ticket is already assigned
    if (ticket.assignedToId) {
      throw new ForbiddenException('Ticket is already assigned');
    }

    // 2. Check if user is project member
    const membership = await this.prisma.projectMember.findFirst({
      where: {
        userId: user.id,
        projectId: ticket.projectId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this project');
    }

    // 3. Assign ticket to user
    return this.prisma.ticket.update({
      where: { id },
      data: { assignedToId: user.id },
      include: {
        reporter: true,
        assignee: true,
        project: true,
      },
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

  // TEAM_LEAD visibility check: must be lead, assigned, or reporter
  if (user.role === 'TEAM_LEAD') {
    const isLead = ticket.project.leadId === user.id;
    const isAssigned = ticket.assignedToId === user.id;
    const isReporter = ticket.reporterId === user.id;
    
    if (!isLead && !isAssigned && !isReporter) {
      throw new ForbiddenException('Not your project or ticket');
    }
  }

  // EMPLOYEE visibility check: must be project member
  if (user.role === 'EMPLOYEE') {
    const membership = await this.prisma.projectMember.findFirst({
      where: {
        userId: user.id,
        projectId: ticket.projectId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not your project');
    }
  }

  // Use comprehensive role-based validation
  this.workflow.validateTransitionWithRole(
    ticket.status,
    dto.status,
    user.role,
    user.id,
    ticket,
  );

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