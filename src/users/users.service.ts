import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  ////////////////////////////////////////////////////////////
  // CREATE USER (DEFAULT ROLE: EMPLOYEE)
  ////////////////////////////////////////////////////////////
async createUser(data: {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  department?: string
  profilePhoto?: string
  skillIds?: string[]
})

 {
  const existing = await this.prisma.user.findUnique({
    where: { email: data.email },
  })

  if (existing) {
    throw new BadRequestException('User already exists')
  }

  const employeeRole = await this.prisma.role.findUnique({
    where: { name: 'EMPLOYEE' },
  })

  if (!employeeRole) {
    throw new Error('EMPLOYEE role not found in database')
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const user = await this.prisma.user.create({
    data: {
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  passwordHash: hashedPassword,
  phone: data.phone,
  department: data.department,
  skills: data.skillIds
  ? {
      create: data.skillIds.map((skillId) => ({
        skill: { connect: { id: skillId } },
      })),
    }
  : undefined,
  profilePhoto: data.profilePhoto,
  joinedAt: new Date(), // 🔥 automatically current time
  // status will default to ACTIVE from Prisma schema
  roles: {
    create: {
      roleId: employeeRole.id, // EMPLOYEE by default
    },
  },
},

    include: {
      roles: {
        include: { role: true },
      },
    },
  })

  return {
    message: 'User created successfully',
    user,
  }
}

  ////////////////////////////////////////////////////////////
  // GET ALL USERS
  ////////////////////////////////////////////////////////////

  async getAllUsers() {
    return this.prisma.user.findMany({
      include: {
  roles: {
    include: { role: true },
  },
  skills: {
    include: {
      skill: true,
    },
  },
},

    })
  }


////////////////////////////////////////////////////////////
// PROMOTE TO TEAM_LEAD
////////////////////////////////////////////////////////////

async promoteToTeamLead(userId: string) {
  const teamLeadRole = await this.prisma.role.findUnique({
    where: { name: 'TEAM_LEAD' }, // ✅ MATCHES DATABASE
  })

  if (!teamLeadRole) {
    throw new Error('TEAM_LEAD role not found in database')
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
  })

  return { message: 'User promoted to TEAM_LEAD' }
}

////////////////////////////////////////////////////////////
// DEMOTE TO EMPLOYEE
////////////////////////////////////////////////////////////

async demoteToEmployee(userId: string) {
  const teamLeadRole = await this.prisma.role.findUnique({
    where: { name: 'TEAM_LEAD' }, // ✅ MATCHES DATABASE
  })

  if (!teamLeadRole) {
    throw new Error('TEAM_LEAD role not found')
  }

  await this.prisma.userRole.deleteMany({
    where: {
      userId,
      roleId: teamLeadRole.id,
    },
  })

  return { message: 'User demoted to EMPLOYEE' }
}


  ////////////////////////////////////////////////////////////
  // DEACTIVATE USER (SOFT DELETE)
  ////////////////////////////////////////////////////////////

  async deactivateUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    })

    return { message: 'User deactivated' }
  }

///////////////////////////////////////////////////////////////
// ACTIVATE USER
//////////////////////////////////////////////////////////////
  async activateUser(id: string) {
  return this.prisma.user.update({
    where: { id },
    data: {
      status: 'ACTIVE',
    },
  })
}

////////////////////////////////////////////////////////////
// UPDATE USER
////////////////////////////////////////////////////////////

async updateUser(
  userId: string,
  data: {
    firstName?: string
    lastName?: string
    phone?: string
    department?: string
    profilePhoto?: string
    skillIds?: string[]
  },
) {
  return this.prisma.user.update({
    where: { id: userId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      department: data.department,
      profilePhoto: data.profilePhoto,

      // 🔥 Replace skill set completely
      skills: data.skillIds
        ? {
            deleteMany: {}, // remove all old skills
            create: data.skillIds.map((skillId) => ({
              skill: { connect: { id: skillId } },
            })),
          }
        : undefined,
    },
  })
}


}
