CREATE TABLE IF NOT EXISTS "Store" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "profileName" TEXT,
  "email" TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "scopes" JSONB,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Store_userId_platform_accountId_key"
  ON "Store"("userId", "platform", "accountId");

CREATE INDEX IF NOT EXISTS "Store_userId_status_idx"
  ON "Store"("userId", "status");

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
