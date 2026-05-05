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
  @ApiOperation({ summary: 'Get notifications for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Returns notifications and unread count' })
  async getUserNotifications(@Request() req: any) {
    const userId = req.user.id; // JWT strategy returns { id, role, permissions }
    const [notifications, unreadCount] = await Promise.all([
      this.notificationsService.getUserNotifications(userId),
      this.notificationsService.getUnreadCount(userId),
    ]);
    return { notifications, unreadCount };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Request() req: any) {
    const userId = req.user.id;
    const result = await this.notificationsService.markAllAsRead(userId);
    return { message: 'All notifications marked as read', count: result.count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    await this.notificationsService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }
}
