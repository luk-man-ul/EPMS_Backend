-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ON_SITE', 'WFH');

-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'ON_SITE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workMode" "WorkMode" NOT NULL DEFAULT 'ON_SITE';

-- CreateTable
CREATE TABLE "WfhRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfhRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WfhRequest_userId_fromDate_toDate_idx" ON "WfhRequest"("userId", "fromDate", "toDate");

-- CreateIndex
CREATE INDEX "WfhRequest_status_idx" ON "WfhRequest"("status");

-- AddForeignKey
ALTER TABLE "WfhRequest" ADD CONSTRAINT "WfhRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WfhRequest" ADD CONSTRAINT "WfhRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
