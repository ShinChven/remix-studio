-- CreateTable
CREATE TABLE "JobBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "conversationId" TEXT,
    "totalCount" INTEGER NOT NULL,
    "autoResume" BOOLEAN NOT NULL DEFAULT false,
    "resumeHint" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBatch_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "batchId" TEXT;

-- AlterTable
ALTER TABLE "AlbumItem" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "JobBatch_userId_createdAt_idx" ON "JobBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobBatch_projectId_createdAt_idx" ON "JobBatch"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "JobBatch_conversationId_createdAt_idx" ON "JobBatch"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "JobBatch_autoResume_notifiedAt_idx" ON "JobBatch"("autoResume", "notifiedAt");

-- CreateIndex
CREATE INDEX "Job_batchId_idx" ON "Job"("batchId");

-- CreateIndex
CREATE INDEX "AlbumItem_batchId_idx" ON "AlbumItem"("batchId");

-- AddForeignKey
ALTER TABLE "JobBatch" ADD CONSTRAINT "JobBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBatch" ADD CONSTRAINT "JobBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBatch" ADD CONSTRAINT "JobBatch_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "JobBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "JobBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
