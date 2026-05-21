import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseCategoryDto {
  @ApiProperty({
    example: 'Office Supplies',
    description: 'Display name for the expense category (must be unique, case-insensitive)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
