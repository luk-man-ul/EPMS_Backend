import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getISTStartOfDay, getISTStartOfNextDay, getISTTimeToday, toISTDate } from '../common/utils/ist-date.util';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const today = getISTStartOfDay();       // T18:30:00Z — used for DateTime (checkIn) queries
    const nextDay = getISTStartOfNextDay(); // T18:30:00Z next day — used for DateTime range
    const todayISTDate = toISTDate(new Date()); // T00:00:00Z — used for @db.Date (Attendance.date) queries

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

      // Today's finalized Attendance summaries (written by finalization cron)
      // Falls back to live AttendanceSession count if finalization hasn't run yet.
      // Attendance.date is a @db.Date stored as UTC midnight (T00:00:00Z) — use todayISTDate.
      this.prisma.attendance.findMany({
        where: {
          date: todayISTDate,
        },
        select: {
          userId: true,
          status: true,
          firstCheckIn: true,
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

    // Calculate today's attendance percentage from finalized Attendance summaries.
    // If finalization hasn't run yet (e.g. mid-day), fall back to live session count.
    let todayAttendancePercentage = 0;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    if (totalEmployeesCount > 0) {
      if (todayAttendanceData.length > 0) {
        // Finalized data available — read directly from Attendance table.
        // presentCount includes ALL statuses that represent a physical presence
        // (PRESENT, LATE, WFH, HALF_DAY). LATE is a secondary flag — it does
        // NOT exclude an employee from the present count.
        presentCount = todayAttendanceData.filter(
          (a) => a.status === 'PRESENT' || a.status === 'LATE' || a.status === 'WFH' || a.status === 'HALF_DAY',
        ).length;

        // lateCount: employees whose finalized status is LATE.
        // These are already included in presentCount above.
        lateCount = todayAttendanceData.filter((a) => a.status === 'LATE').length;
      } else {
        // Finalization hasn't run yet (mid-day) — fall back to live AttendanceSession data.
        // Fetch each session's checkIn time so we can detect late arrivals.
        const liveSessions = await this.prisma.attendanceSession.findMany({
          where: { checkIn: { gte: today, lt: nextDay } },
          select: { userId: true, checkIn: true },
        });

        // Deduplicate by userId — keep the earliest check-in per employee.
        // An employee may have multiple sessions (e.g. break + return); only
        // the first check-in of the day determines whether they are late.
        const earliestCheckInByUser = new Map<string, Date>();
        for (const session of liveSessions) {
          const existing = earliestCheckInByUser.get(session.userId);
          if (!existing || session.checkIn < existing) {
            earliestCheckInByUser.set(session.userId, session.checkIn);
          }
        }

        // Any employee with at least one session today is PRESENT.
        presentCount = earliestCheckInByUser.size;

        // Late threshold: 11:00 AM IST.
        // getISTTimeToday(11, 0) returns the UTC equivalent of 11:00 AM IST today,
        // so the comparison is timezone-correct without any raw UTC hour arithmetic.
        const lateThreshold = getISTTimeToday(11, 0);
        lateCount = 0;
        for (const firstCheckIn of earliestCheckInByUser.values()) {
          if (firstCheckIn >= lateThreshold) {
            lateCount++;
          }
        }
      }

      absentCount = totalEmployeesCount - presentCount;
      todayAttendancePercentage = Math.round((presentCount / totalEmployeesCount) * 100);
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
