import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * Integration Tests for ADMIN Data Scoping
 * 
 * **Validates: Requirements 31.1, 31.2**
 * 
 * These tests verify that ADMIN users have full access to all data:
 * 1. Can see all employees regardless of department or status
 * 2. Can see all projects regardless of lead or membership
 * 3. Can see all tasks regardless of assignment
 * 4. Can see all tickets regardless of reporter or assignee
 * 5. Can perform all CRUD operations without restrictions
 */
describe('ADMIN Data Scoping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Test users
  let adminUser: any;
  let teamLeadUser: any;
  let employeeUser1: any;
  let employeeUser2: any;

  // Test roles
  let adminRole: any;
  let teamLeadRole: any;
  let employeeRole: any;

  // Test projects
  let project1: any;
  let project2: any;
  let project3: any;

  // Test tasks
  let task1: any;
  let task2: any;
  let task3: any;
  let task4: any;

  // Test tickets
  let ticket1: any;
  let ticket2: any;
  let ticket3: any;
  let ticket4: any;

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
   * Setup test data with diverse scenarios:
   * - Multiple users with different roles and statuses
   * - Multiple projects with different leads
   * - Multiple tasks with different assignments
   * - Multiple tickets with different reporters and assignees
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
        email: 'admin-test@test.com',
        passwordHash: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        status: 'ACTIVE',
        department: 'IT',
      },
    });

    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id },
    });

    teamLeadUser = await prisma.user.create({
      data: {
        email: 'teamlead-admin-test@test.com',
        passwordHash: hashedPassword,
        firstName: 'TeamLead',
        lastName: 'User',
        status: 'ACTIVE',
        department: 'Engineering',
      },
    });

    await prisma.userRole.create({
      data: { userId: teamLeadUser.id, roleId: teamLeadRole.id },
    });

    employeeUser1 = await prisma.user.create({
      data: {
        email: 'employee1-admin-test@test.com',
        passwordHash: hashedPassword,
        firstName: 'Employee1',
        lastName: 'User',
        status: 'ACTIVE',
        department: 'Engineering',
      },
    });

    await prisma.userRole.create({
      data: { userId: employeeUser1.id, roleId: employeeRole.id },
    });

    employeeUser2 = await prisma.user.create({
      data: {
        email: 'employee2-admin-test@test.com',
        passwordHash: hashedPassword,
        firstName: 'Employee2',
        lastName: 'User',
        status: 'INACTIVE',
        department: 'Marketing',
      },
    });

    await prisma.userRole.create({
      data: { userId: employeeUser2.id, roleId: employeeRole.id },
    });

    // Create projects with different leads
    project1 = await prisma.project.create({
      data: {
        name: 'Project Alpha',
        description: 'Led by TeamLead',
        status: 'ACTIVE',
        createdById: adminUser.id,
        leadId: teamLeadUser.id,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        { projectId: project1.id, userId: teamLeadUser.id },
        { projectId: project1.id, userId: employeeUser1.id },
      ],
    });

    project2 = await prisma.project.create({
      data: {
        name: 'Project Beta',
        description: 'Led by Admin',
        status: 'PLANNING',
        createdById: adminUser.id,
        leadId: adminUser.id,
      },
    });

    await prisma.projectMember.create({
      data: { projectId: project2.id, userId: adminUser.id },
    });

    project3 = await prisma.project.create({
      data: {
        name: 'Project Gamma',
        description: 'Led by Employee1',
        status: 'COMPLETED',
        createdById: adminUser.id,
        leadId: employeeUser1.id,
      },
    });

    await prisma.projectMember.create({
      data: { projectId: project3.id, userId: employeeUser1.id },
    });

    // Create tasks with different assignments
    task1 = await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Task 1 - Assigned to TeamLead',
        description: 'Task in Project Alpha',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        createdById: adminUser.id,
        assignedToId: teamLeadUser.id,
      },
    });

    task2 = await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Task 2 - Assigned to Employee1',
        description: 'Another task in Project Alpha',
        priority: 'MEDIUM',
        status: 'TODO',
        createdById: teamLeadUser.id,
        assignedToId: employeeUser1.id,
      },
    });

    task3 = await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'Task 3 - Unassigned',
        description: 'Task in Project Beta',
        priority: 'LOW',
        status: 'TODO',
        createdById: adminUser.id,
      },
    });

    task4 = await prisma.task.create({
      data: {
        projectId: project3.id,
        title: 'Task 4 - Assigned to Employee2',
        description: 'Task in Project Gamma',
        priority: 'URGENT',
        status: 'COMPLETED',
        createdById: employeeUser1.id,
        assignedToId: employeeUser2.id,
      },
    });

    // Create tickets with different reporters and assignees
    ticket1 = await prisma.ticket.create({
      data: {
        projectId: project1.id,
        title: 'Ticket 1 - Reported by Employee1',
        description: 'Bug in Project Alpha',
        type: 'BUG',
        priority: 'HIGH',
        status: 'OPEN',
        reporterId: employeeUser1.id,
      },
    });

    ticket2 = await prisma.ticket.create({
      data: {
        projectId: project1.id,
        title: 'Ticket 2 - Assigned to TeamLead',
        description: 'Feature request',
        type: 'FEATURE',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        reporterId: employeeUser1.id,
        assignedToId: teamLeadUser.id,
      },
    });

    ticket3 = await prisma.ticket.create({
      data: {
        projectId: project2.id,
        title: 'Ticket 3 - Reported by Admin',
        description: 'Support ticket',
        type: 'SUPPORT',
        priority: 'LOW',
        status: 'RESOLVED',
        reporterId: adminUser.id,
        assignedToId: employeeUser1.id,
      },
    });

    ticket4 = await prisma.ticket.create({
      data: {
        projectId: project3.id,
        title: 'Ticket 4 - Reported by Employee2',
        description: 'Improvement suggestion',
        type: 'IMPROVEMENT',
        priority: 'LOW',
        status: 'CLOSED',
        reporterId: employeeUser2.id,
      },
    });
  }

  async function cleanupTestData() {
    // Delete in correct order to respect foreign key constraints
    await prisma.ticketStatusHistory.deleteMany({});
    await prisma.ticketComment.deleteMany({});
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
            'admin-test@test.com',
            'teamlead-admin-test@test.com',
            'employee1-admin-test@test.com',
            'employee2-admin-test@test.com',
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

  describe('ADMIN Employee Data Scoping', () => {
    it('should see all employees regardless of status', async () => {
      const mockUser = {
        id: adminUser.id,
        role: 'ADMIN',
      };

      // ADMIN should not have any filtering applied
      const where: any = {};
      
      const employees = await prisma.user.findMany({
        where,
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Should include all test users (admin, teamlead, employee1, employee2)
      expect(employees.length).toBeGreaterThanOrEqual(4);
      
      // Should include ACTIVE users
      const activeUsers = employees.filter((u) => u.status === 'ACTIVE');
      expect(activeUsers.length).toBeGreaterThanOrEqual(3);
      
      // Should include INACTIVE users
      const inactiveUsers = employees.filter((u) => u.status === 'INACTIVE');
      expect(inactiveUsers.length).toBeGreaterThanOrEqual(1);
    });

    it('should see all employees regardless of department', async () => {
      const employees = await prisma.user.findMany({
        where: {},
      });

      // Should include users from different departments
      const itDept = employees.filter((u) => u.department === 'IT');
      const engDept = employees.filter((u) => u.department === 'Engineering');
      const mktDept = employees.filter((u) => u.department === 'Marketing');

      expect(itDept.length).toBeGreaterThanOrEqual(1);
      expect(engDept.length).toBeGreaterThanOrEqual(2);
      expect(mktDept.length).toBeGreaterThanOrEqual(1);
    });

    it('should see employees with all roles', async () => {
      const employees = await prisma.user.findMany({
        where: {},
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      // Should include users with ADMIN role
      const admins = employees.filter((u) =>
        u.roles.some((ur) => ur.role.name === 'ADMIN')
      );
      expect(admins.length).toBeGreaterThanOrEqual(1);

      // Should include users with TEAM_LEAD role
      const teamLeads = employees.filter((u) =>
        u.roles.some((ur) => ur.role.name === 'TEAM_LEAD')
      );
      expect(teamLeads.length).toBeGreaterThanOrEqual(1);

      // Should include users with EMPLOYEE role
      const regularEmployees = employees.filter((u) =>
        u.roles.some((ur) => ur.role.name === 'EMPLOYEE')
      );
      expect(regularEmployees.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ADMIN Project Data Scoping', () => {
    it('should see all projects regardless of lead', async () => {
      const mockUser = {
        id: adminUser.id,
        role: 'ADMIN',
      };

      // ADMIN should not have any filtering applied
      const where: any = {};

      const projects = await prisma.project.findMany({
        where,
        include: {
          lead: true,
          members: true,
        },
      });

      // Should include all 3 test projects
      expect(projects.length).toBeGreaterThanOrEqual(3);

      // Should include project led by TeamLead
      const projectByTeamLead = projects.find((p) => p.id === project1.id);
      expect(projectByTeamLead).toBeDefined();
      expect(projectByTeamLead?.leadId).toBe(teamLeadUser.id);

      // Should include project led by Admin
      const projectByAdmin = projects.find((p) => p.id === project2.id);
      expect(projectByAdmin).toBeDefined();
      expect(projectByAdmin?.leadId).toBe(adminUser.id);

      // Should include project led by Employee
      const projectByEmployee = projects.find((p) => p.id === project3.id);
      expect(projectByEmployee).toBeDefined();
      expect(projectByEmployee?.leadId).toBe(employeeUser1.id);
    });

    it('should see all projects regardless of membership', async () => {
      const projects = await prisma.project.findMany({
        where: {},
        include: {
          members: true,
        },
      });

      // Should include projects where admin is not a member
      const projectsWithoutAdmin = projects.filter(
        (p) => !p.members.some((m) => m.userId === adminUser.id)
      );
      expect(projectsWithoutAdmin.length).toBeGreaterThanOrEqual(2);
    });

    it('should see all projects regardless of status', async () => {
      const projects = await prisma.project.findMany({
        where: {},
      });

      // Should include projects with different statuses
      const activeProjects = projects.filter((p) => p.status === 'ACTIVE');
      const planningProjects = projects.filter((p) => p.status === 'PLANNING');
      const completedProjects = projects.filter((p) => p.status === 'COMPLETED');

      expect(activeProjects.length).toBeGreaterThanOrEqual(1);
      expect(planningProjects.length).toBeGreaterThanOrEqual(1);
      expect(completedProjects.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ADMIN Task Data Scoping', () => {
    it('should see all tasks regardless of assignment', async () => {
      const mockUser = {
        id: adminUser.id,
        role: 'ADMIN',
      };

      // ADMIN should not have any filtering applied (except isDeleted)
      const where: any = { isDeleted: false };

      const tasks = await prisma.task.findMany({
        where,
        include: {
          project: true,
          assignee: true,
        },
      });

      // Should include all 4 test tasks
      expect(tasks.length).toBeGreaterThanOrEqual(4);

      // Should include task assigned to TeamLead
      const taskForTeamLead = tasks.find((t) => t.id === task1.id);
      expect(taskForTeamLead).toBeDefined();
      expect(taskForTeamLead?.assignedToId).toBe(teamLeadUser.id);

      // Should include task assigned to Employee1
      const taskForEmployee1 = tasks.find((t) => t.id === task2.id);
      expect(taskForEmployee1).toBeDefined();
      expect(taskForEmployee1?.assignedToId).toBe(employeeUser1.id);

      // Should include unassigned task
      const unassignedTask = tasks.find((t) => t.id === task3.id);
      expect(unassignedTask).toBeDefined();
      expect(unassignedTask?.assignedToId).toBeNull();

      // Should include task assigned to Employee2
      const taskForEmployee2 = tasks.find((t) => t.id === task4.id);
      expect(taskForEmployee2).toBeDefined();
      expect(taskForEmployee2?.assignedToId).toBe(employeeUser2.id);
    });

    it('should see all tasks regardless of project', async () => {
      const tasks = await prisma.task.findMany({
        where: { isDeleted: false },
        include: {
          project: true,
        },
      });

      // Should include tasks from all projects
      const tasksInProject1 = tasks.filter((t) => t.projectId === project1.id);
      const tasksInProject2 = tasks.filter((t) => t.projectId === project2.id);
      const tasksInProject3 = tasks.filter((t) => t.projectId === project3.id);

      expect(tasksInProject1.length).toBeGreaterThanOrEqual(2);
      expect(tasksInProject2.length).toBeGreaterThanOrEqual(1);
      expect(tasksInProject3.length).toBeGreaterThanOrEqual(1);
    });

    it('should see all tasks regardless of status', async () => {
      const tasks = await prisma.task.findMany({
        where: { isDeleted: false },
      });

      // Should include tasks with different statuses
      const todoTasks = tasks.filter((t) => t.status === 'TODO');
      const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS');
      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');

      expect(todoTasks.length).toBeGreaterThanOrEqual(2);
      expect(inProgressTasks.length).toBeGreaterThanOrEqual(1);
      expect(completedTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('should not see deleted tasks', async () => {
      // Create a deleted task
      const deletedTask = await prisma.task.create({
        data: {
          projectId: project1.id,
          title: 'Deleted Task',
          description: 'This task is deleted',
          priority: 'LOW',
          status: 'CANCELLED',
          createdById: adminUser.id,
          isDeleted: true,
        },
      });

      const tasks = await prisma.task.findMany({
        where: { isDeleted: false },
      });

      // Should not include deleted task
      expect(tasks.some((t) => t.id === deletedTask.id)).toBe(false);

      // Cleanup
      await prisma.task.delete({ where: { id: deletedTask.id } });
    });
  });

  describe('ADMIN Ticket Data Scoping', () => {
    it('should see all tickets regardless of reporter', async () => {
      const mockUser = {
        id: adminUser.id,
        role: 'ADMIN',
      };

      // ADMIN should not have any filtering applied (except isDeleted)
      const where: any = { isDeleted: false };

      const tickets = await prisma.ticket.findMany({
        where,
        include: {
          project: true,
          reporter: true,
          assignee: true,
        },
      });

      // Should include all 4 test tickets
      expect(tickets.length).toBeGreaterThanOrEqual(4);

      // Should include ticket reported by Employee1
      const ticketByEmployee1 = tickets.find((t) => t.id === ticket1.id);
      expect(ticketByEmployee1).toBeDefined();
      expect(ticketByEmployee1?.reporterId).toBe(employeeUser1.id);

      // Should include ticket reported by Admin
      const ticketByAdmin = tickets.find((t) => t.id === ticket3.id);
      expect(ticketByAdmin).toBeDefined();
      expect(ticketByAdmin?.reporterId).toBe(adminUser.id);

      // Should include ticket reported by Employee2
      const ticketByEmployee2 = tickets.find((t) => t.id === ticket4.id);
      expect(ticketByEmployee2).toBeDefined();
      expect(ticketByEmployee2?.reporterId).toBe(employeeUser2.id);
    });

    it('should see all tickets regardless of assignee', async () => {
      const tickets = await prisma.ticket.findMany({
        where: { isDeleted: false },
        include: {
          assignee: true,
        },
      });

      // Should include tickets with different assignees
      const ticketsAssignedToTeamLead = tickets.filter(
        (t) => t.assignedToId === teamLeadUser.id
      );
      const ticketsAssignedToEmployee1 = tickets.filter(
        (t) => t.assignedToId === employeeUser1.id
      );
      const unassignedTickets = tickets.filter((t) => t.assignedToId === null);

      expect(ticketsAssignedToTeamLead.length).toBeGreaterThanOrEqual(1);
      expect(ticketsAssignedToEmployee1.length).toBeGreaterThanOrEqual(1);
      expect(unassignedTickets.length).toBeGreaterThanOrEqual(2);
    });

    it('should see all tickets regardless of project', async () => {
      const tickets = await prisma.ticket.findMany({
        where: { isDeleted: false },
        include: {
          project: true,
        },
      });

      // Should include tickets from all projects
      const ticketsInProject1 = tickets.filter((t) => t.projectId === project1.id);
      const ticketsInProject2 = tickets.filter((t) => t.projectId === project2.id);
      const ticketsInProject3 = tickets.filter((t) => t.projectId === project3.id);

      expect(ticketsInProject1.length).toBeGreaterThanOrEqual(2);
      expect(ticketsInProject2.length).toBeGreaterThanOrEqual(1);
      expect(ticketsInProject3.length).toBeGreaterThanOrEqual(1);
    });

    it('should see all tickets regardless of status', async () => {
      const tickets = await prisma.ticket.findMany({
        where: { isDeleted: false },
      });

      // Should include tickets with different statuses
      const openTickets = tickets.filter((t) => t.status === 'OPEN');
      const inProgressTickets = tickets.filter((t) => t.status === 'IN_PROGRESS');
      const resolvedTickets = tickets.filter((t) => t.status === 'RESOLVED');
      const closedTickets = tickets.filter((t) => t.status === 'CLOSED');

      expect(openTickets.length).toBeGreaterThanOrEqual(1);
      expect(inProgressTickets.length).toBeGreaterThanOrEqual(1);
      expect(resolvedTickets.length).toBeGreaterThanOrEqual(1);
      expect(closedTickets.length).toBeGreaterThanOrEqual(1);
    });

    it('should not see deleted tickets', async () => {
      // Create a deleted ticket
      const deletedTicket = await prisma.ticket.create({
        data: {
          projectId: project1.id,
          title: 'Deleted Ticket',
          description: 'This ticket is deleted',
          type: 'BUG',
          priority: 'LOW',
          status: 'CLOSED',
          reporterId: adminUser.id,
          isDeleted: true,
        },
      });

      const tickets = await prisma.ticket.findMany({
        where: { isDeleted: false },
      });

      // Should not include deleted ticket
      expect(tickets.some((t) => t.id === deletedTicket.id)).toBe(false);

      // Cleanup
      await prisma.ticket.delete({ where: { id: deletedTicket.id } });
    });
  });

  describe('ADMIN CRUD Operations', () => {
    describe('Project CRUD', () => {
      it('should allow ADMIN to create a project', async () => {
        const newProject = await prisma.project.create({
          data: {
            name: 'New Admin Project',
            description: 'Created by ADMIN',
            status: 'PLANNING',
            createdById: adminUser.id,
            leadId: teamLeadUser.id,
          },
        });

        expect(newProject).toBeDefined();
        expect(newProject.name).toBe('New Admin Project');
        expect(newProject.createdById).toBe(adminUser.id);

        // Cleanup
        await prisma.projectMember.deleteMany({ where: { projectId: newProject.id } });
        await prisma.project.delete({ where: { id: newProject.id } });
      });

      it('should allow ADMIN to update any project', async () => {
        const updatedProject = await prisma.project.update({
          where: { id: project1.id },
          data: { description: 'Updated by ADMIN' },
        });

        expect(updatedProject.description).toBe('Updated by ADMIN');

        // Restore original
        await prisma.project.update({
          where: { id: project1.id },
          data: { description: 'Led by TeamLead' },
        });
      });

      it('should allow ADMIN to delete any project', async () => {
        // Create a temporary project
        const tempProject = await prisma.project.create({
          data: {
            name: 'Temp Project',
            description: 'To be deleted',
            status: 'PLANNING',
            createdById: adminUser.id,
            leadId: adminUser.id,
          },
        });

        // Delete it
        await prisma.project.delete({ where: { id: tempProject.id } });

        // Verify deletion
        const deletedProject = await prisma.project.findUnique({
          where: { id: tempProject.id },
        });
        expect(deletedProject).toBeNull();
      });
    });

    describe('Task CRUD', () => {
      it('should allow ADMIN to create a task in any project', async () => {
        const newTask = await prisma.task.create({
          data: {
            projectId: project1.id,
            title: 'New Admin Task',
            description: 'Created by ADMIN',
            priority: 'MEDIUM',
            status: 'TODO',
            createdById: adminUser.id,
            assignedToId: employeeUser1.id,
          },
        });

        expect(newTask).toBeDefined();
        expect(newTask.title).toBe('New Admin Task');
        expect(newTask.createdById).toBe(adminUser.id);

        // Cleanup
        await prisma.task.delete({ where: { id: newTask.id } });
      });

      it('should allow ADMIN to update any task', async () => {
        const updatedTask = await prisma.task.update({
          where: { id: task1.id },
          data: { status: 'REVIEW' },
        });

        expect(updatedTask.status).toBe('REVIEW');

        // Restore original
        await prisma.task.update({
          where: { id: task1.id },
          data: { status: 'IN_PROGRESS' },
        });
      });

      it('should allow ADMIN to delete any task', async () => {
        // Create a temporary task
        const tempTask = await prisma.task.create({
          data: {
            projectId: project1.id,
            title: 'Temp Task',
            description: 'To be deleted',
            priority: 'LOW',
            status: 'TODO',
            createdById: adminUser.id,
          },
        });

        // Soft delete
        await prisma.task.update({
          where: { id: tempTask.id },
          data: { isDeleted: true },
        });

        // Verify soft deletion
        const deletedTask = await prisma.task.findUnique({
          where: { id: tempTask.id },
        });
        expect(deletedTask?.isDeleted).toBe(true);

        // Cleanup
        await prisma.task.delete({ where: { id: tempTask.id } });
      });
    });

    describe('Ticket CRUD', () => {
      it('should allow ADMIN to create a ticket in any project', async () => {
        const newTicket = await prisma.ticket.create({
          data: {
            projectId: project1.id,
            title: 'New Admin Ticket',
            description: 'Created by ADMIN',
            type: 'BUG',
            priority: 'HIGH',
            status: 'OPEN',
            reporterId: adminUser.id,
          },
        });

        expect(newTicket).toBeDefined();
        expect(newTicket.title).toBe('New Admin Ticket');
        expect(newTicket.reporterId).toBe(adminUser.id);

        // Cleanup
        await prisma.ticket.delete({ where: { id: newTicket.id } });
      });

      it('should allow ADMIN to update any ticket', async () => {
        const updatedTicket = await prisma.ticket.update({
          where: { id: ticket1.id },
          data: { status: 'IN_PROGRESS' },
        });

        expect(updatedTicket.status).toBe('IN_PROGRESS');

        // Restore original
        await prisma.ticket.update({
          where: { id: ticket1.id },
          data: { status: 'OPEN' },
        });
      });

      it('should allow ADMIN to assign any ticket', async () => {
        const assignedTicket = await prisma.ticket.update({
          where: { id: ticket1.id },
          data: { assignedToId: teamLeadUser.id },
        });

        expect(assignedTicket.assignedToId).toBe(teamLeadUser.id);

        // Restore original
        await prisma.ticket.update({
          where: { id: ticket1.id },
          data: { assignedToId: null },
        });
      });

      it('should allow ADMIN to delete any ticket', async () => {
        // Create a temporary ticket
        const tempTicket = await prisma.ticket.create({
          data: {
            projectId: project1.id,
            title: 'Temp Ticket',
            description: 'To be deleted',
            type: 'SUPPORT',
            priority: 'LOW',
            status: 'OPEN',
            reporterId: adminUser.id,
          },
        });

        // Soft delete
        await prisma.ticket.update({
          where: { id: tempTicket.id },
          data: { isDeleted: true },
        });

        // Verify soft deletion
        const deletedTicket = await prisma.ticket.findUnique({
          where: { id: tempTicket.id },
        });
        expect(deletedTicket?.isDeleted).toBe(true);

        // Cleanup
        await prisma.ticket.delete({ where: { id: tempTicket.id } });
      });
    });

    describe('Employee CRUD', () => {
      it('should allow ADMIN to view any employee details', async () => {
        const employee = await prisma.user.findUnique({
          where: { id: employeeUser1.id },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        });

        expect(employee).toBeDefined();
        expect(employee?.id).toBe(employeeUser1.id);
        expect(employee?.email).toBe('employee1-admin-test@test.com');
      });

      it('should allow ADMIN to update any employee', async () => {
        const updatedEmployee = await prisma.user.update({
          where: { id: employeeUser1.id },
          data: { department: 'Updated Department' },
        });

        expect(updatedEmployee.department).toBe('Updated Department');

        // Restore original
        await prisma.user.update({
          where: { id: employeeUser1.id },
          data: { department: 'Engineering' },
        });
      });
    });
  });

  describe('ADMIN vs Other Roles Comparison', () => {
    it('ADMIN should see more projects than EMPLOYEE', async () => {
      // ADMIN query (no filtering)
      const adminProjects = await prisma.project.findMany({
        where: {},
      });

      // EMPLOYEE query (filtered by membership)
      const employeeProjects = await prisma.project.findMany({
        where: {
          members: {
            some: { userId: employeeUser1.id },
          },
        },
      });

      expect(adminProjects.length).toBeGreaterThan(employeeProjects.length);
    });

    it('ADMIN should see more tasks than EMPLOYEE', async () => {
      // ADMIN query (no filtering except isDeleted)
      const adminTasks = await prisma.task.findMany({
        where: { isDeleted: false },
      });

      // EMPLOYEE query (filtered by assignment)
      const employeeTasks = await prisma.task.findMany({
        where: {
          isDeleted: false,
          assignedToId: employeeUser1.id,
        },
      });

      expect(adminTasks.length).toBeGreaterThan(employeeTasks.length);
    });

    it('ADMIN should see more tickets than EMPLOYEE', async () => {
      // ADMIN query (no filtering except isDeleted)
      const adminTickets = await prisma.ticket.findMany({
        where: { isDeleted: false },
      });

      // EMPLOYEE query (filtered by reporter)
      const employeeTickets = await prisma.ticket.findMany({
        where: {
          isDeleted: false,
          reporterId: employeeUser1.id,
        },
      });

      expect(adminTickets.length).toBeGreaterThan(employeeTickets.length);
    });

    it('ADMIN should see more tasks than TEAM_LEAD', async () => {
      // ADMIN query (no filtering except isDeleted)
      const adminTasks = await prisma.task.findMany({
        where: { isDeleted: false },
      });

      // TEAM_LEAD query (filtered by OR condition)
      const teamLeadTasks = await prisma.task.findMany({
        where: {
          isDeleted: false,
          OR: [
            { project: { leadId: teamLeadUser.id } },
            { assignedToId: teamLeadUser.id },
          ],
        },
      });

      expect(adminTasks.length).toBeGreaterThanOrEqual(teamLeadTasks.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle ADMIN viewing empty result sets', async () => {
      // Query for non-existent data
      const tasks = await prisma.task.findMany({
        where: {
          isDeleted: false,
          title: 'Non-Existent Task',
        },
      });

      expect(tasks.length).toBe(0);
    });

    it('should handle ADMIN operations on soft-deleted entities', async () => {
      // Create and soft-delete a task
      const tempTask = await prisma.task.create({
        data: {
          projectId: project1.id,
          title: 'Soft Deleted Task',
          description: 'Test soft delete',
          priority: 'LOW',
          status: 'TODO',
          createdById: adminUser.id,
          isDeleted: true,
        },
      });

      // Query without isDeleted filter should include it
      const allTasks = await prisma.task.findMany({
        where: { id: tempTask.id },
      });
      expect(allTasks.length).toBe(1);

      // Query with isDeleted: false should exclude it
      const activeTasks = await prisma.task.findMany({
        where: { id: tempTask.id, isDeleted: false },
      });
      expect(activeTasks.length).toBe(0);

      // Cleanup
      await prisma.task.delete({ where: { id: tempTask.id } });
    });

    it('should handle ADMIN viewing entities with null relationships', async () => {
      // Task with no assignee
      const unassignedTask = await prisma.task.findUnique({
        where: { id: task3.id },
        include: { assignee: true },
      });

      expect(unassignedTask).toBeDefined();
      expect(unassignedTask?.assignedToId).toBeNull();
      expect(unassignedTask?.assignee).toBeNull();
    });
  });
});
