import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { TasksService } from './tasks.service'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PermissionGuard } from '../common/guards/permission.guard'
import { Permissions } from '../common/decorators/permissions.decorator'

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  ////////////////////////////////////////////////////////////
  // CREATE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.create')
  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req) {
    return this.tasksService.create(dto, req.user)
  }

  ////////////////////////////////////////////////////////////
  // WORKSPACE ROUTES (MUST COME BEFORE :id)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('my')
  getMyTasks(@Req() req) {
    return this.tasksService.findMyTasks(req.user)
  }

  @Permissions('tasks.view')
  @Get('dashboard/summary')
  getSummary(@Req() req) {
    return this.tasksService.getDashboardSummary(req.user)
  }

  ////////////////////////////////////////////////////////////
  // STATUS BREAKDOWN (DASHBOARD)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('status-breakdown')
  getStatusBreakdown(@Req() req) {
    return this.tasksService.getStatusBreakdown(req.user)
  }

  ////////////////////////////////////////////////////////////
  // GET ALL TASKS (FILTERED + PAGINATED)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get()
  findAll(@Query() query, @Req() req) {
    return this.tasksService.findAll(query, req.user)
  }

  ////////////////////////////////////////////////////////////
  // GET SINGLE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.tasksService.findOne(id, req.user)
  }

  ////////////////////////////////////////////////////////////
  // UPDATE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req,
  ) {
    return this.tasksService.update(id, dto, req.user)
  }

  ////////////////////////////////////////////////////////////
  // DELETE TASK (SOFT DELETE)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.tasksService.remove(id, req.user)
  }
}