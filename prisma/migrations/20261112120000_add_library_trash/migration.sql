-- CreateTable
CREATE TABLE "LibraryTrashItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "libraryName" TEXT NOT NULL,
    "libraryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT,
    "tags" JSONB,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,
    "size" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryTrashItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryTrashItem_userId_deletedAt_idx" ON "LibraryTrashItem"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "LibraryTrashItem" ADD CONSTRAINT "LibraryTrashItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
