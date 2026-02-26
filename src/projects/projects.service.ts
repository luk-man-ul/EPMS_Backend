import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // CREATE PROJECT
  ////////////////////////////////////////////////////////////

  async createProject(dto: CreateProjectDto, user: any) {
    const {
      name,
      description,
      startDate,
      endDate,
      budget,
      leadId,
      memberIds,
    } = dto;

    if (!memberIds || memberIds.length === 0) {
      throw new BadRequestException(
        'Project must have at least one member',
      );
    }

    const lead = await this.prisma.user.findUnique({
      where: { id: leadId },
      include: { roles: { include: { role: true } } },
    });

    if (!lead) throw new NotFoundException('Lead not found');

    const isTeamLead = lead.roles.some(
      (r) => r.role.name === 'TEAM_LEAD',
    );

    if (!isTeamLead) {
      throw new BadRequestException(
        'Lead must have TEAM_LEAD role',
      );
    }

    const uniqueMembers = Array.from(
      new Set([...memberIds, leadId]),
    );

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          description,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          budget,
          createdById: user.id,
          leadId,
        },
      });

      await tx.projectMember.createMany({
        data: uniqueMembers.map((id) => ({
          projectId: created.id,
          userId: id,
        })),
      });

      return created;
    });

    return {
      message: 'Project created successfully',
      project,
    };
  }

  ////////////////////////////////////////////////////////////
  // GET ALL PROJECTS
  ////////////////////////////////////////////////////////////

  async getAllProjects(user: any, options?: any) {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const search = options?.search?.trim();
    const skip = (page - 1) * limit;

    let whereCondition: any = {};

    if (user.role === 'TEAM_LEAD') {
      whereCondition.leadId = user.id;
    }

    if (user.role === 'EMPLOYEE') {
      whereCondition.members = {
        some: { userId: user.id },
      };
    }

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where: whereCondition,
        skip,
        take: limit,
        include: {
          lead: {
            select: { id: true, firstName: true, lastName: true },
          },
          members: { select: { userId: true } },
          tasks: {
            where: { isDeleted: false },
            select: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where: whereCondition }),
    ]);

    const formatted = projects.map((project) => {
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter(
        (t) => t.status === 'COMPLETED',
      ).length;

      let progress = 0;

// 🔥 INDUSTRY STANDARD LOGIC

if (project.status === 'COMPLETED' || project.status === 'ARCHIVED') {
  progress = 100;
} else if (totalTasks > 0) {
  progress = Math.round((completedTasks / totalTasks) * 100);
} else {
  progress = 0;
}
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        progress,
        endDate: project.endDate,
        lead: project.lead,
        teamSize: project.members.length,
      };
    });

    return {
      data: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  ////////////////////////////////////////////////////////////
  // GET MY PROJECTS
  ////////////////////////////////////////////////////////////

  async getMyProjects(user: any) {
    let whereCondition: any = {};

    if (user.role === 'TEAM_LEAD') {
      whereCondition.leadId = user.id;
    }

    if (user.role === 'EMPLOYEE') {
      whereCondition.members = {
        some: { userId: user.id },
      };
    }

    const projects = await this.prisma.project.findMany({
      where: whereCondition,
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        tasks: {
          where: { isDeleted: false },
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((project) => this.formatProject(project));
  }

  ////////////////////////////////////////////////////////////
  // GET ONE (FULL PROJECT DETAILS)
  ////////////////////////////////////////////////////////////

  async getProjectById(id: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        tasks: {
          where: { isDeleted: false },
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        tickets: {
          where: { isDeleted: false },
          include: {
            reporter: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!project)
      throw new NotFoundException('Project not found');

    if (
      user.role === 'TEAM_LEAD' &&
      project.leadId !== user.id
    ) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role === 'EMPLOYEE') {
      const isMember = project.members.some(
        (m) => m.userId === user.id,
      );
      if (!isMember)
        throw new ForbiddenException('Access denied');
    }

    return this.formatProject(project);
  }

  ////////////////////////////////////////////////////////////
  // UPDATE PROJECT (FULL)
  ////////////////////////////////////////////////////////////

  async updateProject(id: string, dto: UpdateProjectDto, user: any) {
    const existingProject = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject)
      throw new NotFoundException('Project not found');

    if (user.role !== 'TEAM_LEAD')
      throw new ForbiddenException(
        'Only Team Lead can update project',
      );

    if (existingProject.leadId !== user.id)
      throw new ForbiddenException('Access denied');

    const { memberIds, leadId, startDate, endDate, ...rest } =
      dto as any;

    const updatedProject = await this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        ...(leadId && {
          lead: { connect: { id: leadId } },
        }),
        ...(memberIds && {
          members: {
            deleteMany: {},
            create: memberIds.map((userId: string) => ({
              user: { connect: { id: userId } },
            })),
          },
        }),
      },
      include: {
        lead: true,
        members: { include: { user: true } },
        tasks: {
          where: { isDeleted: false },
          select: { status: true },
        },
      },
    });

    return this.formatProject(updatedProject);
  }

  ////////////////////////////////////////////////////////////
  // UPDATE STATUS
  ////////////////////////////////////////////////////////////
async updateProjectStatus(
  id: string,
  status: string,
  user: any,
) {
  const existingProject = await this.prisma.project.findUnique({
    where: { id },
  });

  if (!existingProject) {
    throw new NotFoundException('Project not found');
  }

  ////////////////////////////////////////////////////////////
  // 🔒 BUSINESS RULE: Prevent completion if tasks open
  ////////////////////////////////////////////////////////////

  if (status === 'COMPLETED') {
    const openTasks = await this.prisma.task.count({
      where: {
        projectId: id,
        isDeleted: false,
        NOT: {
          status: 'COMPLETED',
        },
      },
    });

    if (openTasks > 0) {
      throw new ForbiddenException(
        `Cannot complete project. ${openTasks} task(s) are still open.`,
      );
    }
  }

  ////////////////////////////////////////////////////////////
  // 🔐 ROLE AUTHORIZATION
  ////////////////////////////////////////////////////////////

  // ADMIN → Full control
  if (user.role === 'ADMIN') {
    const updatedProject = await this.prisma.project.update({
      where: { id },
      data: { status: status as ProjectStatus },
      include: {
        lead: true,
        members: { include: { user: true } },
        tasks: {
          where: { isDeleted: false },
          select: { status: true },
        },
      },
    });

    return this.formatProject(updatedProject);
  }

  // TEAM_LEAD → Only if owner
  if (user.role === 'TEAM_LEAD') {
    if (existingProject.leadId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned project lead can change lifecycle status',
      );
    }

    const updatedProject = await this.prisma.project.update({
      where: { id },
      data: { status: status as ProjectStatus },
      include: {
        lead: true,
        members: { include: { user: true } },
        tasks: {
          where: { isDeleted: false },
          select: { status: true },
        },
      },
    });

    return this.formatProject(updatedProject);
  }

  // EMPLOYEE → Blocked
  throw new ForbiddenException(
    'Employees are not authorized to change project lifecycle status',
  );
}
  ////////////////////////////////////////////////////////////
  // DELETE
  ////////////////////////////////////////////////////////////

  async deleteProject(id: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project)
      throw new NotFoundException('Project not found');

    if (
      user.role === 'TEAM_LEAD' &&
      project.leadId !== user.id
    )
      throw new ForbiddenException('Access denied');

    await this.prisma.project.delete({
      where: { id },
    });

    return { message: 'Project deleted successfully' };
  }

  ////////////////////////////////////////////////////////////
  // FORMAT RESPONSE
  ////////////////////////////////////////////////////////////

  private formatProject(project: any) {
    const totalTasks = project.tasks?.length || 0;

const completedTasks =
  project.tasks?.filter(
    (t) => t.status === 'COMPLETED',
  ).length || 0;

let progress = 0;

// 🔥 INDUSTRY STANDARD LOGIC

if (project.status === 'COMPLETED' || project.status === 'ARCHIVED') {
  progress = 100;
} else if (totalTasks > 0) {
  progress = Math.round((completedTasks / totalTasks) * 100);
} else {
  progress = 0;
}

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      leadId: project.leadId,
      lead: project.lead || null,
      members:
        project.members?.map((m: any) => ({
          userId: m.userId,
          user: m.user,
        })) || [],
      teamSize: project.members?.length || 0,
     tasks:
  project.tasks?.map((task: any) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,

    assignee: task.assignee
      ? {
          id: task.assignee.id,
          firstName: task.assignee.firstName,
          lastName: task.assignee.lastName,
        }
      : null,
  })) || [],
      tickets:
        project.tickets?.map((ticket: any) => ({
          id: ticket.id,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority,
          reporter: ticket.reporter
            ? `${ticket.reporter.firstName} ${ticket.reporter.lastName}`
            : '',
          assignee: ticket.assignee
            ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
            : 'Unassigned',
          createdAt: ticket.createdAt,
        })) || [],
      progress,
      createdAt: project.createdAt,
    };
  }
}