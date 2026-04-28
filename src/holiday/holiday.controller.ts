import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { HolidayService } from './holiday.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('holidays')
export class HolidayController {
  constructor(private readonly holidayService: HolidayService) {}

  @Permissions('attendance.admin')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new holiday (admin only)' })
  @ApiResponse({ status: 201, description: 'Holiday created' })
  @ApiResponse({ status: 409, description: 'Holiday already exists on this date' })
  create(@Body() dto: CreateHolidayDto) {
    return this.holidayService.createHoliday(dto);
  }

  @Permissions('attendance.admin')
  @Get()
  @ApiOperation({ summary: 'Get all holidays ordered by date (admin only)' })
  @ApiResponse({ status: 200, description: 'Returns all holidays' })
  findAll() {
    return this.holidayService.getAllHolidays();
  }

  @Permissions('attendance.admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a holiday by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'Holiday UUID' })
  @ApiResponse({ status: 200, description: 'Holiday deleted' })
  @ApiResponse({ status: 404, description: 'Holiday not found' })
  remove(@Param('id') id: string) {
    return this.holidayService.deleteHoliday(id);
  }
}
