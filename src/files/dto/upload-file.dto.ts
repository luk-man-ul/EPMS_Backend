import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum EntityType {
  TASK = 'task',
  TICKET = 'ticket',
  PROJECT = 'project',
  CHAT = 'chat',
}

export class UploadFileDto {
  @ApiProperty({ enum: EntityType, example: 'task' })
  @IsEnum(EntityType)
  entityType: EntityType;

  @ApiProperty({ example: 'uuid-of-entity' })
  @IsString()
  entityId: string;
}
