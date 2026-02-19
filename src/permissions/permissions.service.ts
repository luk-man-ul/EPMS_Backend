import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // GET ALL PERMISSIONS
  ////////////////////////////////////////////////////////////

  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });
  }

  ////////////////////////////////////////////////////////////
  // GET ROLE PERMISSIONS
  ////////////////////////////////////////////////////////////

  async getRolePermissions(roleName: string) {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return {
      role: role.name,
      permissions: role.permissions.map(
        (rp) => rp.permission.code,
      ),
    };
  }

  ////////////////////////////////////////////////////////////
  // UPDATE ROLE PERMISSIONS (REPLACE MATRIX)
  ////////////////////////////////////////////////////////////

  async updateRolePermissions(
    roleName: string,
    permissionCodes: string[],
  ) {
    if (!permissionCodes || !Array.isArray(permissionCodes)) {
      throw new BadRequestException(
        'permissionCodes must be an array',
      );
    }

    if (roleName === 'ADMIN') {
      throw new BadRequestException(
        'ADMIN permissions cannot be modified',
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Fetch permissions from DB
    const permissions = await this.prisma.permission.findMany({
      where: {
        code: { in: permissionCodes },
      },
    });

    if (permissions.length !== permissionCodes.length) {
      throw new BadRequestException(
        'Some permissions do not exist',
      );
    }

    // Replace entire permission matrix
    await this.prisma.$transaction(async (tx) => {
      // Delete old mappings
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      // Insert new mappings
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    });

    return {
      message: `Permissions updated for role ${roleName}`,
    };
  }
}
