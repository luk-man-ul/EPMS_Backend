import { IsDateString, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWfhRequestDto {
  @ApiProperty({ example: '2026-04-07', description: 'WFH start date (ISO date string)' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2026-04-09', description: 'WFH end date (ISO date string)' })
  @IsDateString()
  toDate: string;

  @ApiProperty({ example: 'Working on a focused deliverable from home', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
