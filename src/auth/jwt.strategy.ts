import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * JwtStrategy — validates every incoming access token.
 *
 * Phase 2 hardening:
 *  1. Fetches the user from DB on every request (detects deactivation in real time).
 *  2. Verifies tokenVersion matches the JWT claim — logout increments this,
 *     instantly invalidating all outstanding access tokens for that user.
 *  3. Returns fresh role + permissions from DB, not from the JWT payload.
 *     This means permission changes take effect on the next request, not next login.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest:  ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:     process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    // 1. Fetch user with roles + permissions from DB
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    // 2. User must exist and be active
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Account deactivated');
    }

    // 3. tokenVersion check — logout increments this, invalidating old tokens
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token has been invalidated — please log in again');
    }

    // 4. Resolve fresh role + permissions from DB (do NOT trust JWT payload)
    const roleNames = user.roles.map((r) => r.role.name);
    let primaryRole = 'EMPLOYEE';
    if (roleNames.includes('ADMIN'))          primaryRole = 'ADMIN';
    else if (roleNames.includes('TEAM_LEAD')) primaryRole = 'TEAM_LEAD';

    const permissions = [
      ...new Set(
        user.roles.flatMap((r) =>
          r.role.permissions.map((rp) => rp.permission.code),
        ),
      ),
    ];

    // 5. Return user object attached to req.user
    return {
      id:          user.id,
      email:       user.email,
      role:        primaryRole,
      permissions,
      tokenVersion: user.tokenVersion,
    };
  }
}
