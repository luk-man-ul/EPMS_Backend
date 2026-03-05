import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { LeaveFilterDto } from './dto/leave-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Permissions('leave.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeaveRequestDto, @Req() req) {
    return this.leaveService.create(dto, req.user.id);
  }

  @Permissions('leave.view')
  @Get('my')
  getMyLeaveRequests(@Req() req) {
    return this.leaveService.findMyLeaveRequests(req.user.id);
  }

  @Permissions('leave.approve')
  @Get('pending-approvals')
  getPendingApprovals(@Req() req) {
    return this.leaveService.findPendingApprovals(req.user);
  }

  @Permissions('leave.approve')
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string, @Body() dto: ApproveLeaveDto, @Req() req) {
    return this.leaveService.approveLeave(id, req.user);
  }

  @Permissions('leave.approve')
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: RejectLeaveDto, @Req() req) {
    return this.leaveService.rejectLeave(id, dto.reason, req.user);
  }

  @Permissions('leave.view')
  @Get()
  findAll(@Query() filters: LeaveFilterDto, @Req() req) {
    return this.leaveService.findAll(filters, req.user);
  }
}
