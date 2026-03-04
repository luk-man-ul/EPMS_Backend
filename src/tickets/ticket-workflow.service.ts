import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class TicketWorkflowService {
  private transitions: Record<TicketStatus, TicketStatus[]> = {
    [TicketStatus.OPEN]: [
      TicketStatus.IN_PROGRESS,
      TicketStatus.REJECTED,
    ],

    [TicketStatus.IN_PROGRESS]: [
      TicketStatus.WAITING_FOR_USER,
      TicketStatus.RESOLVED,
    ],

    [TicketStatus.WAITING_FOR_USER]: [
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
    ],

    [TicketStatus.RESOLVED]: [
      TicketStatus.CLOSED,
      TicketStatus.REOPENED,
    ],

    [TicketStatus.CLOSED]: [],

    [TicketStatus.REJECTED]: [],

    [TicketStatus.REOPENED]: [
      TicketStatus.IN_PROGRESS,
    ],
  };

  // Transitions that require TEAM_LEAD or ADMIN role
  private privilegedTransitions: Record<string, boolean> = {
    'RESOLVED->CLOSED': true,
    'CLOSED->REOPENED': true,
  };

  // Transitions that require user to be assignee
  private assigneeOnlyTransitions: Record<string, boolean> = {
    'OPEN->IN_PROGRESS': true,
    'IN_PROGRESS->WAITING_FOR_USER': true,
    'IN_PROGRESS->RESOLVED': true,
    'WAITING_FOR_USER->IN_PROGRESS': true,
    'WAITING_FOR_USER->RESOLVED': true,
    'REOPENED->IN_PROGRESS': true,
  };

  /**
   * Validates if transition is allowed by workflow rules
   */
  validateTransition(current: TicketStatus, next: TicketStatus) {
    const allowed = this.transitions[current];

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  /**
   * Checks if transition requires privileged role (TEAM_LEAD or ADMIN)
   */
  requiresPrivilegedRole(current: TicketStatus, next: TicketStatus): boolean {
    const key = `${current}->${next}`;
    return this.privilegedTransitions[key] || false;
  }

  /**
   * Checks if transition requires user to be assignee
   */
  requiresAssignee(current: TicketStatus, next: TicketStatus): boolean {
    const key = `${current}->${next}`;
    return this.assigneeOnlyTransitions[key] || false;
  }

  /**
   * Validates if user can perform transition based on role and assignment
   */
  validateTransitionWithRole(
    current: TicketStatus,
    next: TicketStatus,
    userRole: string,
    userId: string,
    ticket: { assignedToId: string | null },
  ) {
    // 1. Check if transition is valid
    this.validateTransition(current, next);

    // 2. ADMIN can do anything
    if (userRole === 'ADMIN') {
      return;
    }

    // 3. Check if ticket is assigned (required for most transitions)
    if (!ticket.assignedToId) {
      throw new ForbiddenException(
        'Ticket must be assigned before status can be changed',
      );
    }

    // 4. Check if transition requires privileged role
    if (this.requiresPrivilegedRole(current, next)) {
      if (userRole !== 'TEAM_LEAD' && userRole !== 'ADMIN') {
        throw new ForbiddenException(
          `Only TEAM_LEAD or ADMIN can transition from ${current} to ${next}`,
        );
      }
    }

    // 5. Check if transition requires user to be assignee
    if (this.requiresAssignee(current, next)) {
      if (ticket.assignedToId !== userId) {
        throw new ForbiddenException(
          'Only the assigned user can perform this status change',
        );
      }
    }
  }
}