import { IsString, IsNumber, IsPositive, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InvoiceItemDto {
  @ApiProperty({ example: 'Frontend development — 40 hrs' })
  @IsString()
  description: string;

  @ApiProperty({ example: 40, description: 'Quantity (hours, units, etc.) — must be > 0' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 1500, description: 'Unit price — must be >= 0' })
  @IsNumber()
  @Min(0)
  unitPrice: number;
}
