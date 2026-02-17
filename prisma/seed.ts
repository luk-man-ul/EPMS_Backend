import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({
  adapter,
})


async function main() {

  // Create Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'System Administrator' }
  })

  const teamLeadRole = await prisma.role.upsert({
    where: { name: 'TEAM_LEAD' },
    update: {},
    create: { name: 'TEAM_LEAD', description: 'Project Team Lead' }
  })

  const employeeRole = await prisma.role.upsert({
    where: { name: 'EMPLOYEE' },
    update: {},
    create: { name: 'EMPLOYEE', description: 'Regular Employee' }
  })

  // Create Default Admin User
  const hashedPassword = await bcrypt.hash('Admin@123', 10)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@epms.com' },
    update: {},
    create: {
      email: 'admin@epms.com',
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      status: 'ACTIVE'
    }
  })

  // Assign ADMIN role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id
    }
  })

  console.log('Seeding completed.')
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
