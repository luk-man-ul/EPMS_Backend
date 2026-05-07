/**
 * Phase A migration: assign ExpenseCategory to all existing Expense rows
 * that currently have no categoryId.
 *
 * SALARY expenses → "Salary" category
 * MANUAL expenses → "Miscellaneous" category
 *
 * Safe to run multiple times (updateMany with categoryId: null filter).
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  // Warm up the connection before handing to Prisma
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('✅ Database connected.');

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find the seeded categories (case-sensitive match on seeded names)
    const salaryCat = await prisma.expenseCategory.findFirst({ where: { name: 'Salary' } });
    const miscCat   = await prisma.expenseCategory.findFirst({ where: { name: 'Miscellaneous' } });

    if (!salaryCat) {
      console.error('❌ "Salary" category not found — run `npx prisma db seed` first');
      process.exit(1);
    }
    if (!miscCat) {
      console.error('❌ "Miscellaneous" category not found — run `npx prisma db seed` first');
      process.exit(1);
    }

    console.log('Salary category id:        ', salaryCat.id);
    console.log('Miscellaneous category id: ', miscCat.id);

    // Assign Salary category to SALARY expenses with no category
    const salaryResult = await prisma.expense.updateMany({
      where: { type: 'SALARY', categoryId: null },
      data:  { categoryId: salaryCat.id },
    });
    console.log('SALARY expenses updated:   ', salaryResult.count);

    // Assign Miscellaneous category to MANUAL expenses with no category
    const manualResult = await prisma.expense.updateMany({
      where: { type: 'MANUAL', categoryId: null },
      data:  { categoryId: miscCat.id },
    });
    console.log('MANUAL expenses updated:   ', manualResult.count);

    // Verify no uncategorized expenses remain
    const uncategorized = await prisma.expense.count({ where: { categoryId: null } });
    if (uncategorized > 0) {
      console.warn(`⚠️  ${uncategorized} expense(s) still have no category — investigate manually`);
    } else {
      console.log('✅ All expenses now have a category.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
