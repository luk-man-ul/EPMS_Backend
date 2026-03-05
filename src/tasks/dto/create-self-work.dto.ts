import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsNumber, MinLength } from 'class-validator'
import { Priority } from '@prisma/client'

export class CreateSelfWorkDto {
  @IsUUID()
  projectId: string

  @IsString()
  @MinLength(3)
  title: string

  @IsString()
  @MinLength(10)
  description: string

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsNumber()
  estimatedHrs?: number
}
