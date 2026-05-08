import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceService } from './finance.service';
import { CreateRevenueDto } from './dto/create-revenue.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryRevenueDto, QueryExpenseDto, QueryLedgerDto, QueryInvoiceDto } from './dto/query-finance.dto';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private assertAdmin(user: any) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can access finance data');
    }
  }

  // ─────────────────────────────────────────────
  // REVENUE
  // ─────────────────────────────────────────────

  @Post('revenue')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a revenue record (auto-generates a CREDIT ledger entry)' })
  @ApiResponse({ status: 201, description: 'Revenue record created' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  createRevenue(@Body() dto: CreateRevenueDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.createRevenue(dto, req.user.id);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get all revenue records' })
  @ApiResponse({ status: 200, description: 'Returns list of revenue records' })
  getRevenues(@Query() query: QueryRevenueDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getRevenues(query);
  }

  // ─────────────────────────────────────────────
  // EXPENSE
  // ─────────────────────────────────────────────

  @Post('expense')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an expense record (auto-generates a DEBIT ledger entry)' })
  @ApiResponse({ status: 201, description: 'Expense record created' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  createExpense(@Body() dto: CreateExpenseDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.createExpense(dto, req.user.id);
  }

  @Get('expense')
  @ApiOperation({ summary: 'Get all expense records' })
  @ApiResponse({ status: 200, description: 'Returns list of expense records' })
  getExpenses(@Query() query: QueryExpenseDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getExpenses(query);
  }

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get overall finance summary' })
  @ApiResponse({ status: 200, description: 'Returns totalRevenue, totalExpense, profit' })
  getSummary(@Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getSummary();
  }

  // ─────────────────────────────────────────────
  // BANK ACCOUNTS
  // ─────────────────────────────────────────────

  @Get('bank-accounts')
  @ApiOperation({ summary: 'Get all active bank accounts' })
  @ApiResponse({ status: 200, description: 'Returns list of active bank accounts' })
  getBankAccounts(@Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getBankAccounts();
  }

  // ─────────────────────────────────────────────
  // EXPENSE CATEGORIES
  // ─────────────────────────────────────────────

  @Get('expense-categories')
  @ApiOperation({ summary: 'Get all active expense categories' })
  @ApiResponse({ status: 200, description: 'Returns list of active expense categories' })
  getExpenseCategories(@Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getExpenseCategories();
  }

  // ─────────────────────────────────────────────
  // LEDGER  (read-only — entries are backend-generated only)
  // ─────────────────────────────────────────────

  @Get('ledger')
  @ApiOperation({
    summary: 'Get ledger entries',
    description:
      'Returns auto-generated ledger entries. Ledger entries are created automatically ' +
      'when revenue or expense records are created. There is no manual create endpoint.',
  })
  @ApiResponse({ status: 200, description: 'Returns list of ledger entries, newest first' })
  getLedger(@Query() query: QueryLedgerDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getLedger(query);
  }

  // ─────────────────────────────────────────────
  // PROJECT PROFIT AGGREGATE (must be before :projectId)
  // ─────────────────────────────────────────────

  @Get('projects/summary')
  @ApiOperation({ summary: 'Get aggregated profit summary for all projects' })
  @ApiResponse({ status: 200, description: 'Returns all projects ranked by profit' })
  getAllProjectsProfit(@Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getAllProjectsProfit();
  }

  // ─────────────────────────────────────────────
  // PROJECT PROFIT
  // ─────────────────────────────────────────────

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get revenue, expense, and profit for a project' })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({ status: 200, description: 'Returns project finance breakdown' })
  getProjectProfit(@Param('projectId') projectId: string, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getProjectProfit(projectId);
  }

  // ─────────────────────────────────────────────
  // EMPLOYEE COST AGGREGATE (must be before :employeeId)
  // ─────────────────────────────────────────────

  @Get('employees/summary')
  @ApiOperation({ summary: 'Get aggregated salary cost summary for all employees' })
  @ApiResponse({ status: 200, description: 'Returns all employees ranked by total salary' })
  getAllEmployeesCost(@Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getAllEmployeesCost();
  }

  // ─────────────────────────────────────────────
  // EMPLOYEE COST
  // ─────────────────────────────────────────────

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Get total salary cost for an employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Returns total salary expense' })
  getEmployeeCost(@Param('employeeId') employeeId: string, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getEmployeeCost(employeeId);
  }

  // ─────────────────────────────────────────────
  // INVOICES
  // ─────────────────────────────────────────────

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an invoice',
    description:
      'Creates an invoice with line items. totalAmount is computed server-side ' +
      'from items — any client-supplied totalAmount is ignored. ' +
      'Invoice number is auto-generated as INV-YYYY-NNNN.',
  })
  @ApiResponse({ status: 201, description: 'Invoice created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Project or revenue not found' })
  @ApiResponse({ status: 409, description: 'Revenue already linked to another invoice' })
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.createInvoice(dto, req.user.id);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get all invoices', description: 'Supports filtering by status, projectId, and free-text search on invoiceNo / clientName.' })
  @ApiResponse({ status: 200, description: 'Returns list of invoices with items' })
  getInvoices(@Query() query: QueryInvoiceDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getInvoices(query);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get a single invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice cuid' })
  @ApiResponse({ status: 200, description: 'Returns full invoice with items, revenue, and project' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  getInvoiceById(@Param('id') id: string, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.getInvoiceById(id);
  }

  @Patch('invoices/:id')
  @ApiOperation({
    summary: 'Update an invoice',
    description:
      'Updates client info, dates, notes, status, or line items. ' +
      'If items are provided, all existing items are replaced and totalAmount is recomputed. ' +
      'PAID invoices cannot be modified.',
  })
  @ApiParam({ name: 'id', description: 'Invoice cuid' })
  @ApiResponse({ status: 200, description: 'Invoice updated' })
  @ApiResponse({ status: 400, description: 'Cannot modify a PAID invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  updateInvoice(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.updateInvoice(id, dto);
  }

  @Delete('invoices/:id')
  @ApiOperation({
    summary: 'Delete an invoice',
    description: 'Deletes the invoice and its items. Cannot delete a PAID invoice. Does NOT delete the linked revenue record.',
  })
  @ApiParam({ name: 'id', description: 'Invoice cuid' })
  @ApiResponse({ status: 200, description: 'Invoice deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete a PAID invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  deleteInvoice(@Param('id') id: string, @Req() req) {
    this.assertAdmin(req.user);
    return this.financeService.deleteInvoice(id);
  }

  // ─────────────────────────────────────────────
  // PDF STORAGE
  // ─────────────────────────────────────────────

  @Post('invoices/:id/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Store a generated invoice PDF',
    description:
      'Receives a PDF file generated by the frontend, saves it to ' +
      'uploads/invoices/{invoiceNo}.pdf, and updates Invoice.pdfPath. ' +
      'Safe to call multiple times — overwrites the existing file.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiParam({ name: 'id', description: 'Invoice cuid' })
  @ApiResponse({ status: 200, description: 'PDF stored, returns { pdfPath }' })
  @ApiResponse({ status: 400, description: 'No file uploaded or wrong type' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),   // keep in memory — we write it ourselves
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Only PDF files are accepted'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
    }),
  )
  storePdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    this.assertAdmin(req.user);
    if (!file) throw new BadRequestException('No PDF file uploaded');
    return this.financeService.storePdf(id, file.buffer);
  }
}
