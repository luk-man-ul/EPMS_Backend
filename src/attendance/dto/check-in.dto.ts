import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ example: 3.1390, description: 'Latitude (-90 to 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 101.6869, description: 'Longitude (-180 to 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}
