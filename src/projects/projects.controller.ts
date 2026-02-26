import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  //////////////////////////////////////////////////////////////
  // CREATE PROJECT
  //////////////////////////////////////////////////////////////

  @Permissions('projects.create')
  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @Req() req: any,
  ) {
    return this.projectsService.createProject(dto, req.user);
  }

  //////////////////////////////////////////////////////////////
  // GET ALL PROJECTS (SEARCH + PAGINATION)
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get()
  async findAll(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectsService.getAllProjects(req.user, {
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });
  }

  //////////////////////////////////////////////////////////////
  // GET MY PROJECTS (WORKSPACE)
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get('my')
  async getMyProjects(@Req() req: any) {
    return this.projectsService.getMyProjects(req.user);
  }

  //////////////////////////////////////////////////////////////
  // GET SINGLE PROJECT
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.projectsService.getProjectById(id, req.user);
  }

  //////////////////////////////////////////////////////////////
  // UPDATE PROJECT (FULL UPDATE)
  //////////////////////////////////////////////////////////////

  @Permissions('projects.update')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: any,
  ) {
    return this.projectsService.updateProject(id, dto, req.user);
  }

  //////////////////////////////////////////////////////////////
  // UPDATE PROJECT STATUS
  //////////////////////////////////////////////////////////////

  @Permissions('projects.update.status')
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectStatusDto,
    @Req() req: any,
  ) {
    return this.projectsService.updateProjectStatus(
      id,
      dto.status,
      req.user,
    );
  }

  //////////////////////////////////////////////////////////////
  // DELETE PROJECT
  //////////////////////////////////////////////////////////////

  @Permissions('projects.delete')
  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.projectsService.deleteProject(id, req.user);
  }
}