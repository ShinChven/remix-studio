-- Media sharing: devices allowed to browse project albums (TV mode, WebDAV,
-- DLNA) and the short-lived pairing requests TVs use to get linked.

-- CreateTable
CREATE TABLE IF NOT EXISTS "MediaDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT,
    "tokenPrefix" TEXT,
    "projectIds" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "lastSeenIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MediaPairing" (
    "id" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "deviceName" TEXT,
    "projectIds" JSONB,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaPairing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MediaDevice_tokenHash_key" ON "MediaDevice"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaDevice_userId_idx" ON "MediaDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MediaPairing_deviceCodeHash_key" ON "MediaPairing"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MediaPairing_userCode_key" ON "MediaPairing"("userCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MediaPairing_expiresAt_idx" ON "MediaPairing"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MediaDevice" ADD CONSTRAINT "MediaDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
