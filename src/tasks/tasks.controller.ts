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
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { TasksService } from './tasks.service'
import { CreateTaskDto } from './dto/create-task.dto'
import { UpdateTaskDto } from './dto/update-task.dto'
import { CreateSelfWorkDto } from './dto/create-self-work.dto'
import { RejectSelfWorkDto } from './dto/reject-self-work.dto'
import { TaskFilterDto } from './dto/task-filter.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PermissionGuard } from '../common/guards/permission.guard'
import { ProjectMembershipGuard } from '../common/guards/project-membership.guard'
import { ApprovalAuthorityGuard } from '../common/guards/approval-authority.guard'
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
  // CREATE SELF-WORK TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.create')
  @UseGuards(ProjectMembershipGuard)
  @Post('self-work')
  @HttpCode(HttpStatus.CREATED)
  createSelfWork(@Body() dto: CreateSelfWorkDto, @Req() req) {
    return this.tasksService.createSelfWork(dto, req.user)
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
  // SELF-WORK APPROVAL ENDPOINTS
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.approve')
  @UseGuards(ApprovalAuthorityGuard)
  @Patch('pending-approvals/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveSelfWork(@Param('id') id: string, @Req() req) {
    return this.tasksService.approveSelfWork(id, req.user)
  }

  @Permissions('tasks.approve')
  @UseGuards(ApprovalAuthorityGuard)
  @Patch('pending-approvals/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectSelfWork(
    @Param('id') id: string,
    @Body() dto: RejectSelfWorkDto,
    @Req() req,
  ) {
    return this.tasksService.rejectSelfWork(id, dto.reason, req.user)
  }

  @Permissions('tasks.approve')
  @Get('pending-approvals')
  getPendingApprovals(@Req() req) {
    return this.tasksService.getPendingApprovals(req.user)
  }

  ////////////////////////////////////////////////////////////
  // SELF-WORK METRICS
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('self-work-metrics')
  getSelfWorkMetrics(@Query('projectId') projectId: string, @Req() req) {
    return this.tasksService.getSelfWorkMetrics(projectId, req.user)
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
  findAll(@Query() query: TaskFilterDto, @Req() req) {
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