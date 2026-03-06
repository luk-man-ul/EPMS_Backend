import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Permissions('attendance.create')
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  checkIn(@Body() dto: CheckInDto, @Req() req) {
    return this.attendanceService.checkIn(req.user.id, dto.latitude, dto.longitude);
  }

  @Permissions('attendance.create')
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  checkOut(@Req() req) {
    return this.attendanceService.checkOut(req.user.id);
  }

  @Permissions('attendance.view')
  @Get('my')
  getMyAttendance(@Req() req) {
    return this.attendanceService.findMyAttendance(req.user.id);
  }

  @Permissions('attendance.view')
  @Get('today')
  getTodayAttendance(@Req() req) {
    return this.attendanceService.findTodayAttendance(req.user.id);
  }

  @Permissions('attendance.view')
  @Get()
  findAll(@Query() filters: AttendanceFilterDto, @Req() req) {
    return this.attendanceService.findAll(filters, req.user);
  }
}
