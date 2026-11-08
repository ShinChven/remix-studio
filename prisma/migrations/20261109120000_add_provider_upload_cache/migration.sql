-- CreateTable
CREATE TABLE "ProviderUploadCache" (
    "providerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "servedSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUploadCache_pkey" PRIMARY KEY ("providerId","endpoint","contentHash")
);

-- CreateIndex
CREATE INDEX "ProviderUploadCache_expiresAt_idx" ON "ProviderUploadCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProviderUploadCache" ADD CONSTRAINT "ProviderUploadCache_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
