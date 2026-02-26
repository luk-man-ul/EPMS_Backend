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
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  ////////////////////////////////////////////////////////////
  // CREATE
  ////////////////////////////////////////////////////////////

  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req) {
    return this.tasksService.create(dto, req.user)
  }

  ////////////////////////////////////////////////////////////
  // WORKSPACE ROUTES (MUST COME BEFORE :id)
  ////////////////////////////////////////////////////////////

  @Get('my')
  getMyTasks(@Req() req) {
    return this.tasksService.findMyTasks(req.user)
  }

  @Get('dashboard/summary')
  getSummary(@Req() req) {
    return this.tasksService.getDashboardSummary(req.user)
  }

  ///////////////////////////////////////////////////////////////
// STATUS BREAKDOWN FOR DASHBOARD
///////////////////////////////////////////////////////////////
  @Get('status-breakdown')
getStatusBreakdown(@Req() req) {
  return this.tasksService.getStatusBreakdown(req.user)
}

  ////////////////////////////////////////////////////////////
  // GET ALL
  ////////////////////////////////////////////////////////////

  @Get()
  findAll(@Query() query, @Req() req) {
    return this.tasksService.findAll(query, req.user)
  }

  ////////////////////////////////////////////////////////////
  // GET ONE (KEEP LAST)
  ////////////////////////////////////////////////////////////

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.tasksService.findOne(id, req.user)
  }

  ////////////////////////////////////////////////////////////
  // UPDATE
  ////////////////////////////////////////////////////////////

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req,
  ) {
    return this.tasksService.update(id, dto, req.user)
  }

  ////////////////////////////////////////////////////////////
  // DELETE
  ////////////////////////////////////////////////////////////

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.tasksService.remove(id, req.user)
  }

}
