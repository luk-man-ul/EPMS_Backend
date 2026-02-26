import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { TicketType, Priority } from '@prisma/client';

export class CreateTicketDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(TicketType)
  type: TicketType;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}