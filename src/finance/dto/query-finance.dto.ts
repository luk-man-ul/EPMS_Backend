import { IsOptional, IsUUID, IsDateString, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseType, InvoiceStatus, LedgerEntryType, LedgerReferenceType } from '@prisma/client';

export class QueryRevenueDto {
  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class QueryExpenseDto {
  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-employee' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: ExpenseType })
  @IsOptional()
  @IsEnum(ExpenseType)
  type?: ExpenseType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class QueryLedgerDto {
  @ApiPropertyOptional({ enum: LedgerEntryType, description: 'Filter by CREDIT or DEBIT' })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  type?: LedgerEntryType;

  @ApiPropertyOptional({ enum: LedgerReferenceType, description: 'Filter by REVENUE or EXPENSE' })
  @IsOptional()
  @IsEnum(LedgerReferenceType)
  referenceType?: LedgerReferenceType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class QueryInvoiceDto {
  @ApiPropertyOptional({ enum: InvoiceStatus, description: 'Filter by invoice status' })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: 'uuid-of-project', description: 'Filter by project' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ example: 'Acme', description: 'Search by client name or invoice number' })
  @IsOptional()
  @IsString()
  search?: string;
}
