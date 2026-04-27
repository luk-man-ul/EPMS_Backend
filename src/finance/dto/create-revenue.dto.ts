import { IsString, IsNumber, IsDateString, IsOptional, IsUUID, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
