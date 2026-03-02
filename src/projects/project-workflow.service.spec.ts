import { Test, TestingModule } from '@nestjs/testing';
import { ProjectWorkflowService } from './project-workflow.service';
import { ForbiddenException } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';

/**
 * Unit tests for Project Status Workflow
 * 
 * Tests Requirements 27.1, 27.2, 27.3
 * - Valid transitions (PLANNING → ACTIVE, ACTIVE → ON_HOLD, etc.)
 * - Invalid transitions (PLANNING → COMPLETED, ARCHIVED → any)
 * - Business rule: cannot complete project with open tasks (tested in projects.service.spec.ts)
 */
describe('ProjectWorkflowService', () => {
  let service: ProjectWorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectWorkflowService],
    }).compile();

    service = module.get<ProjectWorkflowService>(ProjectWorkflowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Valid Transitions', () => {
    describe('From PLANNING', () => {
      it('should allow transition from PLANNING to ACTIVE', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.ACTIVE);
        }).not.toThrow();
      });

      it('should allow no transition (PLANNING to PLANNING)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.PLANNING);
        }).not.toThrow();
      });
    });

    describe('From ACTIVE', () => {
      it('should allow transition from ACTIVE to ON_HOLD', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD);
        }).not.toThrow();
      });

      it('should allow transition from ACTIVE to COMPLETED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ACTIVE, ProjectStatus.COMPLETED);
        }).not.toThrow();
      });

      it('should allow no transition (ACTIVE to ACTIVE)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ACTIVE, ProjectStatus.ACTIVE);
        }).not.toThrow();
      });
    });

    describe('From ON_HOLD', () => {
      it('should allow transition from ON_HOLD to ACTIVE (resume)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ON_HOLD, ProjectStatus.ACTIVE);
        }).not.toThrow();
      });

      it('should allow no transition (ON_HOLD to ON_HOLD)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ON_HOLD, ProjectStatus.ON_HOLD);
        }).not.toThrow();
      });
    });

    describe('From COMPLETED', () => {
      it('should allow transition from COMPLETED to ARCHIVED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED);
        }).not.toThrow();
      });

      it('should allow no transition (COMPLETED to COMPLETED)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.COMPLETED, ProjectStatus.COMPLETED);
        }).not.toThrow();
      });
    });

    describe('From ARCHIVED', () => {
      it('should allow no transition (ARCHIVED to ARCHIVED)', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.ARCHIVED);
        }).not.toThrow();
      });
    });
  });

  describe('Invalid Transitions', () => {
    describe('From PLANNING', () => {
      it('should prevent transition from PLANNING to ON_HOLD', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.ON_HOLD);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from PLANNING to COMPLETED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.COMPLETED);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from PLANNING to ARCHIVED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.ARCHIVED);
        }).toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException with descriptive message', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.PLANNING, ProjectStatus.COMPLETED);
        }).toThrow(
          'Invalid project status transition: PLANNING → COMPLETED. ' +
          'Allowed transitions from PLANNING: ACTIVE. ' +
          'Follow the workflow: PLANNING → ACTIVE → (ON_HOLD ↔ ACTIVE) → COMPLETED → ARCHIVED'
        );
      });
    });

    describe('From ACTIVE', () => {
      it('should prevent transition from ACTIVE to PLANNING', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ACTIVE, ProjectStatus.PLANNING);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ACTIVE to ARCHIVED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED);
        }).toThrow(ForbiddenException);
      });
    });

    describe('From ON_HOLD', () => {
      it('should prevent transition from ON_HOLD to PLANNING', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ON_HOLD, ProjectStatus.PLANNING);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ON_HOLD to COMPLETED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ON_HOLD to ARCHIVED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ON_HOLD, ProjectStatus.ARCHIVED);
        }).toThrow(ForbiddenException);
      });
    });

    describe('From COMPLETED', () => {
      it('should prevent transition from COMPLETED to PLANNING', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.COMPLETED, ProjectStatus.PLANNING);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from COMPLETED to ACTIVE', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.COMPLETED, ProjectStatus.ACTIVE);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from COMPLETED to ON_HOLD', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.COMPLETED, ProjectStatus.ON_HOLD);
        }).toThrow(ForbiddenException);
      });
    });

    describe('From ARCHIVED (Terminal State)', () => {
      it('should prevent transition from ARCHIVED to PLANNING', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.PLANNING);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ARCHIVED to ACTIVE', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.ACTIVE);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ARCHIVED to ON_HOLD', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.ON_HOLD);
        }).toThrow(ForbiddenException);
      });

      it('should prevent transition from ARCHIVED to COMPLETED', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.COMPLETED);
        }).toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException with terminal state message', () => {
        expect(() => {
          service.validateTransition(ProjectStatus.ARCHIVED, ProjectStatus.ACTIVE);
        }).toThrow(
          'Invalid project status transition: ARCHIVED → ACTIVE. ' +
          'Allowed transitions from ARCHIVED: none (terminal state). ' +
          'Follow the workflow: PLANNING → ACTIVE → (ON_HOLD ↔ ACTIVE) → COMPLETED → ARCHIVED'
        );
      });
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return [ACTIVE] for PLANNING', () => {
      const allowed = service.getAllowedTransitions(ProjectStatus.PLANNING);
      expect(allowed).toEqual([ProjectStatus.ACTIVE]);
    });

    it('should return [ON_HOLD, COMPLETED] for ACTIVE', () => {
      const allowed = service.getAllowedTransitions(ProjectStatus.ACTIVE);
      expect(allowed).toEqual([ProjectStatus.ON_HOLD, ProjectStatus.COMPLETED]);
    });

    it('should return [ACTIVE] for ON_HOLD', () => {
      const allowed = service.getAllowedTransitions(ProjectStatus.ON_HOLD);
      expect(allowed).toEqual([ProjectStatus.ACTIVE]);
    });

    it('should return [ARCHIVED] for COMPLETED', () => {
      const allowed = service.getAllowedTransitions(ProjectStatus.COMPLETED);
      expect(allowed).toEqual([ProjectStatus.ARCHIVED]);
    });

    it('should return [] for ARCHIVED (terminal state)', () => {
      const allowed = service.getAllowedTransitions(ProjectStatus.ARCHIVED);
      expect(allowed).toEqual([]);
    });
  });

  describe('isTerminalStatus', () => {
    it('should return false for PLANNING', () => {
      expect(service.isTerminalStatus(ProjectStatus.PLANNING)).toBe(false);
    });

    it('should return false for ACTIVE', () => {
      expect(service.isTerminalStatus(ProjectStatus.ACTIVE)).toBe(false);
    });

    it('should return false for ON_HOLD', () => {
      expect(service.isTerminalStatus(ProjectStatus.ON_HOLD)).toBe(false);
    });

    it('should return false for COMPLETED', () => {
      expect(service.isTerminalStatus(ProjectStatus.COMPLETED)).toBe(false);
    });

    it('should return true for ARCHIVED', () => {
      expect(service.isTerminalStatus(ProjectStatus.ARCHIVED)).toBe(true);
    });
  });
});
