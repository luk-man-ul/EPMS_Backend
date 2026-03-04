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

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  ////////////////////////////////////////////////////////////////
  // CREATE TICKET
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.create')
  @Post()
  create(@Req() req, @Body() dto: CreateTicketDto) {
  return this.ticketsService.create(req.user, dto);
}

  ////////////////////////////////////////////////////////////////
  // GET ALL TICKETS (ROLE VISIBILITY CONTROLLED IN SERVICE)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.view')
  @Get()
  findAll(@Req() req, @Query() filter: TicketFilterDto) {
    return this.ticketsService.findAll(req.user, filter);
  }

  ////////////////////////////////////////////////////////////////
  // GET SINGLE TICKET
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.view')
  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.ticketsService.findOne(req.user, id);
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE TICKET (REPORTER CAN UPDATE THEIR OWN TICKETS)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.update')
  @Patch(':id')
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
  selfAssign(@Req() req, @Param('id') id: string) {
    return this.ticketsService.selfAssign(req.user, id);
  }

  ////////////////////////////////////////////////////////////////
  // UPDATE PRIORITY (ADMIN ONLY)
  ////////////////////////////////////////////////////////////////

  @Permissions('tickets.update.priority')
  @Patch(':id/priority')
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
remove(
  @Req() req,
  @Param('id') id: string,
) {
  return this.ticketsService.remove(req.user, id);
}
}