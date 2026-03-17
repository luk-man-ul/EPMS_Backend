import { IsString, IsOptional, IsDateString, IsArray, IsUUID, IsNumber, ArrayNotEmpty } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateProjectDto {
  @ApiProperty({ example: 'Website Redesign' })
  @IsString()
  name: string

  @ApiPropertyOptional({ example: 'Redesign the company website' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  budget?: number

  @ApiProperty({ example: 'uuid-of-team-lead' })
  @IsUUID()
  leadId: string

  @ApiProperty({ example: ['uuid-member-1', 'uuid-member-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  memberIds: string[]
}
