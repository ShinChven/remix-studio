ALTER TABLE "InviteCode"
ADD COLUMN "maxUses" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "InviteRedemption" (
  "id" TEXT NOT NULL,
  "inviteCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InviteRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteRedemption_userId_key" ON "InviteRedemption"("userId");
CREATE INDEX "InviteRedemption_inviteCodeId_redeemedAt_idx" ON "InviteRedemption"("inviteCodeId", "redeemedAt");

ALTER TABLE "InviteRedemption"
ADD CONSTRAINT "InviteRedemption_inviteCodeId_fkey"
FOREIGN KEY ("inviteCodeId") REFERENCES "InviteCode"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteRedemption"
ADD CONSTRAINT "InviteRedemption_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
