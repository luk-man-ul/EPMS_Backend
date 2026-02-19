import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  ////////////////////////////////////////////////////////////
  // CREATE USER
  ////////////////////////////////////////////////////////////

  @Permissions('employees.create')
  @Post()
  createUser(@Body() body: any, @Req() req: any) {
    return this.usersService.createUser(body, req.user);
  }

  ////////////////////////////////////////////////////////////
  // GET ALL USERS
  ////////////////////////////////////////////////////////////

  @Permissions('employees.view')
  @Get()
  getAllUsers(@Req() req: any) {
    return this.usersService.getAllUsers(req.user);
  }

  ////////////////////////////////////////////////////////////
  // PROMOTE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/promote')
  promoteToTeamLead(@Param('id') id: string, @Req() req: any) {
    return this.usersService.promoteToTeamLead(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // DEMOTE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/demote')
  demoteToEmployee(@Param('id') id: string, @Req() req: any) {
    return this.usersService.demoteToEmployee(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // DEACTIVATE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/deactivate')
  deactivateUser(@Param('id') id: string, @Req() req: any) {
    return this.usersService.deactivateUser(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // ACTIVATE
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id/activate')
  activateUser(@Param('id') id: string, @Req() req: any) {
    return this.usersService.activateUser(id, req.user);
  }

  ////////////////////////////////////////////////////////////
  // UPDATE USER
  ////////////////////////////////////////////////////////////

  @Permissions('employees.update')
  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.usersService.updateUser(id, body, req.user);
  }
}
