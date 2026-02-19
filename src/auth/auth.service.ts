import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException(
        'User account is deactivated',
      );
    }

    // Assume single active role
    const roleName = user.roles[0]?.role?.name;

    if (!roleName) {
      throw new UnauthorizedException(
        'User role not assigned',
      );
    }

    // Load permissions from RolePermission table
    const rolePermissions =
      await this.prisma.rolePermission.findMany({
        where: {
          role: { name: roleName },
        },
        include: {
          permission: true,
        },
      });

    const permissions = rolePermissions.map(
      (rp) => rp.permission.code,
    );

    const payload = {
      sub: user.id,
      role: roleName,
      permissions,
    };

    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        role: roleName,
        permissions,
      },
    };
  }
}
