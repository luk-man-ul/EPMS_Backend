/*
  Warnings:

  - You are about to drop the column `filePath` on the `FileAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `FileAttachment` table. All the data in the column will be lost.
  - Added the required column `fileName` to the `FileAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `FileAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `FileAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileUrl` to the `FileAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FileAttachment" DROP COLUMN "filePath",
DROP COLUMN "uploadedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "fileType" TEXT NOT NULL,
ADD COLUMN     "fileUrl" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "FileAttachment_entityType_entityId_idx" ON "FileAttachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "FileAttachment_uploadedById_idx" ON "FileAttachment"("uploadedById");
