-- Track refresh-token rotation so the token endpoint can recover clients whose
-- rotation response was lost (grace-window replay) and detect genuine reuse.
ALTER TABLE "OAuthAccessToken" ADD COLUMN IF NOT EXISTS "rotatedToId" TEXT;
ALTER TABLE "OAuthAccessToken" ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP(3);
