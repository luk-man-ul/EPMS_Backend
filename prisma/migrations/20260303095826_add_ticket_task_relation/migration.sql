-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_taskId_idx" ON "Ticket"("taskId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
