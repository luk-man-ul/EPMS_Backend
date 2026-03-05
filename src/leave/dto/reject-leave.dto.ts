import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectLeaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
