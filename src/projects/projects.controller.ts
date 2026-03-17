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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  //////////////////////////////////////////////////////////////
  // CREATE PROJECT
  //////////////////////////////////////////////////////////////

  @Permissions('projects.create')
  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
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
  @ApiOperation({ summary: 'Get all projects with optional search and pagination' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by project name' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 10 })
  @ApiResponse({ status: 200, description: 'Returns paginated list of projects' })
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
  @ApiOperation({ summary: 'Get projects assigned to the current user' })
  @ApiResponse({ status: 200, description: 'Returns list of user projects' })
  async getMyProjects(@Req() req: any) {
    return this.projectsService.getMyProjects(req.user);
  }

  //////////////////////////////////////////////////////////////
  // GET SINGLE PROJECT
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single project by ID' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Returns project details' })
  @ApiResponse({ status: 404, description: 'Project not found' })
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
  @ApiOperation({ summary: 'Update project details' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
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
  @ApiOperation({ summary: 'Update project status' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Project status updated' })
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
  @ApiOperation({ summary: 'Delete a project' })
  @ApiParam({ name: 'id', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.projectsService.deleteProject(id, req.user);
  }
}
