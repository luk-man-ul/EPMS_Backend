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
import { WfhRequestService } from './wfh-request.service';
import { CreateWfhRequestDto } from './dto/create-wfh-request.dto';
import { UpdateWfhStatusDto } from './dto/update-wfh-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('wfh-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('wfh-requests')
export class WfhRequestController {
  constructor(private readonly wfhRequestService: WfhRequestService) {}

  ////////////////////////////////////////////////////////////
  // EMPLOYEE: Submit a WFH request
  ////////////////////////////////////////////////////////////

  @Permissions('attendance.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a WFH request' })
  @ApiResponse({ status: 201, description: 'WFH request submitted' })
  @ApiResponse({ status: 400, description: 'Overlapping request or invalid dates' })
  create(@Body() dto: CreateWfhRequestDto, @Req() req) {
    return this.wfhRequestService.createRequest(req.user.id, dto);
  }

  ////////////////////////////////////////////////////////////
  // EMPLOYEE: View own WFH requests
  ////////////////////////////////////////////////////////////

  @Permissions('attendance.view')
  @Get('my')
  @ApiOperation({ summary: 'Get WFH requests for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of WFH requests' })
  getMyRequests(@Req() req) {
    return this.wfhRequestService.getMyRequests(req.user.id);
  }

  ////////////////////////////////////////////////////////////
  // ADMIN / TEAM LEAD: View pending requests
  ////////////////////////////////////////////////////////////

  @Permissions('leave.approve')
  @Get('pending')
  @ApiOperation({ summary: 'Get all pending WFH requests (Admin/Team Lead)' })
  @ApiResponse({ status: 200, description: 'Returns pending WFH requests' })
  getPendingRequests(@Req() req) {
    return this.wfhRequestService.getPendingRequests(req.user);
  }

  ////////////////////////////////////////////////////////////
  // ADMIN / TEAM LEAD: Approve or reject a request
  ////////////////////////////////////////////////////////////

  @Permissions('leave.approve')
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a WFH request' })
  @ApiParam({ name: 'id', description: 'WFH request UUID' })
  @ApiResponse({ status: 200, description: 'WFH request status updated' })
  @ApiResponse({ status: 400, description: 'Request already processed' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateWfhStatusDto,
    @Req() req,
  ) {
    return this.wfhRequestService.updateRequestStatus(id, req.user, dto.status);
  }

  ////////////////////////////////////////////////////////////
  // ADMIN / TEAM LEAD: View all requests with filters
  ////////////////////////////////////////////////////////////

  @Permissions('attendance.viewAll')
  @Get()
  @ApiOperation({ summary: 'Get all WFH requests with filters (Admin/Team Lead)' })
  @ApiResponse({ status: 200, description: 'Returns paginated WFH requests' })
  findAll(@Query() filters: any, @Req() req) {
    return this.wfhRequestService.getAllRequests(filters, req.user);
  }
}
