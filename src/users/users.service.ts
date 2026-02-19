import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // CREATE USER
  ////////////////////////////////////////////////////////////

  async createUser(data: any, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can create users');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new BadRequestException('User already exists');
    }

    const employeeRole = await this.prisma.role.findUnique({
      where: { name: 'EMPLOYEE' },
    });

    if (!employeeRole) {
      throw new Error('EMPLOYEE role not found');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash: hashedPassword,
        phone: data.phone,
        department: data.department,
        profilePhoto: data.profilePhoto,
        joinedAt: new Date(),
        skills: data.skillIds
          ? {
              create: data.skillIds.map((skillId: string) => ({
                skill: { connect: { id: skillId } },
              })),
            }
          : undefined,
        roles: {
          create: {
            roleId: employeeRole.id,
          },
        },
      },
      include: {
        roles: { include: { role: true } },
        skills: { include: { skill: true } },
      },
    });

    return {
      message: 'User created successfully',
      user,
    };
  }

  ////////////////////////////////////////////////////////////
  // GET ALL USERS (Improved Response Shape)
  ////////////////////////////////////////////////////////////

  async getAllUsers(currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can view users');
    }

    const users = await this.prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        skills: { include: { skill: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 🔥 Flatten role for frontend convenience
    return users.map((user) => ({
      ...user,
      role: user.roles[0]?.role?.name || null,
    }));
  }

  ////////////////////////////////////////////////////////////
  // PROMOTE TO TEAM_LEAD
  ////////////////////////////////////////////////////////////

  async promoteToTeamLead(userId: string, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can promote');
    }

    const teamLeadRole = await this.prisma.role.findUnique({
      where: { name: 'TEAM_LEAD' },
    });

    if (!teamLeadRole) {
      throw new Error('TEAM_LEAD role not found');
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: teamLeadRole.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: teamLeadRole.id,
      },
    });

    return { message: 'User promoted to TEAM_LEAD' };
  }

  ////////////////////////////////////////////////////////////
  // DEMOTE TO EMPLOYEE
  ////////////////////////////////////////////////////////////

  async demoteToEmployee(userId: string, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can demote');
    }

    const teamLeadRole = await this.prisma.role.findUnique({
      where: { name: 'TEAM_LEAD' },
    });

    if (!teamLeadRole) {
      throw new Error('TEAM_LEAD role not found');
    }

    await this.prisma.userRole.deleteMany({
      where: {
        userId,
        roleId: teamLeadRole.id,
      },
    });

    return { message: 'User demoted to EMPLOYEE' };
  }

  ////////////////////////////////////////////////////////////
  // DEACTIVATE USER
  ////////////////////////////////////////////////////////////

  async deactivateUser(userId: string, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can deactivate');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });

    return { message: 'User deactivated' };
  }

  ////////////////////////////////////////////////////////////
  // ACTIVATE USER
  ////////////////////////////////////////////////////////////

  async activateUser(userId: string, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can activate');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    return { message: 'User activated' };
  }

  ////////////////////////////////////////////////////////////
  // UPDATE USER
  ////////////////////////////////////////////////////////////

  async updateUser(userId: string, data: any, currentUser: any) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can update users');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        department: data.department,
        profilePhoto: data.profilePhoto,
        skills: data.skillIds
          ? {
              deleteMany: {},
              create: data.skillIds.map((skillId: string) => ({
                skill: { connect: { id: skillId } },
              })),
            }
          : undefined,
      },
    });
  }
}
