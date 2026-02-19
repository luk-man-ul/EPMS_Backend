import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  //////////////////////////////////////////////////////////////
  // CREATE PROJECT
  //////////////////////////////////////////////////////////////

  async createProject(dto: CreateProjectDto, createdById: string) {
    const { name, description, startDate, endDate, budget, leadId, memberIds } = dto


    // 1️⃣ Must have at least one member
  if (!memberIds || memberIds.length === 0) {
    throw new BadRequestException('Project must have at least one member')
  }


    // 1️⃣ Validate Lead Exists
    const lead = await this.prisma.user.findUnique({
      where: { id: leadId },
      include: { roles: { include: { role: true } } },
    })

    if (!lead) {
      throw new NotFoundException('Lead user not found')
    }

    // 2️⃣ Validate Lead has TEAM_LEAD role
    const isTeamLead = lead.roles.some(r => r.role.name === 'TEAM_LEAD')

    if (!isTeamLead) {
      throw new BadRequestException('Selected lead must have TEAM_LEAD role')
    }

    // 3️⃣ Ensure lead is included in members
    const uniqueMembers = Array.from(new Set([...memberIds, leadId]))

    // 4️⃣ Transaction
    const project = await this.prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          name,
          description,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          budget,
          createdById,
          leadId,
        },
      })

      await tx.projectMember.createMany({
        data: uniqueMembers.map((userId) => ({
          projectId: createdProject.id,
          userId,
        })),
      })

      return createdProject
    })

    return { message: 'Project created successfully', project }
  }

  //////////////////////////////////////////////////////////////
  // GET ALL PROJECTS
  //////////////////////////////////////////////////////////////

  async getAllProjects() {
    return this.prisma.project.findMany({
      include: {
        lead: true,
        members: true,
        tasks: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  //////////////////////////////////////////////////////////////
  // GET PROJECT BY ID
  //////////////////////////////////////////////////////////////

  async getProjectById(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        lead: true,
        members: {
          include: { user: true },
        },
        tasks: true,
        tickets: true,
      },
    })

    if (!project) throw new NotFoundException('Project not found')

    return project
  }

  //////////////////////////////////////////////////////////////
  // UPDATE PROJECT
  //////////////////////////////////////////////////////////////

  async updateProject(id: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id } })

    if (!project) throw new NotFoundException('Project not found')

    return this.prisma.project.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    })
  }

  //////////////////////////////////////////////////////////////
  // DELETE PROJECT
  //////////////////////////////////////////////////////////////

  async deleteProject(id: string) {
    await this.prisma.project.delete({
      where: { id },
    })

    return { message: 'Project deleted successfully' }
  }
}
