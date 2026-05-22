import {
  IsString,
  IsDateString,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceItemDto } from './invoice-item.dto';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'uuid-of-project' })
  @IsString()
  projectId: string;

  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  clientName: string;

  @ApiPropertyOptional({ example: '123 Business Park, Mumbai 400001' })
  @IsOptional()
  @IsString()
  clientAddress?: string;

  @ApiPropertyOptional({ example: '22AAAAA0000A1Z5', description: 'Client GST Identification Number' })
  @IsOptional()
  @IsString()
  clientGSTIN?: string;

  @ApiProperty({ example: '2026-05-01', description: 'Invoice issue date' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2026-05-31', description: 'Invoice due date' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ example: 'Payment due within 30 days.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'cuid-of-revenue',
    description: 'Link this invoice to an existing revenue record (one-to-one)',
  })
  @IsOptional()
  @IsString()
  revenueId?: string;

  @ApiPropertyOptional({
    example: 18,
    description:
      'GST percentage to apply on the subtotal (e.g. 18 for 18%). ' +
      'If omitted or 0, no tax is applied and totalAmount = subtotal.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage?: number;

  @ApiProperty({
    type: [InvoiceItemDto],
    description: 'Line items — at least one required. subtotal/taxAmount/totalAmount are computed server-side.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}
