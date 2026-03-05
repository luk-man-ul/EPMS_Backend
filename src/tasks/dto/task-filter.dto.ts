import { IsOptional, IsEnum, IsUUID, IsNumberString } from 'class-validator'
import { TaskStatus, Priority, TaskType } from '@prisma/client'

export class TaskFilterDto {
  @IsOptional()
  @IsUUID()
  projectId?: string

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority

  @IsOptional()
  @IsUUID()
  assignedToId?: string

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType

  @IsOptional()
  @IsNumberString()
  page?: string

  @IsOptional()
  @IsNumberString()
  limit?: string
}
