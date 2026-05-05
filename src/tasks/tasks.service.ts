import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { TaskStatus, TaskType } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  ////////////////////////////////////////////////////////////
  // CREATE TASK
  ////////////////////////////////////////////////////////////

async create(dto: CreateTaskDto, user: any) {
  const project = await this.prisma.project.findUnique({
    where: { id: dto.projectId },
    include: { members: true },
  });

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  ////////////////////////////////////////////////////////////
  // ✅ VALIDATE ASSIGNEE IS PROJECT MEMBER
  ////////////////////////////////////////////////////////////

  if (dto.assignedToId) {
    const isMember = project.members.some(
      (member) => member.userId === dto.assignedToId
    );
    
    if (!isMember) {
      throw new ForbiddenException(
        'Cannot assign task to user outside the project'
      );
    }
  }

  ////////////////////////////////////////////////////////////
  // 🔐 ADMIN → Full access
  ////////////////////////////////////////////////////////////

  if (user.role === 'ADMIN') {
    return this.createTask(dto, user.id);
  }

  ////////////////////////////////////////////////////////////
  // 🔐 TEAM_LEAD → Only if owner
  ////////////////////////////////////////////////////////////

  if (user.role === 'TEAM_LEAD') {
    if (project.leadId !== user.id) {
      throw new ForbiddenException('Not your project');
    }

    return this.createTask(dto, user.id);
  }

  ////////////////////////////////////////////////////////////
  // EMPLOYEE → Blocked
  ////////////////////////////////////////////////////////////

  throw new ForbiddenException(
    'Employees are not allowed to create tasks',
  );
}
private async createTask(dto: CreateTaskDto, userId: string) {
  const task = await this.prisma.task.create({
    data: {
      projectId: dto.projectId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      assignedToId: dto.assignedToId || null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      createdById: userId,
    },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  // Notify the assignee if one was set
  if (dto.assignedToId) {
    await this.notificationsService.notifyTaskAssigned(
      dto.assignedToId,
      task.title,
      task.project.name,
      task.id,
    );
  }

  return task;
}

  ////////////////////////////////////////////////////////////
  // CREATE SELF-WORK TASK
  ////////////////////////////////////////////////////////////

  async createSelfWork(dto: any, user: any) {
    // Validate project exists
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      include: { members: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate project membership
    const isMember = project.members.some(
      (member) => member.userId === user.id
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of this project to create self-work tasks'
      );
    }

    // Reject if user tries to assign to someone else
    if (dto.assignedToId && dto.assignedToId !== user.id) {
      throw new ForbiddenException(
        'Self-work tasks can only be assigned to yourself'
      );
    }

    // Create self-work task
    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        type: TaskType.SELF_WORK,
        status: TaskStatus.PROPOSED,
        assignedToId: user.id,
        createdById: user.id,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        estimatedHrs: dto.estimatedHrs || null,
      },
      include: {
        project: {
          select: { id: true, name: true, leadId: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Notify all admins that a self-work proposal needs approval
    await this.notificationsService.notifySelfWorkRequested(
      user.id,
      task.title,
      task.id,
    );

    return task;
  }

  ////////////////////////////////////////////////////////////
  // APPROVE SELF-WORK TASK
  ////////////////////////////////////////////////////////////

  async approveSelfWork(taskId: string, user: any) {
    // Fetch task with project details
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { id: true, name: true, leadId: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate task type is SELF_WORK
    if (task.type !== TaskType.SELF_WORK) {
      throw new ForbiddenException('Only self-work tasks can be approved');
    }

    // Validate task is in PROPOSED status
    if (task.status !== TaskStatus.PROPOSED) {
      throw new ForbiddenException(
        'Only tasks in PROPOSED status can be approved'
      );
    }

    // Validate approval authority
    await this.validateApprovalAuthority(user, task);

    // Transition status to TODO and record approval metadata
    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.TODO,
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: {
        project: { select: { id: true, name: true, leadId: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify the employee their proposal was approved
    await this.notificationsService.notifyTaskApproved(
      task.assignedToId!,
      task.title,
      taskId,
    );

    // Create audit log entry
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'APPROVE_SELF_WORK',
        module: 'TASKS',
        entityId: taskId,
      },
    });

    return updatedTask;
  }

  ////////////////////////////////////////////////////////////
  // VALIDATE APPROVAL AUTHORITY
  ////////////////////////////////////////////////////////////

  private async validateApprovalAuthority(user: any, task: any): Promise<void> {
    // Admins have universal approval authority
    if (user.role === 'ADMIN') {
      return;
    }

    // Team leads can approve tasks in projects they manage
    if (user.role === 'TEAM_LEAD') {
      if (task.project.leadId === user.id) {
        return;
      }
    }

    throw new ForbiddenException(
      'You do not have permission to approve tasks for this project'
    );
  }

  ////////////////////////////////////////////////////////////
  // REJECT SELF-WORK TASK
  ////////////////////////////////////////////////////////////

  async rejectSelfWork(taskId: string, reason: string, user: any) {
    // Validate rejection reason
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'Rejection reason must be at least 10 characters'
      );
    }

    // Fetch task with project details
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { id: true, name: true, leadId: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate task type is SELF_WORK
    if (task.type !== TaskType.SELF_WORK) {
      throw new ForbiddenException('Only self-work tasks can be rejected');
    }

    // Validate task is in PROPOSED status
    if (task.status !== TaskStatus.PROPOSED) {
      throw new ForbiddenException(
        'Only tasks in PROPOSED status can be rejected'
      );
    }

    // Validate approval authority
    await this.validateApprovalAuthority(user, task);

    // Transition status to REJECTED and record rejection metadata
    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.REJECTED,
        approvedById: user.id, // Record rejector
        rejectionReason: reason.trim(),
      },
      include: {
        project: { select: { id: true, name: true, leadId: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify the employee their proposal was rejected with reason
    await this.notificationsService.notifyTaskRejected(
      task.assignedToId!,
      task.title,
      taskId,
      reason.trim(),
    );

    // Create audit log entry with reason
    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'REJECT_SELF_WORK',
        module: 'TASKS',
        entityId: taskId,
      },
    });

    return updatedTask;
  }

  ////////////////////////////////////////////////////////////
  // GET PENDING APPROVALS
  ////////////////////////////////////////////////////////////

  async getPendingApprovals(user: any) {
    const where: any = {
      type: TaskType.SELF_WORK,
      status: TaskStatus.PROPOSED,
      isDeleted: false,
    };

    // For team leads, filter by projects they manage
    if (user.role === 'TEAM_LEAD') {
      where.project = {
        leadId: user.id,
      };
    }

    // For admins, return all pending tasks (no additional filter)
    // For employees, they shouldn't access this, but we'll return empty array
    if (user.role === 'EMPLOYEE') {
      return [];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, leadId: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
        creator: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' }, // Newest first
    });

    return tasks;
  }

  ////////////////////////////////////////////////////////////
  // GET SELF-WORK METRICS
  ////////////////////////////////////////////////////////////

  async getSelfWorkMetrics(projectId: string, user: any) {
    // Build where clause based on role
    const where: any = {
      type: TaskType.SELF_WORK,
      isDeleted: false,
    };

    // For team leads, filter by projects they manage
    if (user.role === 'TEAM_LEAD') {
      if (projectId) {
        // Verify team lead manages this project
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
        });

        if (!project || project.leadId !== user.id) {
          throw new ForbiddenException('Not your project');
        }

        where.projectId = projectId;
      } else {
        // Get all projects managed by this team lead
        where.project = {
          leadId: user.id,
        };
      }
    } else if (user.role === 'ADMIN') {
      // Admins can see all projects
      if (projectId) {
        where.projectId = projectId;
      }
    } else {
      // Employees shouldn't access this
      throw new ForbiddenException('Access denied');
    }

    // Fetch all self-work tasks matching criteria
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Calculate metrics
    const totalProposed = tasks.length;
    const totalApproved = tasks.filter(
      (t) => t.status !== TaskStatus.PROPOSED && t.status !== TaskStatus.REJECTED
    ).length;
    const totalRejected = tasks.filter((t) => t.status === TaskStatus.REJECTED).length;

    const approvalRate =
      totalProposed === 0 ? 0 : Math.round((totalApproved / totalProposed) * 100);

    // Calculate average approval time
    const approvedTasks = tasks.filter((t) => t.approvedAt !== null);
    const avgApprovalTimeHours =
      approvedTasks.length === 0
        ? 0
        : approvedTasks.reduce((sum, t) => {
            const diffMs = t.approvedAt!.getTime() - t.createdAt.getTime();
            return sum + diffMs / (1000 * 60 * 60); // Convert to hours
          }, 0) / approvedTasks.length;

    // Group by employee
    const byEmployee = new Map<string, any>();

    tasks.forEach((task) => {
      const empId = task.assignedToId;
      if (!empId || !task.assignee) return; // Skip if no assignee
      
      if (!byEmployee.has(empId)) {
        byEmployee.set(empId, {
          employeeId: empId,
          employeeName: `${task.assignee.firstName} ${task.assignee.lastName}`,
          proposed: 0,
          approved: 0,
          rejected: 0,
        });
      }

      const emp = byEmployee.get(empId);
      emp.proposed++;

      if (task.status === TaskStatus.REJECTED) {
        emp.rejected++;
      } else if (task.status !== TaskStatus.PROPOSED) {
        emp.approved++;
      }
    });

    return {
      projectId: projectId || 'all',
      projectName: projectId
        ? tasks[0]?.project.name || 'Unknown'
        : 'All Projects',
      totalProposed,
      totalApproved,
      totalRejected,
      approvalRate,
      avgApprovalTimeHours: Math.round(avgApprovalTimeHours * 100) / 100,
      pendingCount: tasks.filter((t) => t.status === TaskStatus.PROPOSED).length,
      byEmployee: Array.from(byEmployee.values()),
    };
  }

  ////////////////////////////////////////////////////////////
  // GET TASKS WITH FILTERING + PAGINATION
  ////////////////////////////////////////////////////////////

  async findAll(filters: any, user: any) {
    const page = parseInt(filters.page) || 1
    const limit = parseInt(filters.limit) || 10
    const skip = (page - 1) * limit

    const where: any = {
      isDeleted: false,
    }

    if (filters.projectId) where.projectId = filters.projectId
    if (filters.status) where.status = filters.status
    if (filters.priority) where.priority = filters.priority
    if (filters.assignedToId) where.assignedToId = filters.assignedToId
    if (filters.type) where.type = filters.type // NEW: Type filter

    // EMPLOYEE can only see their tasks
    if (user.role === 'EMPLOYEE') {
      where.assignedToId = user.id
    }

    // TEAM_LEAD sees tasks in led projects OR assigned to them
    if (user.role === 'TEAM_LEAD') {
      where.OR = [
        { project: { leadId: user.id } },
        { assignedToId: user.id }
      ]
    }

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: {
          project: {
            select: { id: true, name: true },
          },
          assignee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.count({ where }),
    ])

    return {
      data: tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }


  ////////////////////////////////////////////////////////////
// GET ONE TASK DETAIL
////////////////////////////////////////////////////////////

async findOne(id: string, user: any) {
  const task = await this.prisma.task.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          leadId: true,
        },
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      statusHistory: {
        include: {
          changedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { changedAt: 'desc' },
      },
    },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  // 🔐 EMPLOYEE restriction
  if (user.role === 'EMPLOYEE' && task.assignedToId !== user.id) {
    throw new ForbiddenException('Access denied')
  }

  // 🔐 TEAM_LEAD restriction - can access if lead OR assigned
  if (user.role === 'TEAM_LEAD') {
    const isLead = task.project.leadId === user.id
    const isAssigned = task.assignedToId === user.id
    
    if (!isLead && !isAssigned) {
      throw new ForbiddenException('Access denied')
    }
  }

  return task
}
  ////////////////////////////////////////////////////////////
  // UPDATE TASK
  ////////////////////////////////////////////////////////////
async update(id: string, dto: UpdateTaskDto, user: any) {
  const task = await this.prisma.task.findUnique({
    where: { id },
    include: { 
      project: {
        include: { members: true }
      }
    },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  ////////////////////////////////////////////////////////////
  // EMPLOYEE RULES
  ////////////////////////////////////////////////////////////

 if (user.role === 'EMPLOYEE') {
  if (task.assignedToId !== user.id) {
    throw new ForbiddenException('You can only update your own tasks');
  }

  // Must include status
  if (dto.status === undefined) {
    throw new ForbiddenException(
      'Employees can only update task status'
    );
  }

  // Only allow status field
  const allowedFields = ['status'];

  const incomingFields = Object.entries(dto)
    .filter(([_, value]) => value !== undefined)
    .map(([key]) => key);

  const invalidUpdate = incomingFields.some(
    (field) => !allowedFields.includes(field)
  );

  if (invalidUpdate) {
    throw new ForbiddenException(
      'Employees cannot modify task details'
    );
  }
}

  ////////////////////////////////////////////////////////////
  // TEAM_LEAD RULES
  ////////////////////////////////////////////////////////////

  if (user.role === 'TEAM_LEAD') {
    const isLead = task.project.leadId === user.id
    const isAssigned = task.assignedToId === user.id
    
    if (!isLead && !isAssigned) {
      throw new ForbiddenException('Not your project or task')
    }

    // ✅ PREVENT TEAM_LEAD FROM CHANGING PROJECT
    if (dto.projectId !== undefined && dto.projectId !== task.projectId) {
      throw new ForbiddenException(
        'Team Leads cannot move tasks between projects'
      );
    }
  }

  ////////////////////////////////////////////////////////////
  // ✅ VALIDATE ASSIGNEE IS PROJECT MEMBER
  ////////////////////////////////////////////////////////////

  if (dto.assignedToId !== undefined && dto.assignedToId !== null) {
    const isMember = task.project.members.some(
      (member) => member.userId === dto.assignedToId
    );
    
    if (!isMember) {
      throw new ForbiddenException(
        'Cannot assign task to user outside the project'
      );
    }
  }

  ////////////////////////////////////////////////////////////
  // BUILD UPDATE DATA
  ////////////////////////////////////////////////////////////

  const updateData: any = {}

  if (dto.title !== undefined) updateData.title = dto.title
  if (dto.description !== undefined)
    updateData.description = dto.description
  if (dto.priority !== undefined)
    updateData.priority = dto.priority

  if (dto.dueDate !== undefined) {
    updateData.dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : null
  }

  if (dto.projectId !== undefined) {
    updateData.project = {
      connect: { id: dto.projectId },
    }
  }

  if (dto.assignedToId !== undefined) {
    updateData.assignee = dto.assignedToId
      ? { connect: { id: dto.assignedToId } }
      : { disconnect: true }
  }

  ////////////////////////////////////////////////////////////
  // STATUS HISTORY
  ////////////////////////////////////////////////////////////

  if (dto.status && dto.status !== task.status) {
    // ✅ VALIDATE STATUS TRANSITION (ROLE-AWARE + TASK TYPE)
    this.validateStatusTransition(task.status, dto.status as TaskStatus, user.role, task.type);
    
    await this.prisma.taskStatusHistory.create({
      data: {
        taskId: id,
        oldStatus: task.status,
        newStatus: dto.status as any,
        changedById: user.id,
      },
    })

    updateData.status = dto.status
    updateData.completedAt =
      dto.status === 'COMPLETED' ? new Date() : null
  }

  // First update
await this.prisma.task.update({
  where: { id },
  data: updateData,
})

// Then return full detailed task (same structure as findOne)
return this.prisma.task.findUnique({
  where: { id },
  include: {
    project: {
      select: {
        id: true,
        name: true,
        leadId: true,
      },
    },
    assignee: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    creator: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    statusHistory: {
      include: {
        changedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { changedAt: 'desc' },
    },
  },
})
}
////////////////////////////////////////////////////////
  // SOFT DELETE
  ////////////////////////////////////////////////////////////

  async remove(id: string, user: any) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!task) {
      throw new NotFoundException('Task not found')
    }

    // EMPLOYEE cannot delete tasks
    if (user.role === 'EMPLOYEE') {
      throw new ForbiddenException('Employees cannot delete tasks')
    }

    // TEAM_LEAD restriction - can delete if lead OR assigned
    if (user.role === 'TEAM_LEAD') {
      const isLead = task.project.leadId === user.id
      const isAssigned = task.assignedToId === user.id
      
      if (!isLead && !isAssigned) {
        throw new ForbiddenException('Not your project or task')
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: { isDeleted: true },
    })
  }

////////////////////////////////////////////////////////////
// WORKSPACE: GET MY TASKS
////////////////////////////////////////////////////////////

async findMyTasks(user: any) {
  const where: any = {
    isDeleted: false,
  }

  if (user.role === 'EMPLOYEE') {
    where.assignedToId = user.id
  }

  // TEAM_LEAD sees tasks in led projects OR assigned to them
  if (user.role === 'TEAM_LEAD') {
    where.OR = [
      { project: { leadId: user.id } },
      { assignedToId: user.id }
    ]
  }

  return this.prisma.task.findMany({
    where,
    include: {
      project: {
        select: { id: true, name: true },
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
////////////////////////////////////////////////////////////
// WORKSPACE DASHBOARD SUMMARY
////////////////////////////////////////////////////////////
async getDashboardSummary(user: any) {
  const taskWhere: any = { isDeleted: false }
  const projectWhere: any = {}
  const ticketWhere: any = {}

  if (user.role === 'EMPLOYEE') {
    taskWhere.assignedToId = user.id
    projectWhere.members = { some: { userId: user.id } }
    ticketWhere.assignedToId = user.id
  }

  // TEAM_LEAD sees tasks in led projects OR assigned to them
  if (user.role === 'TEAM_LEAD') {
    taskWhere.OR = [
      { project: { leadId: user.id } },
      { assignedToId: user.id }
    ]
    projectWhere.leadId = user.id
    ticketWhere.project = { leadId: user.id }
  }

  const [
    totalTasks,
    completedTasks,
    overdueTasks,
    totalProjects,
    openTickets,
  ] = await this.prisma.$transaction([
    this.prisma.task.count({ where: taskWhere }),
    this.prisma.task.count({
      where: { ...taskWhere, status: 'COMPLETED' },
    }),
    this.prisma.task.count({
      where: {
        ...taskWhere,
        status: { not: 'COMPLETED' },
        dueDate: { lt: new Date() },
      },
    }),
    this.prisma.project.count({ where: projectWhere }),
    this.prisma.ticket.count({
      where: { ...ticketWhere, status: { not: 'RESOLVED' } },
    }),
  ])

  const activeTasks = totalTasks - completedTasks
  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100)

  return {
    totalTasks,
    activeTasks,
    completedTasks,
    overdueTasks,
    completionRate,
    totalProjects,
    openTickets,
  }
}


////////////////////////////////////////////////////////////
// TASK STATUS BREAKDOWN (Enterprise)
////////////////////////////////////////////////////////////

async getStatusBreakdown(user: any) {
  const where: any = { isDeleted: false }

  if (user.role === 'EMPLOYEE') {
    where.assignedToId = user.id
  }

  // TEAM_LEAD sees tasks in led projects OR assigned to them
  if (user.role === 'TEAM_LEAD') {
    where.OR = [
      { project: { leadId: user.id } },
      { assignedToId: user.id }
    ]
  }

  const tasks = await this.prisma.task.findMany({
    where,
    select: { status: true },
  })

  const breakdown = {
    TODO: 0,
    IN_PROGRESS: 0,
    REVIEW: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  }

  tasks.forEach((task) => {
    breakdown[task.status]++
  })

  return breakdown
}

////////////////////////////////////////////////////////////
// VALIDATE STATUS TRANSITION (ROLE-AWARE + TASK TYPE)
////////////////////////////////////////////////////////////

private validateStatusTransition(
  oldStatus: TaskStatus, 
  newStatus: TaskStatus, 
  userRole: string,
  taskType?: TaskType
): void {
  // Guard 1: Task type validation
  this.validateTaskTypeForTransition(taskType, oldStatus, newStatus);

  // Guard 2: Approval-specific validation
  this.validateApprovalTransition(oldStatus, newStatus, taskType);

  // Define valid transitions based on task type
  const validTransitions: Record<TaskType, Record<TaskStatus, TaskStatus[]>> = {
    ASSIGNED: {
      TODO: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['REVIEW', 'TODO', 'CANCELLED'],
      REVIEW: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'],
      COMPLETED: ['IN_PROGRESS'],
      CANCELLED: [],
      PROPOSED: [], // Not applicable for ASSIGNED
      REJECTED: [], // Not applicable for ASSIGNED
    },
    SELF_WORK: {
      PROPOSED: ['TODO', 'REJECTED'], // Only approval/rejection allowed
      TODO: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['REVIEW', 'TODO', 'CANCELLED'],
      REVIEW: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'],
      COMPLETED: ['IN_PROGRESS'],
      REJECTED: [], // Terminal state
      CANCELLED: [],
    },
  };

  // Get allowed transitions for this task type
  const allowed = validTransitions[taskType || TaskType.ASSIGNED][oldStatus] || [];

  // Role-specific restrictions
  if (userRole === 'EMPLOYEE') {
    // EMPLOYEE can only do limited transitions
    const employeeAllowed: Record<TaskStatus, TaskStatus[]> = {
      TODO: ['IN_PROGRESS'],
      IN_PROGRESS: ['REVIEW'],
      REVIEW: ['IN_PROGRESS'],
      COMPLETED: [],
      CANCELLED: [],
      PROPOSED: [], // Cannot change PROPOSED status directly
      REJECTED: [], // Cannot change REJECTED status
    };

    const employeePermitted = employeeAllowed[oldStatus] || [];
    if (!employeePermitted.includes(newStatus)) {
      throw new ForbiddenException(
        `Employees cannot perform transition: ${oldStatus} → ${newStatus}`
      );
    }
    return;
  }

  if (userRole === 'TEAM_LEAD') {
    // TEAM_LEAD can do more, but still restricted by valid transitions
    if (!allowed.includes(newStatus)) {
      throw new ForbiddenException(
        `Invalid status transition: ${oldStatus} → ${newStatus}`
      );
    }
    return;
  }

  // ADMIN: Use valid transitions map (full control within valid transitions)
  if (!allowed.includes(newStatus)) {
    throw new ForbiddenException(
      `Invalid status transition: ${oldStatus} → ${newStatus}`
    );
  }
}

////////////////////////////////////////////////////////////
// VALIDATE TASK TYPE FOR TRANSITION
////////////////////////////////////////////////////////////

private validateTaskTypeForTransition(
  taskType: TaskType | undefined,
  oldStatus: TaskStatus,
  newStatus: TaskStatus
): void {
  const type = taskType || TaskType.ASSIGNED;

  // ASSIGNED tasks cannot use PROPOSED or REJECTED statuses
  if (type === TaskType.ASSIGNED) {
    if (newStatus === TaskStatus.PROPOSED) {
      throw new ForbiddenException(
        'Assigned tasks cannot be moved to PROPOSED status'
      );
    }
    if (newStatus === TaskStatus.REJECTED) {
      throw new ForbiddenException(
        'Assigned tasks cannot be rejected'
      );
    }
  }

  // SELF_WORK tasks in PROPOSED status can only go to TODO or REJECTED
  if (type === TaskType.SELF_WORK && oldStatus === TaskStatus.PROPOSED) {
    const allowedStatuses: TaskStatus[] = [TaskStatus.TODO, TaskStatus.REJECTED];
    if (!allowedStatuses.includes(newStatus)) {
      throw new ForbiddenException(
        'Proposed tasks must be approved or rejected first'
      );
    }
  }
}

////////////////////////////////////////////////////////////
// VALIDATE APPROVAL TRANSITION
////////////////////////////////////////////////////////////

private validateApprovalTransition(
  oldStatus: TaskStatus,
  newStatus: TaskStatus,
  taskType?: TaskType
): void {
  // Only PROPOSED tasks can be approved to TODO
  if (newStatus === TaskStatus.TODO && oldStatus !== TaskStatus.PROPOSED) {
    // This is fine for normal workflow, only block if coming from invalid state
    // Allow TODO -> IN_PROGRESS -> TODO transitions
  }

  // Only PROPOSED tasks can be rejected
  if (newStatus === TaskStatus.REJECTED && oldStatus !== TaskStatus.PROPOSED) {
    throw new ForbiddenException('Only PROPOSED tasks can be rejected');
  }

  // REJECTED tasks cannot be modified
  if (oldStatus === TaskStatus.REJECTED) {
    throw new ForbiddenException('Rejected tasks cannot be modified');
  }
}
}