import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { AttendanceFilterDto } from './dto/attendance-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Permissions('attendance.create')
  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check in with GPS coordinates' })
  @ApiResponse({ status: 200, description: 'Check-in recorded successfully' })
  checkIn(@Body() dto: CheckInDto, @Req() req) {
    return this.attendanceService.checkIn(req.user.id, dto.latitude, dto.longitude);
  }

  @Permissions('attendance.create')
  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check out from current session' })
  @ApiResponse({ status: 200, description: 'Check-out recorded successfully' })
  checkOut(@Req() req) {
    return this.attendanceService.checkOut(req.user.id);
  }

  @Permissions('attendance.view')
  @Get('my')
  @ApiOperation({ summary: 'Get attendance history for current user' })
  @ApiResponse({ status: 200, description: 'Returns attendance records' })
  getMyAttendance(@Query() filters: AttendanceFilterDto, @Req() req) {
    return this.attendanceService.findMyAttendance(req.user.id, filters);
  }

  @Permissions('attendance.view')
  @Get('today')
  @ApiOperation({ summary: "Get today's attendance status for current user" })
  @ApiResponse({ status: 200, description: "Returns today's attendance record" })
  getTodayAttendance(@Req() req) {
    return this.attendanceService.findTodayAttendance(req.user.id);
  }

  @Permissions('attendance.view')
  @Get('stats')
  @ApiOperation({ summary: 'Get attendance summary statistics (Admin/Team Lead)' })
  @ApiResponse({ status: 200, description: 'Returns aggregated attendance stats' })
  getStats(@Query() filters: AttendanceFilterDto, @Req() req) {
    return this.attendanceService.getStats(filters, req.user);
  }

  @Permissions('attendance.view')
  @Get()
  @ApiOperation({ summary: 'Get all attendance records with filters (Admin/Team Lead)' })
  @ApiResponse({ status: 200, description: 'Returns paginated attendance records' })
  findAll(@Query() filters: AttendanceFilterDto, @Req() req) {
    return this.attendanceService.findAll(filters, req.user);
  }

  @Permissions('attendance.admin')
  @Post('admin/midnight-auto-checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger midnight auto-checkout for all open sessions (Admin)' })
  @ApiResponse({ status: 200, description: 'Auto-checkout completed' })
  midnightAutoCheckout() {
    return this.attendanceService.midnightAutoCheckout();
  }

  @Permissions('attendance.admin')
  @Post('admin/auto-checkout-long-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-checkout sessions exceeding max duration (Admin)' })
  @ApiResponse({ status: 200, description: 'Long sessions checked out' })
  autoCheckoutLongSessions() {
    return this.attendanceService.autoCheckoutLongSessions();
  }
}
