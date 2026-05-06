require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  // ── Connection warm-up ──────────────────────────────────────────────────
  // Render free-tier databases sleep after inactivity. The pg.Pool must
  // establish at least one live connection before PrismaPg can start
  // transactions. We test the pool directly (bypassing Prisma) first.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 3,
    ssl: { rejectUnauthorized: false },
  });

  console.log('🔌 Connecting to database...');
  let poolClient;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      poolClient = await pool.connect();
      await poolClient.query('SELECT 1');
      poolClient.release();
      console.log('✅ Database connection established.');
      break;
    } catch (err) {
      if (poolClient) { poolClient.release(true); poolClient = null; }
      if (attempt < 5) {
        console.log(`⚠️  Connection attempt ${attempt}/5 failed (${err.message}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        await pool.end();
        throw new Error(`Could not connect to database after 5 attempts: ${err.message}`);
      }
    }
  }

  // Pool is warm — hand it to Prisma
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
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
  // 2️⃣ CREATE PERMISSIONS
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
    { code: 'tasks.approve', module: 'tasks' },

    { code: 'finance.view', module: 'finance' },
    { code: 'reports.view', module: 'reports' },

    { code: 'settings.view', module: 'settings' },
    { code: 'settings.update', module: 'settings' },

    { code: 'tickets.view', module: 'tickets' },
    { code: 'tickets.create', module: 'tickets' },
    { code: 'tickets.update', module: 'tickets' },
    { code: 'tickets.assign', module: 'tickets' },
    { code: 'tickets.self_assign', module: 'tickets' },
    { code: 'tickets.update.priority', module: 'tickets' },
    { code: 'tickets.update.status', module: 'tickets' },
    { code: 'tickets.delete', module: 'tickets' },
    { code: 'tickets.comment', module: 'tickets' },

    { code: 'attendance.view', module: 'attendance' },
    { code: 'attendance.create', module: 'attendance' },
    { code: 'attendance.update', module: 'attendance' },
    { code: 'attendance.viewAll', module: 'attendance' },

    { code: 'leave.view', module: 'leave' },
    { code: 'leave.create', module: 'leave' },
    { code: 'leave.approve', module: 'leave' },
    { code: 'leave.viewAll', module: 'leave' },
  ];

  const permissionMap = {};

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
  });

  await prisma.rolePermission.createMany({
    data: Object.values(permissionMap).map((permissionId) => ({
      roleId: adminRole.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

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
    'tasks.approve',
    'employees.view',
    'reports.view',
    'tickets.view',
    'tickets.create',
    'tickets.update',
    'tickets.delete',
    'tickets.assign',
    'tickets.update.status',
    'tickets.comment',
    'attendance.view',
    'attendance.viewAll',
    'attendance.create',
    'leave.view',
    'leave.approve',
    'leave.create',
  ];

  // EMPLOYEE DEFAULT PERMISSIONS
  const employeePermissions = [
    'dashboard.view',
    'projects.view',
    'projects.update.status',
    'tasks.view',
    'tasks.create',
    'tasks.update',
    'tickets.view',
    'tickets.create',
    'tickets.update',
    'tickets.delete',
    'tickets.self_assign',
    'tickets.comment',
    'tickets.update.status',
    'attendance.view',
    'attendance.create',
    'leave.view',
    'leave.create',
  ];

  // Clear existing mappings
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: {
        in: [teamLeadRole.id, employeeRole.id],
      },
    },
  });

  // Insert TEAM LEAD permissions
  await prisma.rolePermission.createMany({
    data: teamLeadPermissions
      .filter(code => permissionMap[code])
      .map(code => ({
        roleId: teamLeadRole.id,
        permissionId: permissionMap[code],
      })),
    skipDuplicates: true,
  });

  // Insert EMPLOYEE permissions
  await prisma.rolePermission.createMany({
    data: employeePermissions
      .filter(code => permissionMap[code])
      .map(code => ({
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

  ////////////////////////////////////////////////////////////
  // 6️⃣ SEED EXPENSE CATEGORIES
  ////////////////////////////////////////////////////////////

  const expenseCategories = [
    { name: 'Travel' },
    { name: 'Food' },
    { name: 'Salary' },
    { name: 'Miscellaneous' },
  ];

  for (const cat of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        isActive: true,
      },
    });
  }

  console.log('✅ Expense categories seeded.');

  ////////////////////////////////////////////////////////////
  // 7️⃣ SEED BANK ACCOUNTS
  ////////////////////////////////////////////////////////////

  const bankAccounts = [
    {
      name: 'HDFC Current Account',
      accountNumber: 'HDFC-001-CURRENT',
      bankName: 'HDFC Bank',
      ifscCode: 'HDFC0000001',
    },
    {
      name: 'SBI Savings Account',
      accountNumber: 'SBI-002-SAVINGS',
      bankName: 'State Bank of India',
      ifscCode: 'SBIN0000001',
    },
    {
      name: 'Federal Bank Business Account',
      accountNumber: 'FED-003-BUSINESS',
      bankName: 'Federal Bank',
      ifscCode: 'FDRL0000001',
    },
  ];

  for (const account of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { accountNumber: account.accountNumber },
      update: {},
      create: {
        name: account.name,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        ifscCode: account.ifscCode,
        isActive: true,
      },
    });
  }

  console.log('✅ Bank accounts seeded.');

  await prisma.$disconnect();
  await pool.end();
}

main()
  .catch(console.error);