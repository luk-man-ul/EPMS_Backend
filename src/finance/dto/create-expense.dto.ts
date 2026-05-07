import {
  IsString,
  IsNumber,
  IsDateString,
  IsOptional,
  IsUUID,
  IsPositive,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ example: 8500 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  expenseDate: string;

  @ApiProperty({
    example: 'cuid-of-expense-category',
    description:
      'Expense category (required). Use GET /finance/expense-categories to list options. ' +
      'Select the "Salary" category for employee salary expenses — this triggers employee validation.',
  })
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({
    example: 'uuid-of-employee',
    description: 'Required when the selected category is "Salary"',
  })
  @IsOptional()
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
}
