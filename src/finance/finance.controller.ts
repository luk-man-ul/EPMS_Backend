import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceService } from './finance.service';
import { CreateRevenueDto } from './dto/create-revenue.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryRevenueDto, QueryExpenseDto } from './dto/query-finance.dto';

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
  @ApiOperation({ summary: 'Create a revenue record' })
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
  @ApiOperation({ summary: 'Create an expense record' })
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
}
