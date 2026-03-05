-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ASSIGNED', 'SELF_WORK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'PROPOSED';
ALTER TYPE "TaskStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "type" "TaskType" NOT NULL DEFAULT 'ASSIGNED';

-- CreateIndex
CREATE INDEX "Task_type_idx" ON "Task"("type");

-- CreateIndex
CREATE INDEX "Task_approvedById_idx" ON "Task"("approvedById");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
