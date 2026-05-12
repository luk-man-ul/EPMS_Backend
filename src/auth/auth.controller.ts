import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  ////////////////////////////////////////////////////////////
  // LOGIN (PUBLIC ROUTE)
  // Rate-limited: max 5 attempts per 60 seconds per IP.
  // Exceeding this returns HTTP 429 Too Many Requests.
  ////////////////////////////////////////////////////////////

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', example: 'admin@company.com' },
        password: { type: 'string', example: 'password123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT token' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too Many Requests — max 5 login attempts per 60 seconds' })
  login(@Body() body: { email: string; password: string; rememberMe?: boolean }) {
    return this.authService.login(body.email, body.password, body.rememberMe ?? false);
  }

  ////////////////////////////////////////////////////////////
  // PROFILE (PROTECTED ROUTE)
  ////////////////////////////////////////////////////////////

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Returns authenticated user info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@Req() req: any) {
    return {
      message: 'Authenticated user',
      user: req.user,
    };
  }
}
