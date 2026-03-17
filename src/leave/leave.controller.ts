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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { LeaveFilterDto } from './dto/leave-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Permissions('leave.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request' })
  @ApiResponse({ status: 201, description: 'Leave request submitted' })
  create(@Body() dto: CreateLeaveRequestDto, @Req() req) {
    return this.leaveService.create(dto, req.user.id);
  }

  @Permissions('leave.view')
  @Get('my')
  @ApiOperation({ summary: 'Get leave requests for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of leave requests' })
  getMyLeaveRequests(@Req() req) {
    return this.leaveService.findMyLeaveRequests(req.user.id);
  }

  @Permissions('leave.approve')
  @Get('pending-approvals')
  @ApiOperation({ summary: 'Get leave requests pending approval' })
  @ApiResponse({ status: 200, description: 'Returns pending leave requests' })
  getPendingApprovals(@Req() req) {
    return this.leaveService.findPendingApprovals(req.user);
  }

  @Permissions('leave.approve')
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a leave request' })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request approved' })
  approve(@Param('id') id: string, @Body() dto: ApproveLeaveDto, @Req() req) {
    return this.leaveService.approveLeave(id, req.user);
  }

  @Permissions('leave.approve')
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a leave request' })
  @ApiParam({ name: 'id', description: 'Leave request UUID' })
  @ApiResponse({ status: 200, description: 'Leave request rejected' })
  reject(@Param('id') id: string, @Body() dto: RejectLeaveDto, @Req() req) {
    return this.leaveService.rejectLeave(id, dto.reason, req.user);
  }

  @Permissions('leave.view')
  @Get()
  @ApiOperation({ summary: 'Get all leave requests with filters (Admin/Team Lead)' })
  @ApiResponse({ status: 200, description: 'Returns paginated leave requests' })
  findAll(@Query() filters: LeaveFilterDto, @Req() req) {
    return this.leaveService.findAll(filters, req.user);
  }
}
