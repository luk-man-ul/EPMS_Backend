import { IsEnum } from 'class-validator';
import { Priority } from '@prisma/client';

export class UpdateTicketPriorityDto {
  @IsEnum(Priority)
  priority: Priority;
}