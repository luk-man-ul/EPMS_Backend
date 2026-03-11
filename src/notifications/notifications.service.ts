import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateNotificationDto {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async createNotification(data: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || null,
        isRead: false,
      },
    });
  }

  async getUserNotifications(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
      data: {
        isRead: true,
      },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  // Helper methods for creating specific notification types

  async notifyTaskAssigned(userId: string, taskTitle: string, taskId: string) {
    return this.createNotification({
      userId,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned',
      message: `You have been assigned to task: ${taskTitle}`,
      metadata: { taskId },
    });
  }

  async notifyLeaveApproved(userId: string, leaveId: string) {
    return this.createNotification({
      userId,
      type: 'LEAVE_APPROVED',
      title: 'Leave Request Approved',
      message: 'Your leave request has been approved',
      metadata: { leaveId },
    });
  }

  async notifyLeaveRejected(userId: string, leaveId: string, reason?: string) {
    return this.createNotification({
      userId,
      type: 'LEAVE_REJECTED',
      title: 'Leave Request Rejected',
      message: reason || 'Your leave request has been rejected',
      metadata: { leaveId },
    });
  }

  async notifyTicketUpdated(userId: string, ticketTitle: string, ticketId: string, updateType: string) {
    return this.createNotification({
      userId,
      type: 'TICKET_UPDATED',
      title: 'Ticket Updated',
      message: `Ticket "${ticketTitle}" has been ${updateType}`,
      metadata: { ticketId },
    });
  }

  async notifyWorkApprovalRequested(userId: string, workTitle: string, workId: string) {
    return this.createNotification({
      userId,
      type: 'WORK_APPROVAL_REQUESTED',
      title: 'Work Approval Requested',
      message: `Approval requested for: ${workTitle}`,
      metadata: { workId },
    });
  }

  async notifyProjectAssigned(userId: string, projectName: string, projectId: string) {
    return this.createNotification({
      userId,
      type: 'PROJECT_ASSIGNED',
      title: 'Project Assignment',
      message: `You have been assigned to project: ${projectName}`,
      metadata: { projectId },
    });
  }
}
