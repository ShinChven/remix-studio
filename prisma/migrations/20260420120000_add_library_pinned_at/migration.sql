-- AlterTable
ALTER TABLE "Library" ADD COLUMN "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Library_userId_pinnedAt_idx" ON "Library"("userId", "pinnedAt");
