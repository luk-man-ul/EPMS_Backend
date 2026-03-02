import { ForbiddenException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';

/**
 * Project Status Workflow Service
 * 
 * Implements industry-standard project lifecycle workflow:
 * PLANNING → ACTIVE → (ON_HOLD ↔ ACTIVE) → COMPLETED → ARCHIVED
 * 
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5
 */
export class ProjectWorkflowService {
  /**
   * Defines allowed status transitions for projects
   * 
   * Workflow rules:
   * - PLANNING can transition to: ACTIVE
   * - ACTIVE can transition to: ON_HOLD, COMPLETED
   * - ON_HOLD can transition to: ACTIVE (resume)
   * - COMPLETED can transition to: ARCHIVED
   * - ARCHIVED is terminal (no transitions allowed)
   */
  private readonly transitions: Record<ProjectStatus, ProjectStatus[]> = {
    PLANNING: ['ACTIVE'],
    ACTIVE: ['ON_HOLD', 'COMPLETED'],
    ON_HOLD: ['ACTIVE'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: [],
  };

  /**
   * Validates if a status transition is allowed
   * 
   * @param from - Current project status
   * @param to - Desired new status
   * @throws ForbiddenException if transition is not allowed
   */
  validateTransition(from: ProjectStatus, to: ProjectStatus): void {
    // No transition needed
    if (from === to) {
      return;
    }

    const allowed = this.transitions[from] || [];
    
    if (!allowed.includes(to)) {
      const allowedStr = allowed.length > 0 
        ? allowed.join(', ') 
        : 'none (terminal state)';
      
      throw new ForbiddenException(
        `Invalid project status transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: ${allowedStr}. ` +
        `Follow the workflow: PLANNING → ACTIVE → (ON_HOLD ↔ ACTIVE) → COMPLETED → ARCHIVED`
      );
    }
  }

  /**
   * Gets all allowed transitions from a given status
   * 
   * @param from - Current project status
   * @returns Array of allowed next statuses
   */
  getAllowedTransitions(from: ProjectStatus): ProjectStatus[] {
    return this.transitions[from] || [];
  }

  /**
   * Checks if a status is terminal (no further transitions allowed)
   * 
   * @param status - Project status to check
   * @returns True if status is terminal
   */
  isTerminalStatus(status: ProjectStatus): boolean {
    return this.transitions[status]?.length === 0;
  }
}
