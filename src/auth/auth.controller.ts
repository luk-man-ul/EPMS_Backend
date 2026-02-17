import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { Roles } from './roles.decorator'
import { RolesGuard } from './roles.guard'

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 🔐 LOGIN
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password)
  }

  // 🔒 Any logged-in user
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: any) {
    return {
      message: 'Authenticated user',
      user: req.user,
    }
  }

  // 👨‍💼 ADMIN ONLY
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin-only')
  adminRoute() {
    return { message: 'Only ADMIN can access this route' }
  }

  // 👨‍💼 TEAM LEAD ONLY
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEAM_LEAD')
  @Get('teamlead-only')
  teamLeadRoute() {
    return { message: 'Only TEAM LEAD can access this route' }
  }

  // 👨‍💻 EMPLOYEE ONLY
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE')
  @Get('employee-only')
  employeeRoute() {
    return { message: 'Only EMPLOYEE can access this route' }
  }
}
