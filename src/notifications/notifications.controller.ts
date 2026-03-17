import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiResponse({ status: 200, description: 'Returns notifications and unread count' })
  async getUserNotifications(@Request() req) {
    const userId = req.user.userId;
    const notifications = await this.notificationsService.getUserNotifications(userId);
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    return { notifications, unreadCount };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    await this.notificationsService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Request() req) {
    const userId = req.user.userId;
    const result = await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read', count: result.count };
  }
}
