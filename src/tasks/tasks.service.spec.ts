import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;

  const mockPrismaService = {
    task: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    taskStatusHistory: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prisma = module.get<PrismaService>(PrismaService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Task Status Transitions - EMPLOYEE Role', () => {
    const employeeUser = { id: 'employee-1', role: 'EMPLOYEE' };
    const mockTask = {
      id: 'task-1',
      title: 'Test Task',
      status: TaskStatus.TODO,
      assignedToId: 'employee-1',
      projectId: 'project-1',
      project: {
        id: 'project-1',
        leadId: 'lead-1',
        members: [{ userId: 'employee-1' }],
      },
    };

    beforeEach(() => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue({ ...mockTask });
      mockPrismaService.taskStatusHistory.create.mockResolvedValue({});
    });

    describe('Allowed Transitions', () => {
      it('should allow EMPLOYEE to transition from TODO to IN_PROGRESS', async () => {
        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, employeeUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.TODO,
            newStatus: TaskStatus.IN_PROGRESS,
            changedById: 'employee-1',
          },
        });
      });

      it('should allow EMPLOYEE to transition from IN_PROGRESS to REVIEW', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.REVIEW }, employeeUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.IN_PROGRESS,
            newStatus: TaskStatus.REVIEW,
            changedById: 'employee-1',
          },
        });
      });

      it('should allow EMPLOYEE to transition from REVIEW to IN_PROGRESS', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, employeeUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.REVIEW,
            newStatus: TaskStatus.IN_PROGRESS,
            changedById: 'employee-1',
          },
        });
      });
    });

    describe('Forbidden Transitions', () => {
      it('should prevent EMPLOYEE from transitioning to COMPLETED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.COMPLETED }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from transitioning to CANCELLED', async () => {
        await expect(
          service.update('task-1', { status: TaskStatus.CANCELLED }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from transitioning from TODO to REVIEW', async () => {
        await expect(
          service.update('task-1', { status: TaskStatus.REVIEW }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from transitioning from TODO to COMPLETED', async () => {
        await expect(
          service.update('task-1', { status: TaskStatus.COMPLETED }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from transitioning from IN_PROGRESS to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.CANCELLED }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from modifying COMPLETED tasks', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.COMPLETED,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.IN_PROGRESS }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent EMPLOYEE from modifying CANCELLED tasks', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.CANCELLED,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.TODO }, employeeUser)
        ).rejects.toThrow(ForbiddenException);
      });
    });

    it('should prevent EMPLOYEE from updating tasks not assigned to them', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue({
        ...mockTask,
        assignedToId: 'other-employee',
      });

      await expect(
        service.update('task-1', { status: TaskStatus.IN_PROGRESS }, employeeUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Task Status Transitions - TEAM_LEAD Role', () => {
    const teamLeadUser = { id: 'lead-1', role: 'TEAM_LEAD' };
    const mockTask = {
      id: 'task-1',
      title: 'Test Task',
      status: TaskStatus.TODO,
      assignedToId: 'employee-1',
      projectId: 'project-1',
      project: {
        id: 'project-1',
        leadId: 'lead-1',
        members: [{ userId: 'lead-1' }, { userId: 'employee-1' }],
      },
    };

    beforeEach(() => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue({ ...mockTask });
      mockPrismaService.taskStatusHistory.create.mockResolvedValue({});
    });

    describe('Allowed Transitions', () => {
      it('should allow TEAM_LEAD to transition from TODO to IN_PROGRESS', async () => {
        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to transition from TODO to CANCELLED', async () => {
        await service.update('task-1', { status: TaskStatus.CANCELLED }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.TODO,
            newStatus: TaskStatus.CANCELLED,
            changedById: 'lead-1',
          },
        });
      });

      it('should allow TEAM_LEAD to transition from IN_PROGRESS to REVIEW', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.REVIEW }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to transition from IN_PROGRESS to TODO', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.TODO }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to transition from IN_PROGRESS to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.CANCELLED }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to transition from REVIEW to COMPLETED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.COMPLETED }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.REVIEW,
            newStatus: TaskStatus.COMPLETED,
            changedById: 'lead-1',
          },
        });
      });

      it('should allow TEAM_LEAD to transition from REVIEW to IN_PROGRESS', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to transition from REVIEW to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.CANCELLED }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow TEAM_LEAD to reopen COMPLETED tasks (transition to IN_PROGRESS)', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.COMPLETED,
        });

        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, teamLeadUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalledWith({
          data: {
            taskId: 'task-1',
            oldStatus: TaskStatus.COMPLETED,
            newStatus: TaskStatus.IN_PROGRESS,
            changedById: 'lead-1',
          },
        });
      });
    });

    describe('Forbidden Transitions', () => {
      it('should prevent TEAM_LEAD from transitioning from CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.CANCELLED,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.TODO }, teamLeadUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent TEAM_LEAD from transitioning from TODO to COMPLETED', async () => {
        await expect(
          service.update('task-1', { status: TaskStatus.COMPLETED }, teamLeadUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent TEAM_LEAD from transitioning from COMPLETED to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.COMPLETED,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.CANCELLED }, teamLeadUser)
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Task Status Transitions - ADMIN Role', () => {
    const adminUser = { id: 'admin-1', role: 'ADMIN' };
    const mockTask = {
      id: 'task-1',
      title: 'Test Task',
      status: TaskStatus.TODO,
      assignedToId: 'employee-1',
      projectId: 'project-1',
      project: {
        id: 'project-1',
        leadId: 'lead-1',
        members: [{ userId: 'employee-1' }],
      },
    };

    beforeEach(() => {
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.update.mockResolvedValue({ ...mockTask });
      mockPrismaService.taskStatusHistory.create.mockResolvedValue({});
    });

    describe('Allowed Transitions', () => {
      it('should allow ADMIN to transition from TODO to IN_PROGRESS', async () => {
        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from TODO to CANCELLED', async () => {
        await service.update('task-1', { status: TaskStatus.CANCELLED }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from IN_PROGRESS to REVIEW', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.REVIEW }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from IN_PROGRESS to TODO', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.TODO }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from IN_PROGRESS to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.IN_PROGRESS,
        });

        await service.update('task-1', { status: TaskStatus.CANCELLED }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from REVIEW to COMPLETED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.COMPLETED }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from REVIEW to IN_PROGRESS', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to transition from REVIEW to CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.REVIEW,
        });

        await service.update('task-1', { status: TaskStatus.CANCELLED }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });

      it('should allow ADMIN to reopen COMPLETED tasks (transition to IN_PROGRESS)', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.COMPLETED,
        });

        await service.update('task-1', { status: TaskStatus.IN_PROGRESS }, adminUser);

        expect(mockPrismaService.taskStatusHistory.create).toHaveBeenCalled();
      });
    });

    describe('Forbidden Transitions', () => {
      it('should prevent ADMIN from transitioning from CANCELLED', async () => {
        mockPrismaService.task.findUnique.mockResolvedValue({
          ...mockTask,
          status: TaskStatus.CANCELLED,
        });

        await expect(
          service.update('task-1', { status: TaskStatus.TODO }, adminUser)
        ).rejects.toThrow(ForbiddenException);
      });

      it('should prevent ADMIN from transitioning from TODO to COMPLETED', async () => {
        await expect(
          service.update('task-1', { status: TaskStatus.COMPLETED }, adminUser)
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
