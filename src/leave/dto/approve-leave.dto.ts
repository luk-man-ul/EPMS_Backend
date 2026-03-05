import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveLeaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comments?: string;
}
