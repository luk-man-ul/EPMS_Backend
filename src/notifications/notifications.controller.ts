import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(@Request() req) {
    const userId = req.user.userId;
    const notifications = await this.notificationsService.getUserNotifications(userId);
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    
    return {
      notifications,
      unreadCount,
    };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId;
    await this.notificationsService.markAsRead(id, userId);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  async markAllAsRead(@Request() req) {
    const userId = req.user.userId;
    const result = await this.notificationsService.markAllAsRead(userId);
    return { 
      message: 'All notifications marked as read',
      count: result.count,
    };
  }
}
