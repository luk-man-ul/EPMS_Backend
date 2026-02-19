import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

async getAllProjects(
  user: any,
  options?: {
    search?: string;
    page: number;
    limit: number;
  },
) {
  const page = options?.page || 1;
  const limit = options?.limit || 10;
  const search = options?.search?.trim();

  const skip = (page - 1) * limit;

  let whereCondition: any = {};

  // 🔥 ROLE FILTERING
  if (user.role === 'TEAM_LEAD') {
    whereCondition.leadId = user.id;
  }

  if (user.role === 'EMPLOYEE') {
    whereCondition.members = {
      some: { userId: user.id },
    };
  }

  // 🔥 SEARCH FILTER
  if (search) {
    whereCondition.OR = [
      {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        description: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ];
  }

  const [projects, total] = await this.prisma.$transaction([
    this.prisma.project.findMany({
      where: whereCondition,
      skip,
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        members: {
          select: { userId: true },
        },
        tasks: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.project.count({
      where: whereCondition,
    }),
  ]);

  const formatted = projects.map((project) => {
    const totalTasks = project.tasks.length;

    const completedTasks = project.tasks.filter(
      (task) => task.status === 'COMPLETED',
    ).length;

    const progress =
      totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 100);

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
  // GET ONE
  ////////////////////////////////////////////////////////////

  async getProjectById(id: string, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id },
     include: {
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  members: {
    select: {
      userId: true,
    },
  },
  tasks: {
    select: {
      status: true,
    },
  },
}

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
  // UPDATE
  ////////////////////////////////////////////////////////////

  async updateProject(
    id: string,
    dto: UpdateProjectDto,
    user: any,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project)
      throw new NotFoundException('Project not found');

    if (
      user.role === 'TEAM_LEAD' &&
      project.leadId !== user.id
    ) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate
          ? new Date(dto.startDate)
          : undefined,
        endDate: dto.endDate
          ? new Date(dto.endDate)
          : undefined,
      },
    });
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
  ) {
    throw new ForbiddenException('Access denied');
  }

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

    const progress =
      totalTasks === 0
        ? 0
        : Math.round((completedTasks / totalTasks) * 100);

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status, // use DB enum
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
      lead: project.lead
        ? {
            id: project.lead.id,
            firstName: project.lead.firstName,
            lastName: project.lead.lastName,
          }
        : null,
      teamSize: project.members?.length || 0,
      progress,
      createdAt: project.createdAt,
    };
  }
}
