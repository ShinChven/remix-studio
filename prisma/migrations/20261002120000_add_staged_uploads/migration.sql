-- Staged uploads: files MCP clients upload before attaching them to a
-- library, project workflow or campaign.

-- CreateTable
CREATE TABLE IF NOT EXISTS "StagedUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_upload',
    "filename" TEXT NOT NULL,
    "declaredMimeType" TEXT NOT NULL,
    "declaredSize" BIGINT NOT NULL,
    "kind" TEXT,
    "mimeType" TEXT,
    "size" BIGINT,
    "storedSize" BIGINT,
    "storageKey" TEXT,
    "thumbnailKey" TEXT,
    "optimizedKey" TEXT,
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagedUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StagedUpload_tokenHash_key" ON "StagedUpload"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StagedUpload_userId_idx" ON "StagedUpload"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StagedUpload_expiresAt_idx" ON "StagedUpload"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StagedUpload" ADD CONSTRAINT "StagedUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
