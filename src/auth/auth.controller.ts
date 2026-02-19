import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  ////////////////////////////////////////////////////////////
  // LOGIN (PUBLIC ROUTE)
  ////////////////////////////////////////////////////////////

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  ////////////////////////////////////////////////////////////
  // PROFILE (PROTECTED ROUTE)
  ////////////////////////////////////////////////////////////

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req: any) {
    return {
      message: 'Authenticated user',
      user: req.user,
    };
  }
}
