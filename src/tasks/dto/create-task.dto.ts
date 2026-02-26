import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsNumber } from 'class-validator'
import { Priority, TaskStatus } from '@prisma/client'

export class CreateTaskDto {
  @IsUUID()
  projectId: string

  @IsString()
  title: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus

  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsNumber()
  estimatedHrs?: number
}