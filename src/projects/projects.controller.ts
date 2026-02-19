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
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  //////////////////////////////////////////////////////////////
  // CREATE
  //////////////////////////////////////////////////////////////

  @Permissions('projects.create')
  @Post()
  create(@Body() dto: CreateProjectDto, @Req() req: any) {
    return this.projectsService.createProject(dto, req.user);
  }

  //////////////////////////////////////////////////////////////
  // GET ALL (search + pagination)
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get()
  findAll(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.projectsService.getAllProjects(req.user, {
      search,
      page: Number(page) || 1,
      limit: Number(limit) || 10,
    });
  }

  //////////////////////////////////////////////////////////////
  // GET ONE
  //////////////////////////////////////////////////////////////

  @Permissions('projects.view')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.projectsService.getProjectById(id, req.user);
  }

  //////////////////////////////////////////////////////////////
  // UPDATE
  //////////////////////////////////////////////////////////////

  @Permissions('projects.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: any,
  ) {
    return this.projectsService.updateProject(id, dto, req.user);
  }

  //////////////////////////////////////////////////////////////
  // DELETE
  //////////////////////////////////////////////////////////////

  @Permissions('projects.delete')
 @Delete(':id')
remove(@Param('id') id: string, @Req() req: any) {
  return this.projectsService.deleteProject(id, req.user);
  }
}
