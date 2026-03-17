import { IsEnum, IsDateString, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: ['SICK', 'CASUAL', 'VACATION', 'UNPAID'], example: 'SICK' })
  @IsEnum(['SICK', 'CASUAL', 'VACATION', 'UNPAID'])
  type: string;

  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-03' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'Feeling unwell', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
