import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Fetch all stats concurrently for better performance
    const [
      totalEmployeesCount,
      activeProjectsCount,
      openTasksCount,
      openTicketsCount,
      todayAttendanceData,
      monthlyFinanceData,
      allTasks,
      allTickets,
      todayAttendanceSessions,
      monthlyExpenseData,
      pendingSelfWorkApprovals,
    ] = await Promise.all([
      // Total Employees (exclude ADMIN role, only ACTIVE users)
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          roles: {
            some: {
              role: {
                name: {
                  not: 'ADMIN',
                },
              },
            },
          },
        },
      }),

      // Active Projects
      this.prisma.project.count({
        where: {
          status: 'ACTIVE',
        },
      }),

      // Open Tasks (not COMPLETED or CANCELLED)
      this.prisma.task.count({
        where: {
          isDeleted: false,
          status: {
            notIn: ['COMPLETED', 'CANCELLED'],
          },
        },
      }),

      // Open Tickets
      this.prisma.ticket.count({
        where: {
          isDeleted: false,
          status: 'OPEN',
        },
      }),

      // Today's Attendance
      this.prisma.attendance.findMany({
        where: {
          date: today,
        },
        select: {
          status: true,
        },
      }),

      // Monthly Finance Income
      this.prisma.projectFinance.aggregate({
        _sum: {
          totalIncome: true,
        },
      }),

      // All Tasks for progress calculation
      this.prisma.task.findMany({
        where: {
          isDeleted: false,
        },
        select: {
          status: true,
          dueDate: true,
        },
      }),

      // All Tickets for resolution calculation
      this.prisma.ticket.findMany({
        where: {
          isDeleted: false,
        },
        select: {
          status: true,
        },
      }),

      // Today's Attendance Sessions for detailed breakdown
      this.prisma.attendanceSession.findMany({
        where: {
          checkIn: {
            gte: today,
          },
        },
        select: {
          checkIn: true,
        },
      }),

      // Monthly Expense Data
      this.prisma.projectFinance.aggregate({
        _sum: {
          totalExpense: true,
        },
      }),

      // Pending Self-Work Approvals
      this.prisma.task.count({
        where: {
          isDeleted: false,
          type: 'SELF_WORK',
          approvedById: null,
          status: {
            notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'],
          },
        },
      }),
    ]);

    // Calculate today's attendance percentage
    let todayAttendancePercentage = 0;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    if (totalEmployeesCount > 0) {
      presentCount = todayAttendanceData.filter(
        (att) => att.status === 'PRESENT' || att.status === 'WFH',
      ).length;
      absentCount = totalEmployeesCount - presentCount;
      todayAttendancePercentage = Math.round(
        (presentCount / totalEmployeesCount) * 100,
      );

      // Calculate late check-ins (after 9:30 AM)
      const lateThreshold = new Date(today);
      lateThreshold.setHours(9, 30, 0, 0);
      lateCount = todayAttendanceSessions.filter(
        (session) => new Date(session.checkIn) > lateThreshold,
      ).length;
    }

    // Calculate task completion percentage
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(
      (task) => task.status === 'COMPLETED',
    ).length;
    const taskCompletionPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate overdue tasks
    const overdueTasks = allTasks.filter((task) => {
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED')
        return false;
      if (!task.dueDate) return false;
      return new Date(task.dueDate) < new Date();
    }).length;

    // Calculate ticket resolution percentage
    const totalTickets = allTickets.length;
    const resolvedTickets = allTickets.filter(
      (ticket) => ticket.status === 'RESOLVED' || ticket.status === 'CLOSED',
    ).length;
    const ticketResolutionPercentage =
      totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

    // Calculate monthly finance
    const monthlyIncome = monthlyFinanceData._sum.totalIncome || 0;
    const monthlyExpense = monthlyExpenseData._sum.totalExpense || 0;
    const monthlyProfit = monthlyIncome - monthlyExpense;

    // Count expense approvals pending (expense module not implemented yet)
    const expenseApprovalsPending = 0;

    return {
      // Top Stats Cards
      totalEmployees: totalEmployeesCount,
      activeProjects: activeProjectsCount,
      openTasks: openTasksCount,
      openTickets: openTicketsCount,
      todayAttendance: todayAttendancePercentage,
      monthlyProfit: monthlyProfit,

      // Work Progress
      taskCompletion: taskCompletionPercentage,
      ticketResolution: ticketResolutionPercentage,
      overdueTasks: overdueTasks,

      // Attendance Summary
      presentToday: presentCount,
      absentToday: absentCount,
      lateCheckIns: lateCount,

      // Finance Snapshot
      monthlyIncome: monthlyIncome,
      monthlyExpense: monthlyExpense,

      // Alerts
      pendingSelfWorkApprovals: pendingSelfWorkApprovals,
      expenseApprovalsPending: expenseApprovalsPending,
    };
  }
}
