ALTER TABLE "User"
ADD COLUMN "createdByUserId" TEXT;

ALTER TABLE "User"
ADD CONSTRAINT "User_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_createdByUserId_idx" ON "User"("createdByUserId");

CREATE TABLE "InviteCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeEncrypted" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "usedByUserId" TEXT,
  "usedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteCode_codeHash_key" ON "InviteCode"("codeHash");
CREATE INDEX "InviteCode_createdByUserId_idx" ON "InviteCode"("createdByUserId");
CREATE INDEX "InviteCode_usedByUserId_idx" ON "InviteCode"("usedByUserId");
CREATE INDEX "InviteCode_codeHash_idx" ON "InviteCode"("codeHash");

ALTER TABLE "InviteCode"
ADD CONSTRAINT "InviteCode_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteCode"
ADD CONSTRAINT "InviteCode_usedByUserId_fkey"
FOREIGN KEY ("usedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
