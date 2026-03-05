import { IsEnum, IsDateString, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @IsEnum(['SICK', 'CASUAL', 'VACATION', 'UNPAID'])
  type: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
