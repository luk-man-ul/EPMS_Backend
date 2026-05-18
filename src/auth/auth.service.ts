import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Access token lifetime — short-lived, stored in memory only */
const ACCESS_TOKEN_EXPIRY = '15m';

/** Refresh token lifetimes */
const REFRESH_TOKEN_EXPIRY_NORMAL    = 7;   // days
const REFRESH_TOKEN_EXPIRY_REMEMBER  = 30;  // days

/** bcrypt cost for hashing refresh tokens */
const REFRESH_TOKEN_HASH_ROUNDS = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenPair {
  access_token:  string;
  /** Raw refresh token — send to client ONCE, never store raw */
  refresh_token: string;
  /** Seconds until refresh token expires (for cookie maxAge) */
  refresh_expires_in: number;
}

export interface AuthUser {
  id:          string;
  email:       string;
  role:        string;
  permissions: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  constructor(
    private prisma:     PrismaService,
    private jwtService: JwtService,
  ) {}

  // ─── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the primary role and full permission list for a user.
   * Extracted so both login() and refreshAccessToken() can reuse it.
   */
  private async resolveUserAuth(userId: string): Promise<{
    primaryRole:  string;
    permissions:  string[];
    tokenVersion: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new UnauthorizedException('User not found');
    if (user.status === 'INACTIVE') throw new UnauthorizedException('Account deactivated');

    const roleNames = user.roles.map((r) => r.role.name);
    if (!roleNames.length) throw new UnauthorizedException('User role not assigned');

    let primaryRole = 'EMPLOYEE';
    if (roleNames.includes('ADMIN'))     primaryRole = 'ADMIN';
    else if (roleNames.includes('TEAM_LEAD')) primaryRole = 'TEAM_LEAD';

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role: { name: { in: roleNames } } },
      include: { permission: true },
    });

    const permissions = [...new Set(rolePermissions.map((rp) => rp.permission.code))];

    return { primaryRole, permissions, tokenVersion: user.tokenVersion };
  }

  // ─── generateAccessToken ────────────────────────────────────────────────────

  /**
   * Issue a short-lived (15 min) access token.
   * Payload includes tokenVersion so the JWT strategy can detect invalidation.
   */
  generateAccessToken(user: AuthUser, tokenVersion: number): string {
    return this.jwtService.sign(
      {
        sub:          user.id,
        role:         user.role,
        permissions:  user.permissions,
        tokenVersion,
      },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
  }

  // ─── generateRefreshToken ───────────────────────────────────────────────────

  /**
   * Generate a cryptographically random refresh token, hash it with bcrypt,
   * persist the hash to the DB, and return the raw token to the caller.
   *
   * The raw token is returned ONCE and must be sent to the client immediately.
   * It is never stored in plaintext.
   */
  async generateRefreshToken(
    userId:     string,
    rememberMe: boolean,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ rawToken: string; expiresAt: Date; expiresInSeconds: number }> {
    const rawToken = crypto.randomBytes(64).toString('hex'); // 128 hex chars

    const daysToExpiry = rememberMe
      ? REFRESH_TOKEN_EXPIRY_REMEMBER
      : REFRESH_TOKEN_EXPIRY_NORMAL;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToExpiry);

    await this.storeRefreshToken(userId, rawToken, expiresAt, userAgent, ipAddress);

    return {
      rawToken,
      expiresAt,
      expiresInSeconds: daysToExpiry * 24 * 60 * 60,
    };
  }

  // ─── storeRefreshToken ──────────────────────────────────────────────────────

  async storeRefreshToken(
    userId:     string,
    rawToken:   string,
    expiresAt:  Date,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<void> {
    const tokenHash = await bcrypt.hash(rawToken, REFRESH_TOKEN_HASH_ROUNDS);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, userAgent, ipAddress },
    });
  }

  // ─── validateRefreshToken ───────────────────────────────────────────────────

  /**
   * Find an active (non-revoked, non-expired) refresh token record whose
   * hash matches the provided raw token.
   *
   * Returns the DB record on success, throws UnauthorizedException on failure.
   *
   * Security note: we fetch all active tokens for the user and bcrypt.compare
   * each one. This is O(n) per user but n is small (typically 1–3 sessions).
   * A UNIQUE index on tokenHash prevents duplicate storage.
   */
  async validateRefreshToken(rawToken: string, userId: string): Promise<{ id: string }> {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, tokenHash: true },
    });

    for (const record of activeTokens) {
      const isMatch = await bcrypt.compare(rawToken, record.tokenHash);
      if (isMatch) return { id: record.id };
    }

    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  // ─── revokeRefreshToken ─────────────────────────────────────────────────────

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data:  { revokedAt: new Date() },
    });
  }

  // ─── revokeAllUserTokens ────────────────────────────────────────────────────

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  }

  // ─── login ──────────────────────────────────────────────────────────────────

  /**
   * Validate credentials, issue access + refresh tokens.
   * Returns the token pair and the user snapshot.
   * The controller is responsible for setting the refresh token cookie.
   */
  async login(
    email:      string,
    password:   string,
    rememberMe  = false,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ tokenPair: TokenPair; user: AuthUser }> {
    // 1. Fetch user with roles
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    // 2. Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    // 3. Check account status
    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('User account is deactivated');
    }

    // 4. Resolve role + permissions
    const { primaryRole, permissions, tokenVersion } =
      await this.resolveUserAuth(user.id);

    const authUser: AuthUser = {
      id:          user.id,
      email:       user.email,
      role:        primaryRole,
      permissions,
    };

    // 5. Issue access token (15 min)
    const access_token = this.generateAccessToken(authUser, tokenVersion);

    // 6. Issue refresh token (7d or 30d), store hash in DB
    const { rawToken, expiresInSeconds } = await this.generateRefreshToken(
      user.id,
      rememberMe,
      userAgent,
      ipAddress,
    );

    return {
      tokenPair: {
        access_token,
        refresh_token:      rawToken,
        refresh_expires_in: expiresInSeconds,
      },
      user: authUser,
    };
  }

  // ─── refreshAccessToken ─────────────────────────────────────────────────────

  /**
   * Validate the incoming refresh token, rotate it (revoke old, issue new),
   * and return a fresh access token + new refresh token.
   *
   * Token rotation: every refresh call invalidates the old refresh token and
   * issues a new one. This limits the window of a stolen refresh token.
   */
  async refreshAccessToken(
    rawRefreshToken: string,
    userId:          string,
    rememberMe:      boolean,
    userAgent?:      string,
    ipAddress?:      string,
  ): Promise<{ tokenPair: TokenPair; user: AuthUser }> {
    // 1. Validate the incoming refresh token against DB hashes
    const { id: tokenId } = await this.validateRefreshToken(rawRefreshToken, userId);

    // 2. Revoke the old token immediately (rotation)
    await this.revokeRefreshToken(tokenId);

    // 3. Re-resolve user auth (fresh from DB — picks up role/permission changes)
    const { primaryRole, permissions, tokenVersion } =
      await this.resolveUserAuth(userId);

    // 4. Fetch user email for the snapshot
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const authUser: AuthUser = {
      id:          user.id,
      email:       user.email,
      role:        primaryRole,
      permissions,
    };

    // 5. Issue new access token
    const access_token = this.generateAccessToken(authUser, tokenVersion);

    // 6. Issue new refresh token (same expiry policy as original login)
    const { rawToken, expiresInSeconds } = await this.generateRefreshToken(
      userId,
      rememberMe,
      userAgent,
      ipAddress,
    );

    return {
      tokenPair: {
        access_token,
        refresh_token:      rawToken,
        refresh_expires_in: expiresInSeconds,
      },
      user: authUser,
    };
  }

  // ─── logout ─────────────────────────────────────────────────────────────────

  /**
   * Revoke the specific refresh token and increment tokenVersion so any
   * outstanding access tokens are invalidated on next validation.
   */
  async logout(rawRefreshToken: string, userId: string): Promise<void> {
    try {
      const { id: tokenId } = await this.validateRefreshToken(rawRefreshToken, userId);
      await this.revokeRefreshToken(tokenId);
    } catch {
      // Token already invalid — still proceed to increment tokenVersion
    }

    // Increment tokenVersion — JwtStrategy.validate() will reject old access tokens
    await this.prisma.user.update({
      where: { id: userId },
      data:  { tokenVersion: { increment: 1 } },
    });
  }
}
