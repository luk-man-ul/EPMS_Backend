/*
  Warnings:

  - Made the column `updatedAt` on table `ChatMessage` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET NOT NULL;
