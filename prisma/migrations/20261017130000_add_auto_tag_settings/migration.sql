-- CreateTable
CREATE TABLE "AutoTagSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "modelConfigId" TEXT,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoTagSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoTagSetting_userId_key" ON "AutoTagSetting"("userId");

-- CreateIndex
CREATE INDEX "AutoTagSetting_providerId_idx" ON "AutoTagSetting"("providerId");

-- AddForeignKey
ALTER TABLE "AutoTagSetting" ADD CONSTRAINT "AutoTagSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoTagSetting" ADD CONSTRAINT "AutoTagSetting_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

