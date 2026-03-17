import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketPriorityDto } from './dto/update-ticket-priority.dto';
import { TicketFilterDto } from './dto/ticket-filter.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  ////////////////////////////////////////////////////////////////
  // CREATE TICKET
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.create')
  @Post()
  @ApiOperation({ summary: 'Create a new ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created successfully' })
  create(@Req() req, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(req.user, dto);
  }

  ////////////////////////////////////////////////////////////////
  // GET ALL TICKETS (ROLE VISIBILITY CONTROLLED IN SERVICE)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.view')
  @Get()
  @ApiOperation({ summary: 'Get all tickets (role-filtered)' })
  @ApiResponse({ status: 200, description: 'Returns paginated list of tickets' })
  findAll(@Req() req, @Query() filter: TicketFilterDto) {
    return this.ticketsService.findAll(req.user, filter);
  }

  ////////////////////////////////////////////////////////////////
  // GET SINGLE TICKET
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.view')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single ticket by ID' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Returns ticket details' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.ticketsService.findOne(req.user, id);
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE TICKET (REPORTER CAN UPDATE THEIR OWN TICKETS)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.update')
  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket details' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket updated successfully' })
  update(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(req.user, id, dto);
  }

  ////////////////////////////////////////////////////////////////
  // ASSIGN TICKET (ADMIN ONLY)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.assign')
  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign ticket to a user (Admin only)' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket assigned successfully' })
  assign(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.ticketsService.assign(req.user, id, dto);
  }

  ////////////////////////////////////////////////////////////////
  // SELF-ASSIGN TICKET (EMPLOYEE CAN ASSIGN TO THEMSELVES)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.self_assign')
  @Patch(':id/self-assign')
  @ApiOperation({ summary: 'Self-assign a ticket to the current user' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket self-assigned successfully' })
  selfAssign(@Req() req, @Param('id') id: string) {
    return this.ticketsService.selfAssign(req.user, id);
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE PRIORITY (ADMIN ONLY)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.update.priority')
  @Patch(':id/priority')
  @ApiOperation({ summary: 'Update ticket priority (Admin only)' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket priority updated' })
  updatePriority(
    @Param('id') id: string,
    @Body() dto: UpdateTicketPriorityDto,
  ) {
    return this.ticketsService.updatePriority(id, dto);
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE STATUS (WORKFLOW ENFORCED IN SERVICE)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.update.status')
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update ticket status (workflow enforced)' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket status updated' })
  updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateStatus(req.user, id, dto);
  }

  ////////////////////////////////////////////////////////////////
  // SOFT DELETE (ADMIN ONLY)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.delete')
  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a ticket (Admin only)' })
  @ApiParam({ name: 'id', description: 'Ticket UUID' })
  @ApiResponse({ status: 200, description: 'Ticket deleted successfully' })
  remove(
    @Req() req,
    @Param('id') id: string,
  ) {
    return this.ticketsService.remove(req.user, id);
  }
}
