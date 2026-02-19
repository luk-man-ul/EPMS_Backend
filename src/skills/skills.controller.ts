import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { SkillsService } from './skills.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Permissions } from '../common/decorators/permissions.decorator'

@UseGuards(JwtAuthGuard)
@Controller('skills')
export class SkillsController {
  constructor(private skillsService: SkillsService) {}

  ////////////////////////////////////////////////////////////
  // CREATE SKILL
  ////////////////////////////////////////////////////////////

  @Permissions('employees.create')
  @Post()
  create(@Body('name') name: string) {
    return this.skillsService.createSkill(name)
  }

  ////////////////////////////////////////////////////////////
  // GET ALL SKILLS
  ////////////////////////////////////////////////////////////

  @Permissions('employees.view')
  @Get()
  findAll() {
    return this.skillsService.getAllSkills()
  }

  ////////////////////////////////////////////////////////////
  // ASSIGN SKILL
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Post(':userId/:skillId')
  assign(
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.assignSkill(userId, skillId)
  }

  ////////////////////////////////////////////////////////////
  // REMOVE SKILL
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Delete(':userId/:skillId')
  remove(
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.removeSkill(userId, skillId)
  }
}
