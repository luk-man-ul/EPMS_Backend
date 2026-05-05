import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from './notification-type.enum';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

// Forward-declared so the service can call the gateway without a circular dep.
// The gateway sets itself on this service after construction.
export interface INotificationsGateway {
  pushToUser(userId: string, notification: any): void;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** Set by NotificationsGateway after it is instantiated. */
  gateway: INotificationsGateway | null = null;

  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // CORE CRUD
  // ─────────────────────────────────────────────────────────────

  async createNotification(data: CreateNotificationDto) {
    if (!data.userId) {
      this.logger.error('createNotification called without userId — skipping');
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId:     data.userId,
        type:       data.type,
        title:      data.title,
        message:    data.message,
        entityType: data.entityType ?? null,
        entityId:   data.entityId   ?? null,
        metadata:   data.metadata   ?? undefined,
        isRead:     false,
      } as any,
    });

    // Push real-time if the user is currently connected
    try {
      this.gateway?.pushToUser(data.userId, notification);
    } catch (err) {
      this.logger.warn(`Real-time push failed for user ${data.userId}: ${err}`);
    }

    return notification;
  }

  /** Notify every admin in the system. */
  async notifyAllAdmins(data: Omit<CreateNotificationDto, 'userId'>) {
    const admins = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { name: 'ADMIN' } } },
      },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.createNotification({ ...data, userId: admin.id }),
      ),
    );
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
      where: { userId, isRead: false },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true } as any,
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true } as any,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // DOMAIN HELPERS — called by feature services
  // ─────────────────────────────────────────────────────────────

  // ── Self-work ──────────────────────────────────────────────

  async notifySelfWorkRequested(requesterId: string, taskTitle: string, taskId: string) {
    await this.notifyAllAdmins({
      type:       NotificationType.SELF_WORK_REQUESTED,
      title:      'Self-Work Approval Needed',
      message:    `A self-work proposal "${taskTitle}" is awaiting your approval.`,
      entityType: 'TASK',
      entityId:   taskId,
    });
  }

  async notifyTaskApproved(userId: string, taskTitle: string, taskId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.TASK_APPROVED,
      title:      'Self-Work Approved',
      message:    `Your self-work proposal "${taskTitle}" has been approved.`,
      entityType: 'TASK',
      entityId:   taskId,
    });
  }

  async notifyTaskRejected(userId: string, taskTitle: string, taskId: string, reason: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.TASK_REJECTED,
      title:      'Self-Work Rejected',
      message:    `Your self-work proposal "${taskTitle}" was rejected. Reason: ${reason}`,
      entityType: 'TASK',
      entityId:   taskId,
    });
  }

  // ── WFH ───────────────────────────────────────────────────

  async notifyWfhRequested(requesterId: string, fromDate: string, toDate: string, requestId: string) {
    await this.notifyAllAdmins({
      type:       NotificationType.WFH_REQUESTED,
      title:      'WFH Request Pending',
      message:    `A WFH request for ${fromDate} – ${toDate} is awaiting approval.`,
      entityType: 'WFH_REQUEST',
      entityId:   requestId,
    });
  }

  async notifyWfhApproved(userId: string, fromDate: string, toDate: string, requestId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.WFH_APPROVED,
      title:      'WFH Request Approved',
      message:    `Your WFH request for ${fromDate} – ${toDate} has been approved.`,
      entityType: 'WFH_REQUEST',
      entityId:   requestId,
    });
  }

  async notifyWfhRejected(userId: string, fromDate: string, toDate: string, requestId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.WFH_REJECTED,
      title:      'WFH Request Rejected',
      message:    `Your WFH request for ${fromDate} – ${toDate} has been rejected.`,
      entityType: 'WFH_REQUEST',
      entityId:   requestId,
    });
  }

  // ── Leave ─────────────────────────────────────────────────

  async notifyLeaveRequested(requesterId: string, leaveType: string, startDate: string, endDate: string, leaveId: string) {
    await this.notifyAllAdmins({
      type:       NotificationType.LEAVE_REQUESTED,
      title:      'Leave Request Pending',
      message:    `A ${leaveType} leave request for ${startDate} – ${endDate} is awaiting approval.`,
      entityType: 'LEAVE_REQUEST',
      entityId:   leaveId,
    });
  }

  async notifyLeaveApproved(userId: string, leaveType: string, leaveId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.LEAVE_APPROVED,
      title:      'Leave Request Approved',
      message:    `Your ${leaveType} leave request has been approved.`,
      entityType: 'LEAVE_REQUEST',
      entityId:   leaveId,
    });
  }

  async notifyLeaveRejected(userId: string, leaveType: string, leaveId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.LEAVE_REJECTED,
      title:      'Leave Request Rejected',
      message:    `Your ${leaveType} leave request has been rejected.`,
      entityType: 'LEAVE_REQUEST',
      entityId:   leaveId,
    });
  }

  // ── Tasks ─────────────────────────────────────────────────

  async notifyTaskAssigned(userId: string, taskTitle: string, projectName: string, taskId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.TASK_ASSIGNED,
      title:      'New Task Assigned',
      message:    `You have been assigned to task "${taskTitle}" in project "${projectName}".`,
      entityType: 'TASK',
      entityId:   taskId,
    });
  }

  // ── Projects ──────────────────────────────────────────────

  async notifyProjectAssigned(userId: string, projectName: string, projectId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.PROJECT_ASSIGNED,
      title:      'Added to Project',
      message:    `You have been added to project "${projectName}".`,
      entityType: 'PROJECT',
      entityId:   projectId,
    });
  }

  // ── Tickets ───────────────────────────────────────────────

  async notifyTicketRaised(ticketTitle: string, projectName: string, ticketId: string) {
    await this.notifyAllAdmins({
      type:       NotificationType.TICKET_RAISED,
      title:      'New Ticket Raised',
      message:    `A new ticket "${ticketTitle}" has been raised in project "${projectName}".`,
      entityType: 'TICKET',
      entityId:   ticketId,
    });
  }

  async notifyTicketAssigned(userId: string, ticketTitle: string, ticketId: string) {
    await this.createNotification({
      userId,
      type:       NotificationType.TICKET_ASSIGNED,
      title:      'Ticket Assigned to You',
      message:    `Ticket "${ticketTitle}" has been assigned to you.`,
      entityType: 'TICKET',
      entityId:   ticketId,
    });
  }
}
