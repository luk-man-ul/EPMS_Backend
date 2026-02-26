import { Injectable, BadRequestException } from '@nestjs/common';
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

  validateTransition(current: TicketStatus, next: TicketStatus) {
    const allowed = this.transitions[current];

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }
}