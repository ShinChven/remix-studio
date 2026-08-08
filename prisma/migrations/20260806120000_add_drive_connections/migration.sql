-- Releases: a user can connect several cloud drives (Google Drive, OneDrive, MEGA)
-- alongside their storefronts. Google Drive used to be a single refresh token on
-- "User"; those connections are migrated into "DriveConnection" below.

CREATE TABLE IF NOT EXISTS "DriveConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "displayName" TEXT,
  "email" TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "credentials" TEXT,
  "scopes" JSONB,
  "expiresAt" TIMESTAMP(3),
  "folderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DriveConnection_userId_provider_accountId_key"
  ON "DriveConnection"("userId", "provider", "accountId");

CREATE INDEX IF NOT EXISTS "DriveConnection_userId_status_idx"
  ON "DriveConnection"("userId", "status");

ALTER TABLE "DriveConnection"
  ADD CONSTRAINT "DriveConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing single-slot Google Drive connections over. The remote account
-- id isn't known here, so a "legacy:" placeholder is used; the OAuth callback
-- replaces these rows with a fully described connection on the next reconnect.
INSERT INTO "DriveConnection" ("id", "userId", "provider", "accountId", "displayName", "email", "refreshToken", "status", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  "id",
  'google-drive',
  'legacy:' || "id",
  'Google Drive',
  "email",
  "googleDriveRefreshToken",
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "googleDriveRefreshToken" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN IF EXISTS "googleDriveRefreshToken";

-- Deliveries and history rows now point at the drive they targeted.
ALTER TABLE "DeliveryTask" ADD COLUMN IF NOT EXISTS "driveConnectionId" TEXT;
ALTER TABLE "StoreUploadHistory" ADD COLUMN IF NOT EXISTS "driveConnectionId" TEXT;

CREATE INDEX IF NOT EXISTS "DeliveryTask_driveConnectionId_idx"
  ON "DeliveryTask"("driveConnectionId");
CREATE INDEX IF NOT EXISTS "StoreUploadHistory_driveConnectionId_idx"
  ON "StoreUploadHistory"("driveConnectionId");

ALTER TABLE "DeliveryTask"
  ADD CONSTRAINT "DeliveryTask_driveConnectionId_fkey"
  FOREIGN KEY ("driveConnectionId") REFERENCES "DriveConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreUploadHistory"
  ADD CONSTRAINT "StoreUploadHistory_driveConnectionId_fkey"
  FOREIGN KEY ("driveConnectionId") REFERENCES "DriveConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing drive deliveries used the single Google Drive slot.
UPDATE "DeliveryTask" d
SET "driveConnectionId" = c."id"
FROM "DriveConnection" c
WHERE d."destination" = 'drive'
  AND d."driveConnectionId" IS NULL
  AND c."userId" = d."userId"
  AND c."provider" = 'google-drive';
