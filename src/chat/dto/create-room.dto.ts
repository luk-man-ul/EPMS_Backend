import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';

export enum ChatRoomType {
  COMPANY = 'COMPANY',
  TEAM = 'TEAM',
  PROJECT = 'PROJECT',
  DIRECT = 'DIRECT',
}

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
