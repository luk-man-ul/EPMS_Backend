import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from 'src/auth/roles.guard'

@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

@Post()
createUser(
  @Body()
  body: {
    firstName: string
    lastName: string
    email: string
    password: string
    phone?: string
    designation?: string
    department?: string
    profilePhoto?: string
    joinedAt?: Date
    status?: any
  },
) {

    return this.usersService.createUser(body)
  }

  @Get()
  getAllUsers() {
    return this.usersService.getAllUsers()
  }

  @Patch(':id/promote')
  promoteToTeamLead(@Param('id') id: string) {
    return this.usersService.promoteToTeamLead(id)
  }

  @Patch(':id/demote')
  demoteToEmployee(@Param('id') id: string) {
    return this.usersService.demoteToEmployee(id)
  }

  @Patch(':id/deactivate')
  deactivateUser(@Param('id') id: string) {
    return this.usersService.deactivateUser(id)
  }

  @Patch(':id/activate')
activateUser(@Param('id') id: string) {
  return this.usersService.activateUser(id)
}

@Patch(':id')
updateUser(
  @Param('id') id: string,
  @Body()
  body: {
    firstName?: string
    lastName?: string
    phone?: string
    department?: string
    profilePhoto?: string
  },
) {
  return this.usersService.updateUser(id, body)
}


}
