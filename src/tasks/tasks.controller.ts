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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
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

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  ////////////////////////////////////////////////////////////
  // CREATE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.create')
  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
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
  @ApiOperation({ summary: 'Create a self-work task (requires project membership)' })
  @ApiResponse({ status: 201, description: 'Self-work task created, pending approval' })
  createSelfWork(@Body() dto: CreateSelfWorkDto, @Req() req) {
    return this.tasksService.createSelfWork(dto, req.user)
  }

  ////////////////////////////////////////////////////////////
  // WORKSPACE ROUTES (MUST COME BEFORE :id)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('my')
  @ApiOperation({ summary: 'Get tasks assigned to the current user' })
  @ApiResponse({ status: 200, description: 'Returns list of user tasks' })
  getMyTasks(@Req() req) {
    return this.tasksService.findMyTasks(req.user)
  }

  @Permissions('tasks.view')
  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Get task dashboard summary for current user' })
  @ApiResponse({ status: 200, description: 'Returns task summary stats' })
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
  @ApiOperation({ summary: 'Approve a self-work task' })
  @ApiParam({ name: 'id', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Self-work task approved' })
  approveSelfWork(@Param('id') id: string, @Req() req) {
    return this.tasksService.approveSelfWork(id, req.user)
  }

  @Permissions('tasks.approve')
  @UseGuards(ApprovalAuthorityGuard)
  @Patch('pending-approvals/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a self-work task with reason' })
  @ApiParam({ name: 'id', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Self-work task rejected' })
  rejectSelfWork(
    @Param('id') id: string,
    @Body() dto: RejectSelfWorkDto,
    @Req() req,
  ) {
    return this.tasksService.rejectSelfWork(id, dto.reason, req.user)
  }

  @Permissions('tasks.approve')
  @Get('pending-approvals')
  @ApiOperation({ summary: 'Get all self-work tasks pending approval' })
  @ApiResponse({ status: 200, description: 'Returns list of pending self-work tasks' })
  getPendingApprovals(@Req() req) {
    return this.tasksService.getPendingApprovals(req.user)
  }

  ////////////////////////////////////////////////////////////
  // SELF-WORK METRICS
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('self-work-metrics')
  @ApiOperation({ summary: 'Get self-work metrics for a project' })
  @ApiQuery({ name: 'projectId', required: true, description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Returns self-work metrics' })
  getSelfWorkMetrics(@Query('projectId') projectId: string, @Req() req) {
    return this.tasksService.getSelfWorkMetrics(projectId, req.user)
  }

  ////////////////////////////////////////////////////////////
  // STATUS BREAKDOWN (DASHBOARD)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get('status-breakdown')
  @ApiOperation({ summary: 'Get task status breakdown for dashboard charts' })
  @ApiResponse({ status: 200, description: 'Returns task counts by status' })
  getStatusBreakdown(@Req() req) {
    return this.tasksService.getStatusBreakdown(req.user)
  }

  ////////////////////////////////////////////////////////////
  // GET ALL TASKS (FILTERED + PAGINATED)
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get()
  @ApiOperation({ summary: 'Get all tasks with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of tasks' })
  findAll(@Query() query: TaskFilterDto, @Req() req) {
    return this.tasksService.findAll(query, req.user)
  }

  ////////////////////////////////////////////////////////////
  // GET SINGLE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.view')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single task by ID' })
  @ApiParam({ name: 'id', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Returns task details' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id') id: string, @Req() req) {
    return this.tasksService.findOne(id, req.user)
  }

  ////////////////////////////////////////////////////////////
  // UPDATE TASK
  ////////////////////////////////////////////////////////////

  @Permissions('tasks.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiParam({ name: 'id', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
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
  @ApiOperation({ summary: 'Soft delete a task' })
  @ApiParam({ name: 'id', description: 'Task UUID' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  remove(@Param('id') id: string, @Req() req) {
    return this.tasksService.remove(id, req.user)
  }
}
