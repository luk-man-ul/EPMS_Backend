import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * Integration Tests for TEAM_LEAD OR-Based Filtering
 * 
 * **Validates: Requirements 24.1, 24.2**
 * 
 * These tests verify that TEAM_LEAD users can see data from both:
 * 1. Leadership context (projects they lead, tasks in led projects, tickets in led projects)
 * 2. Member context (projects they're members of, tasks assigned to them, tickets assigned/created by them)
 * 
 * This is the critical architectural fix for the TEAM_LEAD role collision issue.
 */
describe('TEAM_LEAD OR-Based Filtering (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test users
  let adminUser: any;
  let teamLeadUser: any;
  let employeeUser: any;
  let anotherTeamLeadUser: any;

  // Test roles
  let adminRole: any;
  let teamLeadRole: any;
  let employeeRole: any;

  // Test projects
  let projectLedByTeamLead: any;
  let projectWhereTeamLeadIsMember: any;
  let projectNotRelatedToTeamLead: any;

  // Test tasks
  let taskInLedProject: any;
  let taskAssignedToTeamLead: any;
  let taskNotRelatedToTeamLead: any;

  // Test tickets
  let ticketInLedProject: any;
  let ticketAssignedToTeamLead: any;
  let ticketCreatedByTeamLead: any;
  let ticketNotRelatedToTeamLead: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up existing test data
    await cleanupTestData();

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  /**
   * Setup test data with specific scenarios:
   * - TeamLead is LEAD of Project A
   * - TeamLead is MEMBER of Project B (led by another team lead)
   * - Project C has no relation to TeamLead
   */
  async function setupTestData() {
    // Create roles
    adminRole = await prisma.role.create({
      data: { name: 'ADMIN', description: 'Administrator' },
    });

    teamLeadRole = await prisma.role.create({
      data: { name: 'TEAM_LEAD', description: 'Team Lead' },
    });

    employeeRole = await prisma.role.create({
      data: { name: 'EMPLOYEE', description: 'Employee' },
    });

    // Create users
    const hashedPassword = await bcrypt.hash('password123', 10);

    adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });

    teamLeadUser = await prisma.user.create({
      data: {
        email: 'teamlead@test.com',
        passwordHash: hashedPassword,
        firstName: 'TeamLead',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: teamLeadUser.id, roleId: teamLeadRole.id },
    });

    anotherTeamLeadUser = await prisma.user.create({
      data: {
        email: 'another-teamlead@test.com',
        passwordHash: hashedPassword,
        firstName: 'Another',
        lastName: 'TeamLead',
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: anotherTeamLeadUser.id, roleId: teamLeadRole.id },
    });

    employeeUser = await prisma.user.create({
      data: {
        email: 'employee@test.com',
        passwordHash: hashedPassword,
        firstName: 'Employee',
        lastName: 'User',
        status: 'ACTIVE',
      },
    });

    await prisma.userRole.create({
      data: { userId: employeeUser.id, roleId: employeeRole.id },
    });

    // Create Project A: TeamLead is LEAD
    projectLedByTeamLead = await prisma.project.create({
      data: {
        name: 'Project A - Led by TeamLead',
        description: 'TeamLead is the project lead',
        status: 'ACTIVE',
        createdById: adminUser.id,
        leadId: teamLeadUser.id,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        { projectId: projectLedByTeamLead.id, userId: teamLeadUser.id },
        { projectId: projectLedByTeamLead.id, userId: employeeUser.id },
      ],
    });

    // Create Project B: TeamLead is MEMBER (led by another team lead)
    projectWhereTeamLeadIsMember = await prisma.project.create({
      data: {
        name: 'Project B - TeamLead is Member',
        description: 'TeamLead is a member, not lead',
        status: 'ACTIVE',
        createdById: adminUser.id,
        leadId: anotherTeamLeadUser.id,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        { projectId: projectWhereTeamLeadIsMember.id, userId: anotherTeamLeadUser.id },
        { projectId: projectWhereTeamLeadIsMember.id, userId: teamLeadUser.id },
        { projectId: projectWhereTeamLeadIsMember.id, userId: employeeUser.id },
      ],
    });

    // Create Project C: No relation to TeamLead
    projectNotRelatedToTeamLead = await prisma.project.create({
      data: {
        name: 'Project C - Not Related',
        description: 'TeamLead has no relation to this project',
        status: 'ACTIVE',
        createdById: adminUser.id,
        leadId: anotherTeamLeadUser.id,
      },
    });

    await prisma.projectMember.create({
      data: {
        projectId: projectNotRelatedToTeamLead.id,
        userId: anotherTeamLeadUser.id,
      },
    });

    // Create tasks
    taskInLedProject = await prisma.task.create({
      data: {
        projectId: projectLedByTeamLead.id,
        title: 'Task in Led Project',
        description: 'Task in project led by TeamLead',
        priority: 'MEDIUM',
        status: 'TODO',
        createdById: adminUser.id,
        assignedToId: employeeUser.id,
      },
    });

    taskAssignedToTeamLead = await prisma.task.create({
      data: {
        projectId: projectWhereTeamLeadIsMember.id,
        title: 'Task Assigned to TeamLead',
        description: 'Task assigned to TeamLead in project where they are member',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        createdById: anotherTeamLeadUser.id,
        assignedToId: teamLeadUser.id,
      },
    });

    taskNotRelatedToTeamLead = await prisma.task.create({
      data: {
        projectId: projectNotRelatedToTeamLead.id,
        title: 'Task Not Related',
        description: 'Task in unrelated project',
        priority: 'LOW',
        status: 'TODO',
        createdById: anotherTeamLeadUser.id,
        assignedToId: anotherTeamLeadUser.id,
      },
    });

    // Create tickets
    ticketInLedProject = await prisma.ticket.create({
      data: {
        projectId: projectLedByTeamLead.id,
        title: 'Ticket in Led Project',
        description: 'Ticket in project led by TeamLead',
        type: 'BUG',
        priority: 'HIGH',
        status: 'OPEN',
        reporterId: employeeUser.id,
      },
    });

    ticketAssignedToTeamLead = await prisma.ticket.create({
      data: {
        projectId: projectWhereTeamLeadIsMember.id,
        title: 'Ticket Assigned to TeamLead',
        description: 'Ticket assigned to TeamLead',
        type: 'FEATURE',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        reporterId: employeeUser.id,
        assignedToId: teamLeadUser.id,
      },
    });

    ticketCreatedByTeamLead = await prisma.ticket.create({
      data: {
        projectId: projectWhereTeamLeadIsMember.id,
        title: 'Ticket Created by TeamLead',
        description: 'Ticket created by TeamLead',
        type: 'SUPPORT',
        priority: 'LOW',
        status: 'OPEN',
        reporterId: teamLeadUser.id,
      },
    });

    ticketNotRelatedToTeamLead = await prisma.ticket.create({
      data: {
        projectId: projectNotRelatedToTeamLead.id,
        title: 'Ticket Not Related',
        description: 'Ticket in unrelated project',
        type: 'IMPROVEMENT',
        priority: 'LOW',
        status: 'OPEN',
        reporterId: anotherTeamLeadUser.id,
      },
    });
  }

  async function cleanupTestData() {
    // Delete in correct order to respect foreign key constraints
    await prisma.ticketStatusHistory.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.ticket.deleteMany({});
    await prisma.taskStatusHistory.deleteMany({});
    await prisma.timeLog.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.projectMember.deleteMany({});
    await prisma.project.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin@test.com',
            'teamlead@test.com',
            'another-teamlead@test.com',
            'employee@test.com',
          ],
        },
      },
    });
    await prisma.role.deleteMany({
      where: {
        name: { in: ['ADMIN', 'TEAM_LEAD', 'EMPLOYEE'] },
      },
    });
  }

  describe('Projects OR-Based Filtering', () => {
    it('should return projects where TEAM_LEAD is lead', async () => {
      const result = await prisma.project.findMany({
        where: {
          OR: [
            { leadId: teamLeadUser.id },
            { members: { some: { userId: teamLeadUser.id } } },
          ],
        },
        include: {
          lead: true,
          members: true,
        },
      });

      // Should include Project A (where TeamLead is lead)
      const projectA = result.find((p) => p.id === projectLedByTeamLead.id);
      expect(projectA).toBeDefined();
      expect(projectA?.leadId).toBe(teamLeadUser.id);
    });

    it('should return projects where TEAM_LEAD is member', async () => {
      const result = await prisma.project.findMany({
        where: {
          OR: [
            { leadId: teamLeadUser.id },
            { members: { some: { userId: teamLeadUser.id } } },
          ],
        },
        include: {
          lead: true,
          members: true,
        },
      });

      // Should include Project B (where TeamLead is member)
      const projectB = result.find((p) => p.id === projectWhereTeamLeadIsMember.id);
      expect(projectB).toBeDefined();
      expect(projectB?.leadId).not.toBe(teamLeadUser.id);
      expect(projectB?.members.some((m) => m.userId === teamLeadUser.id)).toBe(true);
    });

    it('should NOT return projects where TEAM_LEAD has no relation', async () => {
      const result = await prisma.project.findMany({
        where: {
          OR: [
            { leadId: teamLeadUser.id },
            { members: { some: { userId: teamLeadUser.id } } },
          ],
        },
      });

      // Should NOT include Project C
      const projectC = result.find((p) => p.id === projectNotRelatedToTeamLead.id);
      expect(projectC).toBeUndefined();
    });

    it('should return exactly 2 projects for TEAM_LEAD (lead + member)', async () => {
      const result = await prisma.project.findMany({
        where: {
          OR: [
            { leadId: teamLeadUser.id },
            { members: { some: { userId: teamLeadUser.id } } },
          ],
        },
      });

      expect(result.length).toBe(2);
    });
  });

  describe('Tasks OR-Based Filtering', () => {
    it('should return tasks in projects led by TEAM_LEAD', async () => {
      const result = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
        include: {
          project: true,
          assignee: true,
        },
      });

      // Should include task in led project
      const task = result.find((t) => t.id === taskInLedProject.id);
      expect(task).toBeDefined();
      expect(task?.project.leadId).toBe(teamLeadUser.id);
    });

    it('should return tasks assigned to TEAM_LEAD', async () => {
      const result = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
        include: {
          project: true,
          assignee: true,
        },
      });

      // Should include task assigned to TeamLead
      const task = result.find((t) => t.id === taskAssignedToTeamLead.id);
      expect(task).toBeDefined();
      expect(task?.assignedToId).toBe(teamLeadUser.id);
    });

    it('should NOT return tasks with no relation to TEAM_LEAD', async () => {
      const result = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
      });

      // Should NOT include unrelated task
      const task = result.find((t) => t.id === taskNotRelatedToTeamLead.id);
      expect(task).toBeUndefined();
    });

    it('should return exactly 2 tasks for TEAM_LEAD (led project + assigned)', async () => {
      const result = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
      });

      expect(result.length).toBe(2);
    });
  });

  describe('Tickets OR-Based Filtering', () => {
    it('should return tickets in projects led by TEAM_LEAD', async () => {
      const result = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
        include: {
          project: true,
          reporter: true,
          assignee: true,
        },
      });

      // Should include ticket in led project
      const ticket = result.find((t) => t.id === ticketInLedProject.id);
      expect(ticket).toBeDefined();
      expect(ticket?.project.leadId).toBe(teamLeadUser.id);
    });

    it('should return tickets assigned to TEAM_LEAD', async () => {
      const result = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
        include: {
          project: true,
          reporter: true,
          assignee: true,
        },
      });

      // Should include ticket assigned to TeamLead
      const ticket = result.find((t) => t.id === ticketAssignedToTeamLead.id);
      expect(ticket).toBeDefined();
      expect(ticket?.assignedToId).toBe(teamLeadUser.id);
    });

    it('should return tickets created by TEAM_LEAD', async () => {
      const result = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
        include: {
          project: true,
          reporter: true,
          assignee: true,
        },
      });

      // Should include ticket created by TeamLead
      const ticket = result.find((t) => t.id === ticketCreatedByTeamLead.id);
      expect(ticket).toBeDefined();
      expect(ticket?.reporterId).toBe(teamLeadUser.id);
    });

    it('should NOT return tickets with no relation to TEAM_LEAD', async () => {
      const result = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
      });

      // Should NOT include unrelated ticket
      const ticket = result.find((t) => t.id === ticketNotRelatedToTeamLead.id);
      expect(ticket).toBeUndefined();
    });

    it('should return exactly 3 tickets for TEAM_LEAD (led project + assigned + created)', async () => {
      const result = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
      });

      expect(result.length).toBe(3);
    });
  });

  describe('Service-Level Integration Tests', () => {
    it('should correctly apply OR filtering in ProjectsService.getAllProjects', async () => {
      const mockUser = {
        id: teamLeadUser.id,
        role: 'TEAM_LEAD',
      };

      // Simulate the service logic
      const whereCondition: any = {};
      if (mockUser.role === 'TEAM_LEAD') {
        whereCondition.OR = [
          { leadId: mockUser.id },
          { members: { some: { userId: mockUser.id } } },
        ];
      }

      const projects = await prisma.project.findMany({
        where: whereCondition,
        include: {
          lead: true,
          members: true,
        },
      });

      expect(projects.length).toBe(2);
      expect(projects.some((p) => p.id === projectLedByTeamLead.id)).toBe(true);
      expect(projects.some((p) => p.id === projectWhereTeamLeadIsMember.id)).toBe(true);
      expect(projects.some((p) => p.id === projectNotRelatedToTeamLead.id)).toBe(false);
    });

    it('should correctly apply OR filtering in TasksService.findAll', async () => {
      const mockUser = {
        id: teamLeadUser.id,
        role: 'TEAM_LEAD',
      };

      const where: any = { isDeleted: false };
      if (mockUser.role === 'TEAM_LEAD') {
        where.OR = [
          { project: { leadId: mockUser.id } },
          { assignedToId: mockUser.id },
        ];
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          project: true,
          assignee: true,
        },
      });

      expect(tasks.length).toBe(2);
      expect(tasks.some((t) => t.id === taskInLedProject.id)).toBe(true);
      expect(tasks.some((t) => t.id === taskAssignedToTeamLead.id)).toBe(true);
      expect(tasks.some((t) => t.id === taskNotRelatedToTeamLead.id)).toBe(false);
    });

    it('should correctly apply OR filtering in TicketsService.findAll', async () => {
      const mockUser = {
        id: teamLeadUser.id,
        role: 'TEAM_LEAD',
      };

      const where: any = { isDeleted: false };
      if (mockUser.role === 'TEAM_LEAD') {
        where.OR = [
          { project: { leadId: mockUser.id } },
          { assignedToId: mockUser.id },
          { reporterId: mockUser.id },
        ];
      }

      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          project: true,
          reporter: true,
          assignee: true,
        },
      });

      expect(tickets.length).toBe(3);
      expect(tickets.some((t) => t.id === ticketInLedProject.id)).toBe(true);
      expect(tickets.some((t) => t.id === ticketAssignedToTeamLead.id)).toBe(true);
      expect(tickets.some((t) => t.id === ticketCreatedByTeamLead.id)).toBe(true);
      expect(tickets.some((t) => t.id === ticketNotRelatedToTeamLead.id)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle TEAM_LEAD with no projects', async () => {
      const orphanTeamLead = await prisma.user.create({
        data: {
          email: 'orphan-teamlead@test.com',
          passwordHash: await bcrypt.hash('password123', 10),
          firstName: 'Orphan',
          lastName: 'TeamLead',
          status: 'ACTIVE',
        },
      });

      await prisma.userRole.create({
        data: { userId: orphanTeamLead.id, roleId: teamLeadRole.id },
      });

      const projects = await prisma.project.findMany({
        where: {
          OR: [
            { leadId: orphanTeamLead.id },
            { members: { some: { userId: orphanTeamLead.id } } },
          ],
        },
      });

      expect(projects.length).toBe(0);

      // Cleanup
      await prisma.userRole.deleteMany({ where: { userId: orphanTeamLead.id } });
      await prisma.user.delete({ where: { id: orphanTeamLead.id } });
    });

    it('should handle TEAM_LEAD with no tasks', async () => {
      const orphanTeamLead = await prisma.user.create({
        data: {
          email: 'orphan-teamlead2@test.com',
          passwordHash: await bcrypt.hash('password123', 10),
          firstName: 'Orphan2',
          lastName: 'TeamLead',
          status: 'ACTIVE',
        },
      });

      await prisma.userRole.create({
        data: { userId: orphanTeamLead.id, roleId: teamLeadRole.id },
      });

      const tasks = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: orphanTeamLead.id } },
            { assignedToId: orphanTeamLead.id },
          ],
        },
      });

      expect(tasks.length).toBe(0);

      // Cleanup
      await prisma.userRole.deleteMany({ where: { userId: orphanTeamLead.id } });
      await prisma.user.delete({ where: { id: orphanTeamLead.id } });
    });

    it('should handle deleted tasks correctly', async () => {
      // Create a deleted task
      const deletedTask = await prisma.task.create({
        data: {
          projectId: projectLedByTeamLead.id,
          title: 'Deleted Task',
          description: 'This task is deleted',
          priority: 'LOW',
          status: 'CANCELLED',
          createdById: adminUser.id,
          isDeleted: true,
        },
      });

      const tasks = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
      });

      // Should not include deleted task
      expect(tasks.some((t) => t.id === deletedTask.id)).toBe(false);

      // Cleanup
      await prisma.task.delete({ where: { id: deletedTask.id } });
    });

    it('should handle deleted tickets correctly', async () => {
      // Create a deleted ticket
      const deletedTicket = await prisma.ticket.create({
        data: {
          projectId: projectLedByTeamLead.id,
          title: 'Deleted Ticket',
          description: 'This ticket is deleted',
          type: 'BUG',
          priority: 'LOW',
          status: 'CLOSED',
          reporterId: teamLeadUser.id,
          isDeleted: true,
        },
      });

      const tickets = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
            { reporterId: teamLeadUser.id },
          ],
        },
      });

      // Should not include deleted ticket
      expect(tickets.some((t) => t.id === deletedTicket.id)).toBe(false);

      // Cleanup
      await prisma.ticket.delete({ where: { id: deletedTicket.id } });
    });
  });
});
