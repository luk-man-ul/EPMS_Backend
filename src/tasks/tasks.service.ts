import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { TaskStatus } from '@prisma/client'

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // CREATE TASK
  ////////////////////////////////////////////////////////////

 async create(dto: CreateTaskDto, user: any) {
  const project = await this.prisma.project.findUnique({
    where: { id: dto.projectId },
    include: { members: true },
  })

  if (!project) throw new NotFoundException('Project not found')

  // EMPLOYEE must be project member
  if (
    user.role === 'EMPLOYEE' &&
    !project.members.some((m) => m.userId === user.sub)
  ) {
    throw new ForbiddenException('Not a member of this project')
  }

  return this.prisma.task.create({
    data: {
      projectId: dto.projectId,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      assignedToId: dto.assignedToId || null,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      createdById: user.id, // ✅ FIXED HERE
    },
  })
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

    // EMPLOYEE can only see their tasks
    if (user.role === 'EMPLOYEE') {
      where.assignedToId = user.id
    }

    if (user.role === 'TEAM_LEAD') {
  where.project = {
    leadId: user.id,
  }
}

    const [tasks, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: {
          project: {
            select: { id: true, name: true },
          },
          assignee: {
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
      timeLogs: {
        select: {
          id: true,
          hours: true,
          description: true,
          logDate: true,
          status: true,
        },
        orderBy: { logDate: 'desc' },
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

  // 🔐 TEAM_LEAD restriction
  if (
    user.role === 'TEAM_LEAD' &&
    task.project.leadId !== user.id
  ) {
    throw new ForbiddenException('Access denied')
  }

  return task
}
  ////////////////////////////////////////////////////////////
  // UPDATE TASK
  ////////////////////////////////////////////////////////////
async update(id: string, dto: UpdateTaskDto, user: any) {
  const task = await this.prisma.task.findUnique({
    where: { id },
    include: { project: true },
  })

  if (!task) {
    throw new NotFoundException('Task not found')
  }

  ////////////////////////////////////////////////////////////
  // EMPLOYEE RULES
  ////////////////////////////////////////////////////////////

  if (user.role === 'EMPLOYEE') {
    if (task.assignedToId !== user.id) {
      throw new ForbiddenException('You can only update your own tasks')
    }

    // EMPLOYEE can ONLY update status
    if (!dto.status) {
      throw new ForbiddenException(
        'Employees can only update task status',
      )
    }

    // Prevent modifying other fields
    const allowedFields = ['status']
    const incomingFields = Object.keys(dto)

    const invalidUpdate = incomingFields.some(
      (field) => !allowedFields.includes(field),
    )

    if (invalidUpdate) {
      throw new ForbiddenException(
        'Employees cannot modify task details',
      )
    }
  }

  ////////////////////////////////////////////////////////////
  // TEAM_LEAD RULES
  ////////////////////////////////////////////////////////////

  if (
    user.role === 'TEAM_LEAD' &&
    task.project.leadId !== user.id
  ) {
    throw new ForbiddenException('Not your project')
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
    timeLogs: {
      select: {
        id: true,
        hours: true,
        description: true,
        logDate: true,
        status: true,
      },
      orderBy: { logDate: 'desc' },
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

    // TEAM_LEAD restriction
    if (
      user.role === 'TEAM_LEAD' &&
      task.project.leadId !== user.id
    ) {
      throw new ForbiddenException('Not your project')
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

  if (user.role === 'TEAM_LEAD') {
    where.project = {
      leadId: user.id,
    }
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

  if (user.role === 'TEAM_LEAD') {
    taskWhere.project = { leadId: user.id }
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

  if (user.role === 'TEAM_LEAD') {
    where.project = { leadId: user.id }
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
}