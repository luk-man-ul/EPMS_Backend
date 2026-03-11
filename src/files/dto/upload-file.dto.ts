import { IsString, IsEnum } from 'class-validator';

export enum EntityType {
  TASK = 'task',
  TICKET = 'ticket',
  PROJECT = 'project',
  CHAT = 'chat',
}

export class UploadFileDto {
  @IsEnum(EntityType)
  entityType: EntityType;

  @IsString()
  entityId: string;
}
