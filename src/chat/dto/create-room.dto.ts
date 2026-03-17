import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ChatRoomType {
  COMPANY = 'COMPANY',
  TEAM = 'TEAM',
  PROJECT = 'PROJECT',
  DIRECT = 'DIRECT',
}

export class CreateRoomDto {
  @ApiProperty({ example: 'General' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ChatRoomType, example: 'TEAM' })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional({ example: 'uuid-of-project' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ example: ['uuid-member-1', 'uuid-member-2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
