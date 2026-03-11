/*
  Warnings:

  - You are about to drop the column `entity` on the `ActivityFeed` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `ActivityFeed` table. All the data in the column will be lost.
  - Added the required column `actionType` to the `ActivityFeed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `ActivityFeed` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityType` to the `ActivityFeed` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ActivityFeed" DROP COLUMN "entity",
DROP COLUMN "message",
ADD COLUMN     "actionType" TEXT NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "entityType" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB;

-- CreateIndex
CREATE INDEX "ActivityFeed_userId_idx" ON "ActivityFeed"("userId");

-- CreateIndex
CREATE INDEX "ActivityFeed_entityType_idx" ON "ActivityFeed"("entityType");

-- CreateIndex
CREATE INDEX "ActivityFeed_createdAt_idx" ON "ActivityFeed"("createdAt");
