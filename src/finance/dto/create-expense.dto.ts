import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsUUID,
  IsPositive,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseType, PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseType, example: 'MANUAL' })
  @IsEnum(ExpenseType)
  type: ExpenseType;

  @ApiProperty({ example: 8500 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  expenseDate: string;

  @ApiPropertyOptional({ example: 'uuid-of-employee' })
  @IsOptional()
  @ValidateIf((o) => o.type === ExpenseType.SALARY)
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: 'Monthly AWS hosting' })
  @IsOptional()
  @IsString()
  description?: string;

  // ── New optional fields ──────────────────────────────────────────────────

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: 'CASH',
    description: 'Payment method used for this expense',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 'cuid-of-bank-account',
    description: 'Bank account used to pay this expense',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @ApiPropertyOptional({
    example: 'cuid-of-expense-category',
    description: 'Expense category (Travel, Food, Salary, Miscellaneous, etc.)',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
