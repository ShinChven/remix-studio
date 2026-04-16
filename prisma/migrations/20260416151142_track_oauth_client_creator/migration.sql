-- AlterTable
ALTER TABLE "OAuthClient"
ADD COLUMN "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "OAuthClient_createdByUserId_idx" ON "OAuthClient"("createdByUserId");

-- AddForeignKey
ALTER TABLE "OAuthClient"
ADD CONSTRAINT "OAuthClient_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
