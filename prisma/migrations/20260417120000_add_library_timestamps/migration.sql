-- AlterTable
ALTER TABLE "Library"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "LibraryItem"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Library_userId_createdAt_idx" ON "Library"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryItem_libraryId_createdAt_idx" ON "LibraryItem"("libraryId", "createdAt");
