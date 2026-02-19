import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // CREATE SKILL
  ////////////////////////////////////////////////////////////

  async createSkill(name: string) {
    const existing = await this.prisma.skill.findUnique({
      where: { name },
    })

    if (existing) {
      throw new BadRequestException('Skill already exists')
    }

    return this.prisma.skill.create({
      data: { name },
    })
  }

  ////////////////////////////////////////////////////////////
  // GET ALL SKILLS
  ////////////////////////////////////////////////////////////

  async getAllSkills() {
    return this.prisma.skill.findMany({
      orderBy: { name: 'asc' },
    })
  }

  ////////////////////////////////////////////////////////////
  // ASSIGN SKILL TO USER
  ////////////////////////////////////////////////////////////

  async assignSkill(userId: string, skillId: string) {
    return this.prisma.userSkill.create({
      data: {
        userId,
        skillId,
      },
    })
  }

  ////////////////////////////////////////////////////////////
  // REMOVE SKILL FROM USER
  ////////////////////////////////////////////////////////////

  async removeSkill(userId: string, skillId: string) {
    return this.prisma.userSkill.delete({
      where: {
        userId_skillId: {
          userId,
          skillId,
        },
      },
    })
  }
}
