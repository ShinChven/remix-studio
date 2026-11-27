-- AlterTable
ALTER TABLE "AssistantMessage" ADD COLUMN     "swarmAgentId" TEXT;

-- AlterTable
ALTER TABLE "AssistantPendingConfirmation" ADD COLUMN     "swarmAgentId" TEXT;

-- AlterTable
ALTER TABLE "AssistantSetting" ADD COLUMN     "swarmEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "swarmPresetsJson" JSONB,
ADD COLUMN     "swarmWorkerModelId" TEXT,
ADD COLUMN     "swarmWorkerProviderId" TEXT;

-- CreateTable
CREATE TABLE "AssistantSwarmRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantSwarmRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSwarmAgent" (
    "id" TEXT NOT NULL,
    "swarmRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "providerId" TEXT,
    "modelConfigId" TEXT,
    "toolScope" TEXT NOT NULL DEFAULT 'read',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantSwarmAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSwarmBlackboardEntry" (
    "id" TEXT NOT NULL,
    "swarmRunId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "dataJson" JSONB,
    "authorAgentId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantSwarmBlackboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantSwarmRun_conversationId_createdAt_idx" ON "AssistantSwarmRun"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantSwarmAgent_swarmRunId_createdAt_idx" ON "AssistantSwarmAgent"("swarmRunId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantSwarmBlackboardEntry_conversationId_updatedAt_idx" ON "AssistantSwarmBlackboardEntry"("conversationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSwarmBlackboardEntry_swarmRunId_key_key" ON "AssistantSwarmBlackboardEntry"("swarmRunId", "key");

-- CreateIndex
CREATE INDEX "AssistantMessage_swarmAgentId_createdAt_idx" ON "AssistantMessage"("swarmAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantPendingConfirmation_swarmAgentId_status_idx" ON "AssistantPendingConfirmation"("swarmAgentId", "status");

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_swarmAgentId_fkey" FOREIGN KEY ("swarmAgentId") REFERENCES "AssistantSwarmAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingConfirmation" ADD CONSTRAINT "AssistantPendingConfirmation_swarmAgentId_fkey" FOREIGN KEY ("swarmAgentId") REFERENCES "AssistantSwarmAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSwarmRun" ADD CONSTRAINT "AssistantSwarmRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSwarmAgent" ADD CONSTRAINT "AssistantSwarmAgent_swarmRunId_fkey" FOREIGN KEY ("swarmRunId") REFERENCES "AssistantSwarmRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSwarmBlackboardEntry" ADD CONSTRAINT "AssistantSwarmBlackboardEntry_swarmRunId_fkey" FOREIGN KEY ("swarmRunId") REFERENCES "AssistantSwarmRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

