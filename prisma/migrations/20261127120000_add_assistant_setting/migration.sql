-- CreateTable
CREATE TABLE "AssistantSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabledProviderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastProviderId" TEXT,
    "lastModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSetting_userId_key" ON "AssistantSetting"("userId");

-- AddForeignKey
ALTER TABLE "AssistantSetting" ADD CONSTRAINT "AssistantSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
