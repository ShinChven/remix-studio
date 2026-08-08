-- Project bundle import: an uploaded .zip is parked in the export bucket and
-- unpacked into a new project by a background worker, mirroring how
-- "ExportTask" drives archive creation.

CREATE TABLE IF NOT EXISTS "ProjectImportTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "projectId" TEXT,
  "projectName" TEXT,
  "current" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "size" BIGINT,
  "s3Key" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "workerId" TEXT,
  "heartbeatAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "ProjectImportTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectImportTask_userId_idx"
  ON "ProjectImportTask"("userId");

CREATE INDEX IF NOT EXISTS "ProjectImportTask_status_createdAt_idx"
  ON "ProjectImportTask"("status", "createdAt");

ALTER TABLE "ProjectImportTask"
  ADD CONSTRAINT "ProjectImportTask_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
