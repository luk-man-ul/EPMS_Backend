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

  async login(email: string, password: string, rememberMe = false) {
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

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    throw new UnauthorizedException('Invalid credentials');
  }

  if (user.status === 'INACTIVE') {
    throw new UnauthorizedException('User account is deactivated');
  }

  // 🔥 Extract all role names
  const roleNames = user.roles.map((r) => r.role.name);

  if (!roleNames.length) {
    throw new UnauthorizedException('User role not assigned');
  }

  // 🔥 Role priority logic
  let primaryRole = 'EMPLOYEE';

  if (roleNames.includes('ADMIN')) {
    primaryRole = 'ADMIN';
  } else if (roleNames.includes('TEAM_LEAD')) {
    primaryRole = 'TEAM_LEAD';
  }

  // 🔥 Load permissions for ALL roles
  const rolePermissions = await this.prisma.rolePermission.findMany({
    where: {
      role: {
        name: { in: roleNames },
      },
    },
    include: {
      permission: true,
    },
  });

  // 🔥 Merge + deduplicate permissions
  const permissions = [
    ...new Set(rolePermissions.map((rp) => rp.permission.code)),
  ];

  const payload = {
    sub: user.id,
    role: primaryRole,
    permissions,
  };

  const token = this.jwtService.sign(payload, {
    expiresIn: rememberMe ? '7d' : '1d',
  });

  return {
    access_token: token,
    user: {
      id: user.id,
      email: user.email,
      role: primaryRole,
      permissions,
    },
  };
}
}
