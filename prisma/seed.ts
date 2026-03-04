import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  ////////////////////////////////////////////////////////////
  // 1️⃣ CREATE ROLES
  ////////////////////////////////////////////////////////////

  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'System Administrator',
    },
  });

  const teamLeadRole = await prisma.role.upsert({
    where: { name: 'TEAM_LEAD' },
    update: {},
    create: {
      name: 'TEAM_LEAD',
      description: 'Project Team Lead',
    },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: 'EMPLOYEE' },
    update: {},
    create: {
      name: 'EMPLOYEE',
      description: 'Regular Employee',
    },
  });

 ////////////////////////////////////////////////////////////
// 2️⃣ CREATE PERMISSIONS (WITH MODULE FIELD)
////////////////////////////////////////////////////////////

const permissionsData = [
  { code: 'dashboard.view', module: 'dashboard' },

  { code: 'employees.view', module: 'employees' },
  { code: 'employees.create', module: 'employees' },
  { code: 'employees.update', module: 'employees' },

  { code: 'projects.view', module: 'projects' },
  { code: 'projects.create', module: 'projects' },
  { code: 'projects.update', module: 'projects' },
  { code: 'projects.update.status', module: 'projects' },
  { code: 'projects.delete', module: 'projects' },

  { code: 'tasks.view', module: 'tasks' },
  { code: 'tasks.update', module: 'tasks' },
  { code: 'tasks.create', module: 'tasks' },
  { code: 'tasks.delete', module: 'tasks' },

  { code: 'finance.view', module: 'finance' },
  { code: 'reports.view', module: 'reports' },

  { code: 'settings.view', module: 'settings' },
  { code: 'settings.update', module: 'settings' },


  { code: 'tickets.view', module: 'tickets',},
  { code: 'tickets.create', module: 'tickets',},
  { code: 'tickets.update', module: 'tickets',},
  { code: 'tickets.assign', module: 'tickets',},
  { code: 'tickets.self_assign', module: 'tickets',},
  { code: 'tickets.update.priority', module: 'tickets',},
  { code: 'tickets.update.status', module: 'tickets',},
  { code: 'tickets.delete', module: 'tickets',},
  { code: 'tickets.comment', module: 'tickets',},
];

const permissionMap: Record<string, string> = {};

for (const perm of permissionsData) {
  const permission = await prisma.permission.upsert({
    where: { code: perm.code },
    update: {},
    create: {
      code: perm.code,
      module: perm.module,
    },
  });

  permissionMap[perm.code] = permission.id;
}


  ////////////////////////////////////////////////////////////
  // 3️⃣ DEFAULT PERMISSION MATRIX
  ////////////////////////////////////////////////////////////

  // ADMIN gets ALL permissions
await prisma.rolePermission.deleteMany({
  where: { roleId: adminRole.id },
})

await prisma.rolePermission.createMany({
  data: Object.values(permissionMap).map((permissionId) => ({
    roleId: adminRole.id,
    permissionId,
  })),
  skipDuplicates: true,
})
  // TEAM LEAD DEFAULT PERMISSIONS
  const teamLeadPermissions = [
    'dashboard.view',
    'projects.view',
    'projects.update',
    'projects.update.status',
    'tasks.view',
    'tasks.create', 
    'tasks.update',
    'tasks.delete',
    'employees.view',
    'reports.view',
    'tickets.view',
    'tickets.create',
    'tickets.update',
    'tickets.delete',
    'tickets.assign',
    'tickets.update.status',
    'tickets.comment',
  ];

  // EMPLOYEE DEFAULT PERMISSIONS
  const employeePermissions = [
    'dashboard.view',
    'projects.view',
    'projects.update.status',
    'tasks.view',
    'tasks.update',
    'tickets.view',
    'tickets.create',
    'tickets.update',
    'tickets.delete',
    'tickets.self_assign',
    'tickets.comment',
    'tickets.update.status',
  ];

  // Clear existing mappings (safe reset)
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: {
        in: [teamLeadRole.id, employeeRole.id],
      },
    },
  });

  // Insert TEAM LEAD permissions
  await prisma.rolePermission.createMany({
    data: teamLeadPermissions.map((code) => ({
      roleId: teamLeadRole.id,
      permissionId: permissionMap[code],
    })),
    skipDuplicates: true,
  });

  // Insert EMPLOYEE permissions
  await prisma.rolePermission.createMany({
    data: employeePermissions.map((code) => ({
      roleId: employeeRole.id,
      permissionId: permissionMap[code],
    })),
    skipDuplicates: true,
  });

  ////////////////////////////////////////////////////////////
  // 4️⃣ CREATE DEFAULT ADMIN USER
  ////////////////////////////////////////////////////////////

  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@epms.com' },
    update: {},
    create: {
      email: 'admin@epms.com',
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  ////////////////////////////////////////////////////////////
  // 5️⃣ ASSIGN ADMIN ROLE
  ////////////////////////////////////////////////////////////

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  console.log('✅ RBAC Seeding completed successfully.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
