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

export class CreateRevenueDto {
  @ApiProperty({ example: 'uuid-of-project' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  receivedDate: string;

  @ApiPropertyOptional({ example: 'Q1 milestone payment' })
  @IsOptional()
  @IsString()
  description?: string;

  // ── New optional fields ──────────────────────────────────────────────────

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: 'ONLINE',
    description: 'Payment method used to receive this revenue',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 'cuid-of-bank-account',
    description: 'Bank account that received the payment (optional, typically used with ONLINE)',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string;
}
