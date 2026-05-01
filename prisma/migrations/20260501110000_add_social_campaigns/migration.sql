-- Create social campaign tables before later PostMedia migrations alter them.
CREATE TABLE IF NOT EXISTS "SocialAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "profileName" TEXT,
  "avatarUrl" TEXT,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "scopes" JSONB,
  "expiresAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "rateLimitResetAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Post" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "textContent" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PostMedia" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "processedUrl" TEXT,
  "thumbnailUrl" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "quality" TEXT NOT NULL DEFAULT 'high',
  "mimeType" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "size" BIGINT,
  "errorMsg" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PostExecution" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "externalId" TEXT,
  "externalUrl" TEXT,
  "errorMsg" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "_CampaignToSocialAccount" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_userId_platform_accountId_key" ON "SocialAccount"("userId", "platform", "accountId");
CREATE INDEX IF NOT EXISTS "SocialAccount_status_idx" ON "SocialAccount"("status");
CREATE INDEX IF NOT EXISTS "Campaign_userId_status_idx" ON "Campaign"("userId", "status");
CREATE INDEX IF NOT EXISTS "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "PostMedia_status_idx" ON "PostMedia"("status");
CREATE INDEX IF NOT EXISTS "PostExecution_status_nextAttemptAt_idx" ON "PostExecution"("status", "nextAttemptAt");
CREATE UNIQUE INDEX IF NOT EXISTS "_CampaignToSocialAccount_AB_unique" ON "_CampaignToSocialAccount"("A", "B");
CREATE INDEX IF NOT EXISTS "_CampaignToSocialAccount_B_index" ON "_CampaignToSocialAccount"("B");

DO $$
BEGIN
  ALTER TABLE "SocialAccount"
    ADD CONSTRAINT "SocialAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Post"
    ADD CONSTRAINT "Post_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Post"
    ADD CONSTRAINT "Post_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PostMedia"
    ADD CONSTRAINT "PostMedia_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PostExecution"
    ADD CONSTRAINT "PostExecution_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PostExecution"
    ADD CONSTRAINT "PostExecution_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "_CampaignToSocialAccount"
    ADD CONSTRAINT "_CampaignToSocialAccount_A_fkey"
    FOREIGN KEY ("A") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "_CampaignToSocialAccount"
    ADD CONSTRAINT "_CampaignToSocialAccount_B_fkey"
    FOREIGN KEY ("B") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
