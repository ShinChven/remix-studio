-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "Project_userId_status_idx" ON "Project"("userId", "status");
