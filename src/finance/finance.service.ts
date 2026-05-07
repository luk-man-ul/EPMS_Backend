import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, LedgerEntryType, LedgerReferenceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { CreateRevenueDto } from './dto/create-revenue.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryRevenueDto, QueryExpenseDto, QueryLedgerDto, QueryInvoiceDto } from './dto/query-finance.dto';

// ── Helper: check if a category name represents a salary expense ──────────────
// Uses case-insensitive comparison so "Salary", "SALARY", "salary" all match.
const isSalaryCategory = (name?: string | null): boolean =>
  name?.toLowerCase() === 'salary';

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
    // Validate project
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Validate bank account if provided
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
          amount:        revenue.amount,
          date:          revenue.receivedDate,
          description:   revenue.description ?? `Revenue: ${project.name}`,
          createdById:   userId,
        },
      });

      return revenue;
    });

    return result;
  }

  async getRevenues(query: QueryRevenueDto) {
    const where: any = {};

    if (query.projectId) where.projectId = query.projectId;

    if (query.startDate || query.endDate) {
      where.receivedDate = {};
      if (query.startDate) where.receivedDate.gte = new Date(query.startDate);
      if (query.endDate)   where.receivedDate.lte = new Date(query.endDate);
    }

    return this.prisma.revenue.findMany({
      where,
      include: REVENUE_INCLUDE,
      orderBy: { receivedDate: 'desc' },
    });
  }

  // ─────────────────────────────────────────────
  // EXPENSE
  // ─────────────────────────────────────────────

  async createExpense(dto: CreateExpenseDto, userId: string) {
    // Resolve the category first — needed for salary detection
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    if (!category.isActive) throw new BadRequestException('Expense category is inactive');

    // Salary expenses require an employee
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
          amount:        expense.amount,
          date:          expense.expenseDate,
          description:   expense.description ?? `Expense: ${category.name}`,
          createdById:   userId,
        },
      });

      return expense;
    });

    return result;
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

    return this.prisma.expense.findMany({
      where,
      include: EXPENSE_INCLUDE,
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

    // Sum all expenses for this employee whose category name is "Salary"
    // (case-insensitive via the isSalaryCategory helper at the top of this file).
    // We join through the category relation and filter by name.
    const agg = await this.prisma.expense.aggregate({
      where: {
        employeeId,
        category: { name: { equals: 'Salary', mode: 'insensitive' } },
      },
      _sum: { amount: true },
    });

    return {
      employeeId,
      totalSalary: agg._sum.amount ?? 0,
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

    // Use explicit any maps — Prisma select return types are complex generics
    // that don't unify cleanly with conditional empty arrays.
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
   * Runs inside the caller's transaction so the count is consistent.
   */
  private async generateInvoiceNo(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    year: number,
  ): Promise<string> {
    const prefix = `INV-${year}-`;

    // Count existing invoices whose number starts with this year prefix.
    // Using count is safe because invoiceNo has a @unique constraint —
    // a concurrent insert with the same number will fail and the transaction
    // will be retried by the caller if needed.
    const count = await tx.invoice.count({
      where: { invoiceNo: { startsWith: prefix } },
    });

    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    // ── Pre-transaction validations ──────────────────────────────────────────

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

    // ── Compute total from items (never trust frontend) ──────────────────────
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    // ── Atomic: invoice + items in one transaction ───────────────────────────
    return this.prisma.$transaction(async (tx) => {
      const invoiceNo = await this.generateInvoiceNo(tx, new Date().getFullYear());

      const invoice = await tx.invoice.create({
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
          // status defaults to DRAFT per schema
          // pdfPath is null until PDF generation is implemented
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

      return invoice;
    });
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

    return this.prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE_LIST,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: INVOICE_INCLUDE_FULL,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto) {
    // ── Fetch current invoice ────────────────────────────────────────────────
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Invoice not found');

    // Cannot update a PAID invoice at all
    if (existing.status === InvoiceStatus.PAID) {
      throw new BadRequestException('A PAID invoice cannot be modified');
    }

    // ── Compute new total if items are being replaced ────────────────────────
    let totalAmount: number | undefined;
    if (dto.items && dto.items.length > 0) {
      totalAmount = dto.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
    }

    // ── Atomic update ────────────────────────────────────────────────────────
    return this.prisma.$transaction(async (tx) => {
      // Replace items only when a new items array is provided
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

    // InvoiceItems are deleted via CASCADE (schema: onDelete: Cascade)
    // Revenue record is NOT deleted — only the link is severed by deleting the invoice
    await this.prisma.invoice.delete({ where: { id } });

    return { success: true, message: `Invoice ${invoice.invoiceNo} deleted` };
  }

  // ─────────────────────────────────────────────
  // PDF STORAGE
  // ─────────────────────────────────────────────

  /**
   * Receives a PDF buffer from the frontend, saves it to
   * uploads/invoices/{invoiceNo}.pdf, updates Invoice.pdfPath,
   * and returns the stored path.
   *
   * Safe to call multiple times — overwrites the existing file.
   */
  async storePdf(id: string, pdfBuffer: Buffer): Promise<{ pdfPath: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, invoiceNo: true, pdfPath: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // Sanitize filename: only alphanumeric + hyphens
    const safeName = invoice.invoiceNo.replace(/[^a-zA-Z0-9-]/g, '-');
    const filename = `${safeName}.pdf`;

    // Ensure the invoices subdirectory exists
    const invoiceDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    const filePath = path.join(invoiceDir, filename);

    // Write (overwrite if exists — safe regeneration)
    fs.writeFileSync(filePath, pdfBuffer);

    const pdfPath = `/uploads/invoices/${filename}`;

    // Persist path on the invoice record
    await this.prisma.invoice.update({
      where: { id },
      data: { pdfPath },
    });

    return { pdfPath };
  }
}
