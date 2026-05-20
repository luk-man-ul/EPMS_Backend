import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, InvoiceStatus, LedgerEntryType, LedgerReferenceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { CreateRevenueDto } from './dto/create-revenue.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryRevenueDto, QueryExpenseDto, QueryLedgerDto, QueryInvoiceDto } from './dto/query-finance.dto';

// ── Helper: check if a category name represents a salary expense ──────────────
const isSalaryCategory = (name?: string | null): boolean =>
  name?.toLowerCase() === 'salary';

// ── Decimal serialization helpers ─────────────────────────────────────────────
// Prisma.Decimal.toJSON() returns a string, NOT a number.
// All monetary Decimal fields MUST be converted to number at the service boundary
// before returning in API responses, otherwise JSON.stringify produces strings.

/**
 * Convert a Prisma.Decimal (or null/undefined) to a plain JS number.
 * Returns 0 for null/undefined.
 * Throws InternalServerErrorException if the result is non-finite (NaN/Infinity).
 */
function serializeDecimal(d: Prisma.Decimal | null | undefined): number {
  if (d === null || d === undefined) return 0;
  const n = d.toNumber();
  if (!isFinite(n)) {
    throw new InternalServerErrorException(
      `Invalid monetary value encountered: ${d.toString()}`,
    );
  }
  return n;
}

/** Serialize a Revenue record — converts amount from Prisma.Decimal to number. */
function serializeRevenue<T extends { amount: Prisma.Decimal }>(r: T): Omit<T, 'amount'> & { amount: number } {
  return { ...r, amount: serializeDecimal(r.amount) };
}

/** Serialize an Expense record — converts amount from Prisma.Decimal to number. */
function serializeExpense<T extends { amount: Prisma.Decimal }>(e: T): Omit<T, 'amount'> & { amount: number } {
  return { ...e, amount: serializeDecimal(e.amount) };
}

/** Serialize a LedgerEntry record — converts amount from Prisma.Decimal to number. */
function serializeLedgerEntry<T extends { amount: Prisma.Decimal }>(e: T): Omit<T, 'amount'> & { amount: number } {
  return { ...e, amount: serializeDecimal(e.amount) };
}

/**
 * Serialize an Invoice record — converts all monetary Decimal fields to number:
 * totalAmount, items[].quantity, items[].unitPrice, items[].total, revenue?.amount
 */
function serializeInvoice<
  TItem extends { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; total: Prisma.Decimal },
  TRevenue extends { amount: Prisma.Decimal } | null | undefined,
  T extends { totalAmount: Prisma.Decimal; items: TItem[]; revenue?: TRevenue },
>(inv: T) {
  return {
    ...inv,
    totalAmount: serializeDecimal(inv.totalAmount),
    items: inv.items.map((item) => ({
      ...item,
      quantity:  serializeDecimal(item.quantity),
      unitPrice: serializeDecimal(item.unitPrice),
      total:     serializeDecimal(item.total),
    })),
    revenue: inv.revenue
      ? { ...inv.revenue, amount: serializeDecimal(inv.revenue.amount) }
      : inv.revenue,
  };
}

// ─── Shared include shapes ────────────────────────────────────────────────────

const REVENUE_INCLUDE = {
  project:     { select: { id: true, name: true } },
  createdBy:   { select: { id: true, firstName: true, lastName: true } },
  bankAccount: { select: { id: true, name: true, bankName: true } },
  invoice:     { select: { id: true, invoiceNo: true, status: true } },
} as const;

const EXPENSE_INCLUDE = {
  employee:    { select: { id: true, firstName: true, lastName: true } },
  project:     { select: { id: true, name: true } },
  createdBy:   { select: { id: true, firstName: true, lastName: true } },
  bankAccount: { select: { id: true, name: true, bankName: true } },
  category:    { select: { id: true, name: true } },
} as const;

const LEDGER_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

// Full invoice include — used for single-record responses
const INVOICE_INCLUDE_FULL = {
  project:   { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  revenue:   {
    select: {
      id: true, amount: true, receivedDate: true,
      description: true, paymentMethod: true,
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

// List invoice include — same shape, items included
const INVOICE_INCLUDE_LIST = INVOICE_INCLUDE_FULL;


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

    if (dto.bankAccountId) {
      const bank = await this.prisma.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
      });
      if (!bank) throw new NotFoundException('Bank account not found');
      if (!bank.isActive) throw new BadRequestException('Bank account is inactive');
    }

    // Atomic: create Revenue + LedgerEntry together
    const result = await this.prisma.$transaction(async (tx) => {
      const revenue = await tx.revenue.create({
        data: {
          projectId:     dto.projectId,
          amount:        dto.amount,
          receivedDate:  new Date(dto.receivedDate),
          description:   dto.description,
          createdById:   userId,
          paymentMethod: dto.paymentMethod ?? null,
          bankAccountId: dto.bankAccountId ?? null,
        },
        include: REVENUE_INCLUDE,
      });

      await tx.ledgerEntry.create({
        data: {
          type:          LedgerEntryType.CREDIT,
          referenceType: LedgerReferenceType.REVENUE,
          referenceId:   revenue.id,
          // revenue.amount is now Prisma.Decimal — convert to number for the write
          amount:        revenue.amount.toNumber(),
          date:          revenue.receivedDate,
          description:   revenue.description ?? `Revenue: ${project.name}`,
          createdById:   userId,
        },
      });

      return revenue;
    });

    return serializeRevenue(result);
  }

  async getRevenues(query: QueryRevenueDto) {
    const where: any = {};

    if (query.projectId) where.projectId = query.projectId;

    if (query.startDate || query.endDate) {
      where.receivedDate = {};
      if (query.startDate) where.receivedDate.gte = new Date(query.startDate);
      if (query.endDate)   where.receivedDate.lte = new Date(query.endDate);
    }

    const revenues = await this.prisma.revenue.findMany({
      where,
      include: REVENUE_INCLUDE,
      orderBy: { receivedDate: 'desc' },
    });

    return revenues.map(serializeRevenue);
  }

  // ─────────────────────────────────────────────
  // EXPENSE
  // ─────────────────────────────────────────────

  async createExpense(dto: CreateExpenseDto, userId: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    if (!category.isActive) throw new BadRequestException('Expense category is inactive');

    if (isSalaryCategory(category.name) && !dto.employeeId) {
      throw new BadRequestException('employeeId is required for Salary expenses');
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

    if (dto.bankAccountId) {
      const bank = await this.prisma.bankAccount.findUnique({
        where: { id: dto.bankAccountId },
      });
      if (!bank) throw new NotFoundException('Bank account not found');
      if (!bank.isActive) throw new BadRequestException('Bank account is inactive');
    }

    // Atomic: create Expense + LedgerEntry together
    const result = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          amount:        dto.amount,
          expenseDate:   new Date(dto.expenseDate),
          employeeId:    dto.employeeId ?? null,
          projectId:     dto.projectId ?? null,
          description:   dto.description,
          createdById:   userId,
          paymentMethod: dto.paymentMethod ?? null,
          bankAccountId: dto.bankAccountId ?? null,
          categoryId:    dto.categoryId,
        },
        include: EXPENSE_INCLUDE,
      });

      await tx.ledgerEntry.create({
        data: {
          type:          LedgerEntryType.DEBIT,
          referenceType: LedgerReferenceType.EXPENSE,
          referenceId:   expense.id,
          // expense.amount is now Prisma.Decimal — convert to number for the write
          amount:        expense.amount.toNumber(),
          date:          expense.expenseDate,
          description:   expense.description ?? `Expense: ${category.name}`,
          createdById:   userId,
        },
      });

      return expense;
    });

    return serializeExpense(result);
  }

  async getExpenses(query: QueryExpenseDto) {
    const where: any = {};

    if (query.projectId)  where.projectId  = query.projectId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.categoryId) where.categoryId = query.categoryId;

    if (query.startDate || query.endDate) {
      where.expenseDate = {};
      if (query.startDate) where.expenseDate.gte = new Date(query.startDate);
      if (query.endDate)   where.expenseDate.lte = new Date(query.endDate);
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: { expenseDate: 'desc' },
    });

    return expenses.map(serializeExpense);
  }


  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────

  async getSummary() {
    const [revenueAgg, expenseAgg] = await Promise.all([
      this.prisma.revenue.aggregate({ _sum: { amount: true } }),
      this.prisma.expense.aggregate({ _sum: { amount: true } }),
    ]);

    // _sum.amount is now Prisma.Decimal | null — convert explicitly
    const totalRevenue = serializeDecimal(revenueAgg._sum.amount);
    const totalExpense = serializeDecimal(expenseAgg._sum.amount);

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

    // _sum.amount is now Prisma.Decimal | null — convert explicitly
    const revenue = serializeDecimal(revenueAgg._sum.amount);
    const expense = serializeDecimal(expenseAgg._sum.amount);

    return {
      projectId,
      revenue,
      expense,
      profit: revenue - expense,
    };
  }

  // ─────────────────────────────────────────────
  // ALL PROJECTS AGGREGATE
  // ─────────────────────────────────────────────

  async getAllProjectsProfit() {
    const [revenueGroups, expenseGroups, revenueCountGroups, expenseCountGroups] =
      await Promise.all([
        this.prisma.revenue.groupBy({
          by: ['projectId'],
          _sum: { amount: true },
        }),
        this.prisma.expense.groupBy({
          by: ['projectId'],
          where: { projectId: { not: null } },
          _sum: { amount: true },
        }),
        this.prisma.revenue.groupBy({
          by: ['projectId'],
          _count: { id: true },
        }),
        this.prisma.expense.groupBy({
          by: ['projectId'],
          where: { projectId: { not: null } },
          _count: { id: true },
        }),
      ]);

    const projectIds = Array.from(
      new Set([
        ...revenueGroups.map((r) => r.projectId),
        ...expenseGroups.map((e) => e.projectId).filter(Boolean),
      ])
    ) as string[];

    if (projectIds.length === 0) {
      return {
        projects: [],
        totalRevenue: 0,
        totalExpense: 0,
        totalProfit: 0,
        topProject: null,
      };
    }

    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });
    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    // _sum.amount is now Prisma.Decimal | null — convert to number in the maps
    const revenueMap = new Map(
      revenueGroups.map((r) => [r.projectId, serializeDecimal(r._sum.amount)])
    );
    const expenseMap = new Map(
      expenseGroups.map((e) => [e.projectId as string, serializeDecimal(e._sum.amount)])
    );
    const revenueCountMap = new Map(
      revenueCountGroups.map((r) => [r.projectId, r._count.id])
    );
    const expenseCountMap = new Map(
      expenseCountGroups.map((e) => [e.projectId as string, e._count.id])
    );

    // All values in revenueMap/expenseMap are now plain numbers
    const summaries = projectIds
      .map((projectId) => {
        const revenue = revenueMap.get(projectId) ?? 0;
        const expense = expenseMap.get(projectId) ?? 0;
        const profit = revenue - expense;
        const profitMargin =
          revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;

        return {
          projectId,
          projectName: projectMap.get(projectId) ?? 'Unknown Project',
          revenue,
          expense,
          profit,
          profitMargin,
          revenueCount: revenueCountMap.get(projectId) ?? 0,
          expenseCount: expenseCountMap.get(projectId) ?? 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = summaries.reduce((s, p) => s + p.revenue, 0);
    const totalExpense = summaries.reduce((s, p) => s + p.expense, 0);
    const totalProfit = totalRevenue - totalExpense;

    return {
      projects: summaries,
      totalRevenue,
      totalExpense,
      totalProfit,
      topProject: summaries.length > 0 ? summaries[0] : null,
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
      where: {
        employeeId,
        category: { name: { equals: 'Salary', mode: 'insensitive' } },
      },
      _sum: { amount: true },
    });

    return {
      employeeId,
      // _sum.amount is now Prisma.Decimal | null — convert explicitly
      totalSalary: serializeDecimal(agg._sum.amount),
    };
  }

  // ─────────────────────────────────────────────
  // ALL EMPLOYEES AGGREGATE
  // ─────────────────────────────────────────────

  async getAllEmployeesCost() {
    const salaryGroups = await this.prisma.expense.groupBy({
      by: ['employeeId'],
      where: {
        employeeId: { not: null },
        category: { name: { equals: 'Salary', mode: 'insensitive' } },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    if (salaryGroups.length === 0) {
      return {
        employees: [],
        totalPayroll: 0,
        employeeCount: 0,
        topEarner: null,
      };
    }

    const employeeIds = salaryGroups
      .map((g) => g.employeeId)
      .filter(Boolean) as string[];

    const employees = await this.prisma.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const employeeMap = new Map(
      employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`])
    );

    // _sum.amount is now Prisma.Decimal | null — convert to number in summaries
    const summaries = salaryGroups
      .map((g) => ({
        employeeId:   g.employeeId as string,
        employeeName: employeeMap.get(g.employeeId as string) ?? 'Unknown Employee',
        totalSalary:  serializeDecimal(g._sum.amount),
        salaryCount:  g._count.id,
      }))
      .sort((a, b) => b.totalSalary - a.totalSalary);

    const totalPayroll = summaries.reduce((s, e) => s + e.totalSalary, 0);

    return {
      employees: summaries,
      totalPayroll,
      employeeCount: summaries.length,
      topEarner: summaries.length > 0 ? summaries[0] : null,
    };
  }

  // ─────────────────────────────────────────────
  // BANK ACCOUNTS
  // ─────────────────────────────────────────────

  async getBankAccounts() {
    return this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─────────────────────────────────────────────
  // EXPENSE CATEGORIES
  // ─────────────────────────────────────────────

  async getExpenseCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }


  // ─────────────────────────────────────────────
  // LEDGER
  // ─────────────────────────────────────────────

  async getLedger(query: QueryLedgerDto) {
    const where: any = {};

    if (query.type)          where.type          = query.type;
    if (query.referenceType) where.referenceType = query.referenceType;

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate)   where.date.lte = new Date(query.endDate);
    }

    const entries = await this.prisma.ledgerEntry.findMany({
      where,
      include: LEDGER_INCLUDE,
      orderBy: { date: 'desc' },
    });

    if (entries.length === 0) return [];

    // Batch-resolve linked revenue/expense records to attach
    // paymentMethod and bankAccount without storing them on LedgerEntry.
    const revenueIds = entries
      .filter((e) => e.referenceType === LedgerReferenceType.REVENUE)
      .map((e) => e.referenceId);

    const expenseIds = entries
      .filter((e) => e.referenceType === LedgerReferenceType.EXPENSE)
      .map((e) => e.referenceId);

    const revenueMap = new Map<string, any>();
    const expenseMap = new Map<string, any>();

    if (revenueIds.length > 0) {
      const rows = await this.prisma.revenue.findMany({
        where: { id: { in: revenueIds } },
        select: {
          id: true,
          paymentMethod: true,
          bankAccount: { select: { id: true, name: true, bankName: true } },
        },
      });
      rows.forEach((r) => revenueMap.set(r.id, r));
    }

    if (expenseIds.length > 0) {
      const rows = await this.prisma.expense.findMany({
        where: { id: { in: expenseIds } },
        select: {
          id: true,
          paymentMethod: true,
          bankAccount: { select: { id: true, name: true, bankName: true } },
          category:    { select: { id: true, name: true } },
        },
      });
      rows.forEach((e) => expenseMap.set(e.id, e));
    }

    return entries.map((entry) => {
      const linked =
        entry.referenceType === LedgerReferenceType.REVENUE
          ? revenueMap.get(entry.referenceId)
          : expenseMap.get(entry.referenceId);

      return {
        ...entry,
        // entry.amount is now Prisma.Decimal — explicitly override the spread value
        amount:        serializeDecimal(entry.amount),
        paymentMethod: linked?.paymentMethod ?? null,
        bankAccount:   linked?.bankAccount   ?? null,
        category:
          entry.referenceType === LedgerReferenceType.EXPENSE
            ? linked?.category ?? null
            : null,
      };
    });
  }

  // ─────────────────────────────────────────────
  // INVOICES
  // ─────────────────────────────────────────────

  /**
   * Generate the next sequential invoice number for the given year.
   * Format: INV-YYYY-NNNN  (e.g. INV-2026-0001)
   */
  private async generateInvoiceNo(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    year: number,
  ): Promise<string> {
    const prefix = `INV-${year}-`;
    const count = await tx.invoice.count({
      where: { invoiceNo: { startsWith: prefix } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.revenueId) {
      const revenue = await this.prisma.revenue.findUnique({
        where: { id: dto.revenueId },
        include: { invoice: { select: { id: true, invoiceNo: true } } },
      });
      if (!revenue) throw new NotFoundException('Revenue record not found');
      if (revenue.invoice) {
        throw new ConflictException(
          `Revenue is already linked to invoice ${revenue.invoice.invoiceNo}`,
        );
      }
    }

    // DTO items are plain JS numbers from JSON — arithmetic is safe
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.generateInvoiceNo(tx, new Date().getFullYear());

      return tx.invoice.create({
        data: {
          invoiceNo,
          projectId:     dto.projectId,
          clientName:    dto.clientName,
          clientAddress: dto.clientAddress ?? null,
          clientGSTIN:   dto.clientGSTIN   ?? null,
          issueDate:     new Date(dto.issueDate),
          dueDate:       new Date(dto.dueDate),
          notes:         dto.notes         ?? null,
          revenueId:     dto.revenueId     ?? null,
          totalAmount,
          createdById:   userId,
          items: {
            create: dto.items.map((item) => ({
              description: item.description,
              quantity:    item.quantity,
              unitPrice:   item.unitPrice,
              total:       item.quantity * item.unitPrice,
            })),
          },
        },
        include: INVOICE_INCLUDE_FULL,
      });
    });

    return serializeInvoice(invoice);
  }

  async getInvoices(query: QueryInvoiceDto) {
    const where: any = {};

    if (query.status)    where.status    = query.status;
    if (query.projectId) where.projectId = query.projectId;

    if (query.search) {
      where.OR = [
        { invoiceNo:   { contains: query.search, mode: 'insensitive' } },
        { clientName:  { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE_LIST,
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(serializeInvoice);
  }

  async getInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE_FULL,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return serializeInvoice(invoice);
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Invoice not found');

    if (existing.status === InvoiceStatus.PAID) {
      throw new BadRequestException('A PAID invoice cannot be modified');
    }

    // DTO items are plain JS numbers from JSON — arithmetic is safe
    let totalAmount: number | undefined;
    if (dto.items && dto.items.length > 0) {
      totalAmount = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.items && dto.items.length > 0) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceItem.createMany({
          data: dto.items.map((item) => ({
            invoiceId:   id,
            description: item.description,
            quantity:    item.quantity,
            unitPrice:   item.unitPrice,
            total:       item.quantity * item.unitPrice,
          })),
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(dto.clientName    !== undefined && { clientName:    dto.clientName }),
          ...(dto.clientAddress !== undefined && { clientAddress: dto.clientAddress }),
          ...(dto.clientGSTIN   !== undefined && { clientGSTIN:   dto.clientGSTIN }),
          ...(dto.issueDate     !== undefined && { issueDate:     new Date(dto.issueDate) }),
          ...(dto.dueDate       !== undefined && { dueDate:       new Date(dto.dueDate) }),
          ...(dto.status        !== undefined && { status:        dto.status }),
          ...(dto.notes         !== undefined && { notes:         dto.notes }),
          ...(totalAmount       !== undefined && { totalAmount }),
        },
        include: INVOICE_INCLUDE_FULL,
      });
    });

    return serializeInvoice(result);
  }

  async deleteInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true, invoiceNo: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException(
        `Invoice ${invoice.invoiceNo} is PAID and cannot be deleted`,
      );
    }

    await this.prisma.invoice.delete({ where: { id } });
    return { success: true, message: `Invoice ${invoice.invoiceNo} deleted` };
  }

  // ─────────────────────────────────────────────
  // PDF STORAGE
  // ─────────────────────────────────────────────

  async storePdf(id: string, pdfBuffer: Buffer): Promise<{ pdfPath: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, invoiceNo: true, pdfPath: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const safeName = invoice.invoiceNo.replace(/[^a-zA-Z0-9-]/g, '-');
    const filename = `${safeName}.pdf`;

    const invoiceDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const filePath = path.join(invoiceDir, filename);
    fs.writeFileSync(filePath, pdfBuffer);

    const pdfPath = `/uploads/invoices/${filename}`;

    await this.prisma.invoice.update({
      where: { id },
      data: { pdfPath },
    });

    return { pdfPath };
  }
}
