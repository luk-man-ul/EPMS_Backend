import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityLogsService } from './activity-logs.service';

@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Get()
  async getRecentActivities(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getRecentActivities(limitNum);
  }

  @Get('user/:userId')
  async getUserActivities(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getUserActivities(userId, limitNum);
  }

  @Get('project/:projectId')
  async getProjectActivities(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getProjectActivities(projectId, limitNum);
  }
}
