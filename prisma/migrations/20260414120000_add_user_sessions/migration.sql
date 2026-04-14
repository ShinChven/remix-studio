-- AddUserSessions: Adds the UserSession table for refresh token storage.
-- This enables dual-token auth (2h access token + 30d refresh token)
-- with server-side session tracking and atomic token rotation.

CREATE TABLE "UserSession" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- Unique index for fast lookup by token hash (used on every refresh request)
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- Index for listing/deleting all sessions for a user (logout all devices)
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- Index for fast lookup by tokenHash (covers refresh endpoint queries)
CREATE INDEX "UserSession_tokenHash_idx" ON "UserSession"("tokenHash");

-- Foreign key: cascade delete when user is deleted
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
