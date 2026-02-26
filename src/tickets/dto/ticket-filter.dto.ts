import { IsOptional, IsEnum, IsUUID, IsNumberString } from 'class-validator';
import { TicketStatus, Priority } from '@prisma/client';

export class TicketFilterDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  // 🔥 ADD THIS
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}