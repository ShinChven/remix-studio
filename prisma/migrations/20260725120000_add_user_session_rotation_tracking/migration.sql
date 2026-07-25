-- Track refresh-token rotation for web sessions so the refresh endpoint can
-- recover browsers whose rotation response was lost (grace-window replay) and
-- detect genuine reuse.
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "rotatedToId" TEXT;
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "UserSession_rotatedAt_idx" ON "UserSession"("rotatedAt");
