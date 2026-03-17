import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { TicketType, Priority } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: 'uuid-of-task' })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty({ example: 'Login button not working' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Clicking the login button does nothing on mobile Safari' })
  @IsString()
  description: string;

  @ApiProperty({ enum: TicketType, example: 'BUG' })
  @IsEnum(TicketType)
  type: TicketType;

  @ApiPropertyOptional({ enum: Priority, example: 'HIGH' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ example: 'uuid-of-assignee' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}