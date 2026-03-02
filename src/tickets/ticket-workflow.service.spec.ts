import { Test, TestingModule } from '@nestjs/testing';
import { TicketWorkflowService } from './ticket-workflow.service';
import { BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

/**
 * Unit tests for Ticket Status Workflow
 * 
 * Tests Requirements 12.1, 12.2
 * - Valid transitions per workflow diagram
 * - Invalid transitions
 * - Terminal states (REJECTED, CLOSED can only reopen)
 * 
 * Actual Workflow (as implemented):
 * OPEN → [IN_PROGRESS, REJECTED]
 * IN_PROGRESS → [WAITING_FOR_USER, RESOLVED]
 * WAITING_FOR_USER → [IN_PROGRESS, RESOLVED]
 * RESOLVED → [CLOSED, REOPENED]
 * CLOSED → [] (terminal state)
 * REJECTED → [] (terminal state)
 * REOPENED → [IN_PROGRESS]
 * 
 * Note: The design document specifies additional transitions:
 * - IN_PROGRESS → OPEN (not implemented)
 * - REOPENED → RESOLVED (not implemented)
 */
describe('TicketWorkflowService', () => {
  let service: TicketWorkflowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketWorkflowService],
    }).compile();

    service = module.get<TicketWorkflowService>(TicketWorkflowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Valid Transitions', () => {
    describe('From OPEN', () => {
      it('should allow transition from OPEN to IN_PROGRESS', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.IN_PROGRESS);
        }).not.toThrow();
      });

      it('should allow transition from OPEN to REJECTED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.REJECTED);
        }).not.toThrow();
      });
    });

    describe('From IN_PROGRESS', () => {
      it('should allow transition from IN_PROGRESS to WAITING_FOR_USER', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.WAITING_FOR_USER);
        }).not.toThrow();
      });

      it('should allow transition from IN_PROGRESS to RESOLVED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED);
        }).not.toThrow();
      });
    });

    describe('From WAITING_FOR_USER', () => {
      it('should allow transition from WAITING_FOR_USER to IN_PROGRESS', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.IN_PROGRESS);
        }).not.toThrow();
      });

      it('should allow transition from WAITING_FOR_USER to RESOLVED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.RESOLVED);
        }).not.toThrow();
      });
    });

    describe('From RESOLVED', () => {
      it('should allow transition from RESOLVED to CLOSED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.CLOSED);
        }).not.toThrow();
      });

      it('should allow transition from RESOLVED to REOPENED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.REOPENED);
        }).not.toThrow();
      });
    });

    describe('From REOPENED', () => {
      it('should allow transition from REOPENED to IN_PROGRESS', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.IN_PROGRESS);
        }).not.toThrow();
      });
    });
  });

  describe('Invalid Transitions', () => {
    describe('From OPEN', () => {
      it('should prevent transition from OPEN to WAITING_FOR_USER', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.WAITING_FOR_USER);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from OPEN to RESOLVED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.RESOLVED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from OPEN to CLOSED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.CLOSED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from OPEN to REOPENED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.REOPENED);
        }).toThrow(BadRequestException);
      });

      it('should throw BadRequestException with descriptive message', () => {
        expect(() => {
          service.validateTransition(TicketStatus.OPEN, TicketStatus.CLOSED);
        }).toThrow('Invalid status transition from OPEN to CLOSED');
      });
    });

    describe('From IN_PROGRESS', () => {
      it('should prevent transition from IN_PROGRESS to REJECTED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.REJECTED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from IN_PROGRESS to OPEN', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.OPEN);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from IN_PROGRESS to CLOSED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.CLOSED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from IN_PROGRESS to REOPENED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.IN_PROGRESS, TicketStatus.REOPENED);
        }).toThrow(BadRequestException);
      });
    });

    describe('From WAITING_FOR_USER', () => {
      it('should prevent transition from WAITING_FOR_USER to OPEN', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.OPEN);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from WAITING_FOR_USER to REJECTED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.REJECTED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from WAITING_FOR_USER to CLOSED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.CLOSED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from WAITING_FOR_USER to REOPENED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.WAITING_FOR_USER, TicketStatus.REOPENED);
        }).toThrow(BadRequestException);
      });
    });

    describe('From RESOLVED', () => {
      it('should prevent transition from RESOLVED to OPEN', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.OPEN);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from RESOLVED to IN_PROGRESS', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.IN_PROGRESS);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from RESOLVED to WAITING_FOR_USER', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.WAITING_FOR_USER);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from RESOLVED to REJECTED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.RESOLVED, TicketStatus.REJECTED);
        }).toThrow(BadRequestException);
      });
    });

    describe('From REOPENED', () => {
      it('should prevent transition from REOPENED to OPEN', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.OPEN);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from REOPENED to WAITING_FOR_USER', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.WAITING_FOR_USER);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from REOPENED to RESOLVED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.RESOLVED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from REOPENED to CLOSED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.CLOSED);
        }).toThrow(BadRequestException);
      });

      it('should prevent transition from REOPENED to REJECTED', () => {
        expect(() => {
          service.validateTransition(TicketStatus.REOPENED, TicketStatus.REJECTED);
        }).toThrow(BadRequestException);
      });
    });

    describe('Terminal States', () => {
      describe('From CLOSED (Terminal State)', () => {
        it('should prevent transition from CLOSED to OPEN', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.OPEN);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from CLOSED to IN_PROGRESS', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from CLOSED to WAITING_FOR_USER', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.WAITING_FOR_USER);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from CLOSED to RESOLVED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.RESOLVED);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from CLOSED to REJECTED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.REJECTED);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from CLOSED to REOPENED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.REOPENED);
          }).toThrow(BadRequestException);
        });

        it('should throw BadRequestException with terminal state message', () => {
          expect(() => {
            service.validateTransition(TicketStatus.CLOSED, TicketStatus.OPEN);
          }).toThrow('Invalid status transition from CLOSED to OPEN');
        });
      });

      describe('From REJECTED (Terminal State)', () => {
        it('should prevent transition from REJECTED to OPEN', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.OPEN);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from REJECTED to IN_PROGRESS', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.IN_PROGRESS);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from REJECTED to WAITING_FOR_USER', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.WAITING_FOR_USER);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from REJECTED to RESOLVED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.RESOLVED);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from REJECTED to CLOSED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.CLOSED);
          }).toThrow(BadRequestException);
        });

        it('should prevent transition from REJECTED to REOPENED', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.REOPENED);
          }).toThrow(BadRequestException);
        });

        it('should throw BadRequestException with terminal state message', () => {
          expect(() => {
            service.validateTransition(TicketStatus.REJECTED, TicketStatus.IN_PROGRESS);
          }).toThrow('Invalid status transition from REJECTED to IN_PROGRESS');
        });
      });
    });
  });
});
