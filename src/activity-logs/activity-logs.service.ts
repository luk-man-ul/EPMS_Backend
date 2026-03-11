import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateActivityDto {
  userId: string;
  actionType: string;
  description: string;
  entityType: string;
  entityId: string;
  metadata?: any;
}

@Injectable()
export class ActivityLogsService {
  constructor(private prisma: PrismaService) {}

  async createActivity(data: CreateActivityDto) {
    return this.prisma.activityFeed.create({
      data: {
        userId: data.userId,
        actionType: data.actionType,
        description: data.description,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getRecentActivities(limit = 20) {
    return this.prisma.activityFeed.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getUserActivities(userId: string, limit = 20) {
    return this.prisma.activityFeed.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async getProjectActivities(projectId: string, limit = 20) {
    return this.prisma.activityFeed.findMany({
      where: {
        entityType: 'project',
        entityId: projectId,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  // Helper methods for creating specific activity types

  async logTaskAssigned(userId: string, taskTitle: string, taskId: string, assigneeName: string) {
    return this.createActivity({
      userId,
      actionType: 'TASK_ASSIGNED',
      description: `assigned task "${taskTitle}" to ${assigneeName}`,
      entityType: 'task',
      entityId: taskId,
      metadata: { taskTitle, assigneeName },
    });
  }

  async logLeaveApproved(userId: string, requesterName: string, leaveId: string, leaveType: string) {
    return this.createActivity({
      userId,
      actionType: 'LEAVE_APPROVED',
      description: `approved ${leaveType} leave request for ${requesterName}`,
      entityType: 'leave',
      entityId: leaveId,
      metadata: { requesterName, leaveType },
    });
  }

  async logLeaveRejected(userId: string, requesterName: string, leaveId: string, leaveType: string) {
    return this.createActivity({
      userId,
      actionType: 'LEAVE_REJECTED',
      description: `rejected ${leaveType} leave request for ${requesterName}`,
      entityType: 'leave',
      entityId: leaveId,
      metadata: { requesterName, leaveType },
    });
  }

  async logTicketUpdated(userId: string, ticketTitle: string, ticketId: string, updateType: string) {
    return this.createActivity({
      userId,
      actionType: 'TICKET_UPDATED',
      description: `${updateType} ticket "${ticketTitle}"`,
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { ticketTitle, updateType },
    });
  }

  async logTicketResolved(userId: string, ticketTitle: string, ticketId: string) {
    return this.createActivity({
      userId,
      actionType: 'TICKET_RESOLVED',
      description: `resolved ticket "${ticketTitle}"`,
      entityType: 'ticket',
      entityId: ticketId,
      metadata: { ticketTitle },
    });
  }

  async logProjectCreated(userId: string, projectName: string, projectId: string) {
    return this.createActivity({
      userId,
      actionType: 'PROJECT_CREATED',
      description: `created project "${projectName}"`,
      entityType: 'project',
      entityId: projectId,
      metadata: { projectName },
    });
  }

  async logWorkApprovalCompleted(userId: string, workTitle: string, workId: string, status: string) {
    return this.createActivity({
      userId,
      actionType: 'WORK_APPROVAL_COMPLETED',
      description: `${status} work approval for "${workTitle}"`,
      entityType: 'work',
      entityId: workId,
      metadata: { workTitle, status },
    });
  }
}
