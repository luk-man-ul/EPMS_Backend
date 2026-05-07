/*
  Warnings:

  - You are about to drop the column `type` on the `Expense` table. All the data in the column will be lost.
  - Made the column `categoryId` on table `Expense` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_categoryId_fkey";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "type",
ALTER COLUMN "categoryId" SET NOT NULL;

-- DropEnum
DROP TYPE "ExpenseType";

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
