/*
  Warnings:

  - A unique constraint covering the columns `[name,type]` on the table `BankAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "PaymentSourceType" AS ENUM (
        'BANK_ACCOUNT',
        'CASH',
        'PETTY_CASH',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- DropIndex
DROP INDEX "BankAccount_accountNumber_key";

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "type" "PaymentSourceType" NOT NULL DEFAULT 'BANK_ACCOUNT',
ALTER COLUMN "accountNumber" DROP NOT NULL,
ALTER COLUMN "bankName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "BankAccount_type_idx" ON "BankAccount"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_name_type_key" ON "BankAccount"("name", "type");
