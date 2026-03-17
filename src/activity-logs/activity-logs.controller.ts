import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityLogsService } from './activity-logs.service';

@ApiTags('activities')
@ApiBearerAuth()
@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Get recent activity logs' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return', example: 20 })
  @ApiResponse({ status: 200, description: 'Returns recent activity logs' })
  async getRecentActivities(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getRecentActivities(limitNum);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get activity logs for a specific user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return', example: 20 })
  @ApiResponse({ status: 200, description: 'Returns user activity logs' })
  async getUserActivities(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getUserActivities(userId, limitNum);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get activity logs for a specific project' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return', example: 20 })
  @ApiResponse({ status: 200, description: 'Returns project activity logs' })
  async getProjectActivities(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.activityLogsService.getProjectActivities(projectId, limitNum);
  }
}
