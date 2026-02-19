import { IsString, IsOptional, IsDateString, IsArray, IsUUID, IsNumber, ArrayNotEmpty } from 'class-validator'

export class CreateProjectDto {
  @IsString()
  name: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsNumber()
  budget?: number

  @IsUUID()
  leadId: string

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  memberIds: string[]
}
