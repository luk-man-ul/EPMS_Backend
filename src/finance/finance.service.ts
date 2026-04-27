import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseType } from '@prisma/client';
import { CreateRevenueDto } from './dto/create-revenue.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryRevenueDto, QueryExpenseDto } from './dto/query-finance.dto';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // REVENUE
  // ─────────────────────────────────────────────

  async createRevenue(dto: CreateRevenueDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.revenue.create({
      data: {
        projectId: dto.projectId,
        amount: dto.amount,
        receivedDate: new Date(dto.receivedDate),
        description: dto.description,
        createdById: userId,
      },
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getRevenues(query: QueryRevenueDto) {
    const where: any = {};

    if (query.projectId) where.projectId = query.projectId;

    if (query.startDate || query.endDate) {
      where.receivedDate = {};
      if (query.startDate) where.receivedDate.gte = new Date(query.startDate);
      if (query.endDate) where.receivedDate.lte = new Date(query.endDate);
    }

    return this.prisma.revenue.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { receivedDate: 'desc' },
    });
  }

  // ─────────────────────────────────────────────
  // EXPENSE
  // ─────────────────────────────────────────────

  async createExpense(dto: CreateExpenseDto, userId: string) {
    if (dto.type === ExpenseType.SALARY && !dto.employeeId) {
      throw new BadRequestException('employeeId is required when type is SALARY');
    }

    if (dto.employeeId) {
      const employee = await this.prisma.user.findUnique({
        where: { id: dto.employeeId },
      });
      if (!employee) throw new NotFoundException('Employee not found');
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    return this.prisma.expense.create({
      data: {
        type: dto.type,
        amount: dto.amount,
        expenseDate: new Date(dto.expenseDate),
        employeeId: dto.employeeId ?? null,
        projectId: dto.projectId ?? null,
        description: dto.description,
        createdById: userId,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getExpenses(query: QueryExpenseDto) {
    const where: any = {};

    if (query.projectId) where.projectId = query.projectId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.type) where.type = query.type;

    if (query.startDate || query.endDate) {
      where.expenseDate = {};
      if (query.startDate) where.expenseDate.gte = new Date(query.startDate);
      if (query.endDate) where.expenseDate.lte = new Date(query.endDate);
    }

    return this.prisma.expense.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { expenseDate: 'desc' },
    });
  }

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────

  async getSummary() {
    const [revenueAgg, expenseAgg] = await Promise.all([
      this.prisma.revenue.aggregate({ _sum: { amount: true } }),
      this.prisma.expense.aggregate({ _sum: { amount: true } }),
    ]);

    const totalRevenue = revenueAgg._sum.amount ?? 0;
    const totalExpense = expenseAgg._sum.amount ?? 0;

    return {
      totalRevenue,
      totalExpense,
      profit: totalRevenue - totalExpense,
    };
  }

  // ─────────────────────────────────────────────
  // PROJECT PROFIT
  // ─────────────────────────────────────────────

  async getProjectProfit(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const [revenueAgg, expenseAgg] = await Promise.all([
      this.prisma.revenue.aggregate({
        where: { projectId },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: { projectId },
        _sum: { amount: true },
      }),
    ]);

    const revenue = revenueAgg._sum.amount ?? 0;
    const expense = expenseAgg._sum.amount ?? 0;

    return {
      projectId,
      revenue,
      expense,
      profit: revenue - expense,
    };
  }

  // ─────────────────────────────────────────────
  // EMPLOYEE COST
  // ─────────────────────────────────────────────

  async getEmployeeCost(employeeId: string) {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const agg = await this.prisma.expense.aggregate({
      where: { employeeId, type: ExpenseType.SALARY },
      _sum: { amount: true },
    });

    return {
      employeeId,
      totalSalary: agg._sum.amount ?? 0,
    };
  }
}
