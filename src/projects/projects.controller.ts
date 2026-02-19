import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @Req() req: any) {
    return this.projectsService.createProject(dto, req.user.id)
  }

  @Get()
  findAll() {
    return this.projectsService.getAllProjects()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.getProjectById(id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.deleteProject(id)
  }
}
