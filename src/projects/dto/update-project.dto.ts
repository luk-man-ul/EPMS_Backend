import { PartialType } from '@nestjs/mapped-types'
import { CreateProjectDto } from './create-project.dto'
import { IsOptional, IsEnum } from 'class-validator'

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus

}