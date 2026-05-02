CREATE TABLE IF NOT EXISTS "PostWatermarkSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "text" TEXT NOT NULL DEFAULT '',
  "position" TEXT NOT NULL DEFAULT 'center',
  "padding" INTEGER NOT NULL DEFAULT 32,
  "fontSize" INTEGER NOT NULL DEFAULT 48,
  "opacity" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  "color" TEXT NOT NULL DEFAULT '#ffffff',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostWatermarkSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostWatermarkSetting_userId_key" ON "PostWatermarkSetting"("userId");
CREATE INDEX IF NOT EXISTS "PostWatermarkSetting_userId_idx" ON "PostWatermarkSetting"("userId");

ALTER TABLE "PostWatermarkSetting"
  ADD CONSTRAINT "PostWatermarkSetting_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
