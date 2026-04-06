-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "storageLimit" BIGINT NOT NULL DEFAULT 5368709120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "apiUrl" TEXT,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "models" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Library" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT,
    "tags" JSONB,
    "order" INTEGER,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,
    "size" BIGINT,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT,
    "aspectRatio" TEXT,
    "quality" TEXT,
    "format" TEXT,
    "shuffle" BOOLEAN,
    "modelConfigId" TEXT,
    "prefix" TEXT,
    "background" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "imageContexts" JSONB,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,
    "error" TEXT,
    "providerId" TEXT,
    "modelConfigId" TEXT,
    "aspectRatio" TEXT,
    "quality" TEXT,
    "format" TEXT,
    "background" TEXT,
    "taskId" TEXT,
    "filename" TEXT,
    "size" BIGINT,
    "optimizedSize" BIGINT,
    "thumbnailSize" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,

    CONSTRAINT "WorkflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "prompt" TEXT,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,
    "providerId" TEXT,
    "modelConfigId" TEXT,
    "aspectRatio" TEXT,
    "quality" TEXT,
    "format" TEXT,
    "size" BIGINT,
    "optimizedSize" BIGINT,
    "thumbnailSize" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlbumItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "jobId" TEXT,
    "prompt" TEXT,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "optimizedUrl" TEXT,
    "providerId" TEXT,
    "modelConfigId" TEXT,
    "aspectRatio" TEXT,
    "quality" TEXT,
    "format" TEXT,
    "size" BIGINT,
    "optimizedSize" BIGINT,
    "thumbnailSize" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "downloadUrl" TEXT,
    "error" TEXT,
    "size" BIGINT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ExportTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Provider_userId_idx" ON "Provider"("userId");

-- CreateIndex
CREATE INDEX "Library_userId_idx" ON "Library"("userId");

-- CreateIndex
CREATE INDEX "LibraryItem_libraryId_idx" ON "LibraryItem"("libraryId");

-- CreateIndex
CREATE INDEX "LibraryItem_libraryId_order_idx" ON "LibraryItem"("libraryId", "order");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Job_projectId_idx" ON "Job"("projectId");

-- CreateIndex
CREATE INDEX "Job_userId_status_idx" ON "Job"("userId", "status");

-- CreateIndex
CREATE INDEX "Job_status_taskId_idx" ON "Job"("status", "taskId");

-- CreateIndex
CREATE INDEX "WorkflowItem_projectId_idx" ON "WorkflowItem"("projectId");

-- CreateIndex
CREATE INDEX "AlbumItem_projectId_idx" ON "AlbumItem"("projectId");

-- CreateIndex
CREATE INDEX "AlbumItem_userId_idx" ON "AlbumItem"("userId");

-- CreateIndex
CREATE INDEX "TrashItem_userId_idx" ON "TrashItem"("userId");

-- CreateIndex
CREATE INDEX "ExportTask_userId_idx" ON "ExportTask"("userId");

-- CreateIndex
CREATE INDEX "ExportTask_userId_projectId_idx" ON "ExportTask"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Library" ADD CONSTRAINT "Library_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowItem" ADD CONSTRAINT "WorkflowItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrashItem" ADD CONSTRAINT "TrashItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportTask" ADD CONSTRAINT "ExportTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportTask" ADD CONSTRAINT "ExportTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
