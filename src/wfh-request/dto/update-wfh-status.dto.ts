import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWfhStatusDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}
