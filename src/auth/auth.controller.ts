import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Set the httpOnly refresh token cookie.
 * - secure: true in production (HTTPS only)
 * - sameSite: 'none' for cross-origin (Vercel frontend + Render backend)
 *   Falls back to 'lax' in development.
 * - maxAge: 0 clears the cookie (used on logout)
 */
function setRefreshCookie(
  res:       Response,
  token:     string,
  maxAgeMs:  number,
): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   maxAgeMs,
    path:     '/auth',   // cookie only sent to /auth/* routes
  });
}

function clearRefreshCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    path:     '/auth',
  });
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── POST /auth/login ──────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns access token in body, sets refresh token cookie' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email:      { type: 'string', example: 'admin@company.com' },
        password:   { type: 'string', example: 'password123' },
        rememberMe: { type: 'boolean', example: false },
      },
    },
  })
  @ApiResponse({ status: 200,  description: 'Login successful' })
  @ApiResponse({ status: 401,  description: 'Invalid credentials' })
  @ApiResponse({ status: 429,  description: 'Too many requests' })
  async login(
    @Body() body: { email: string; password: string; rememberMe?: boolean },
    @Req()  req:  Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress;

    const { tokenPair, user } = await this.authService.login(
      body.email,
      body.password,
      body.rememberMe ?? false,
      userAgent,
      ipAddress,
    );

    // Set refresh token as httpOnly cookie — never exposed to JS
    setRefreshCookie(res, tokenPair.refresh_token, tokenPair.refresh_expires_in * 1000);

    // Set uid cookie (non-httpOnly, readable by JS) so the refresh endpoint
    // can scope the DB lookup without trusting the expired access token.
    // This is NOT a secret — userId is not sensitive on its own.
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('uid', user.id, {
      httpOnly: false,   // intentionally readable by JS for refresh calls
      secure:   isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge:   tokenPair.refresh_expires_in * 1000,
      path:     '/',
    });

    // Set remember_me flag cookie so refresh endpoint knows expiry policy
    res.cookie('remember_me', body.rememberMe ? '1' : '0', {
      httpOnly: false,
      secure:   isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge:   tokenPair.refresh_expires_in * 1000,
      path:     '/auth',
    });

    // Return access token in body + user snapshot
    // refresh_token is intentionally NOT included in the response body
    return {
      access_token: tokenPair.access_token,
      user,
    };
  }

  // ─── POST /auth/refresh ────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using httpOnly cookie',
    description:
      'Reads the refresh_token cookie, validates it against the DB, rotates it, ' +
      'and returns a new access token. The old refresh token is revoked immediately.',
  })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or expired refresh token' })
  async refresh(
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    // userId comes from the non-httpOnly 'uid' cookie set at login.
    // This is safe: userId is not a secret — the actual auth proof is the
    // refresh token hash comparison in validateRefreshToken().
    const userId: string = req.cookies?.['uid'];
    if (!userId) {
      throw new UnauthorizedException('Session expired — please log in again');
    }

    // rememberMe preference stored in cookie to preserve expiry policy on rotation
    const rememberMe = req.cookies?.['remember_me'] === '1';

    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress;

    const { tokenPair, user } = await this.authService.refreshAccessToken(
      rawRefreshToken,
      userId,
      rememberMe,
      userAgent,
      ipAddress,
    );

    // Rotate: set new refresh token cookie
    setRefreshCookie(res, tokenPair.refresh_token, tokenPair.refresh_expires_in * 1000);

    // Refresh uid cookie lifetime to match new refresh token
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('uid', user.id, {
      httpOnly: false,
      secure:   isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge:   tokenPair.refresh_expires_in * 1000,
      path:     '/',
    });

    return {
      access_token: tokenPair.access_token,
      user,
    };
  }

  // ─── POST /auth/logout ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revokes refresh token and clears cookie' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req()  req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    const userId = (req as any).user?.id;

    if (userId) {
      await this.authService.logout(rawRefreshToken ?? '', userId);
    }

    clearRefreshCookie(res);
    // Also clear uid and remember_me cookies
    res.clearCookie('uid',         { path: '/auth' });
    res.clearCookie('remember_me', { path: '/auth' });

    return { message: 'Logged out successfully' };
  }

  // ─── GET /auth/profile ─────────────────────────────────────────────────────

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
