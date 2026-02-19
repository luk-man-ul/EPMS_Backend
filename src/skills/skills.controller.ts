import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { SkillsService } from './skills.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('skills')
export class SkillsController {
  constructor(private skillsService: SkillsService) {}

  @Post()
  create(@Body('name') name: string) {
    return this.skillsService.createSkill(name)
  }

  @Get()
  findAll() {
    return this.skillsService.getAllSkills()
  }

  @Post(':userId/:skillId')
  assign(
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.assignSkill(userId, skillId)
  }

  @Delete(':userId/:skillId')
  remove(
    @Param('userId') userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.removeSkill(userId, skillId)
  }
}
