import {
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceItemDto } from './invoice-item.dto';

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ example: 'Acme Corporation' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ example: '123 Business Park, Mumbai 400001' })
  @IsOptional()
  @IsString()
  clientAddress?: string;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5' })
  @IsOptional()
  @IsString()
  clientGSTIN?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    enum: InvoiceStatus,
    example: 'SENT',
    description: 'Update invoice status. Cannot change status of a PAID invoice.',
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ example: 'Payment due within 30 days.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [InvoiceItemDto],
    description:
      'Replace all line items. If provided, must contain at least one item. ' +
      'totalAmount is recomputed from the new items.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items?: InvoiceItemDto[];
}
