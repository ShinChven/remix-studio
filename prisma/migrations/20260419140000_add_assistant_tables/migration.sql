-- AddAssistantTables: persistence for the standalone assistant chat runtime.
-- Kept separate from the generation queue so chat state and job state do not
-- bleed into each other.

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "title"         TEXT NOT NULL DEFAULT 'New chat',
    "providerId"    TEXT,
    "modelConfigId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt"    TIMESTAMP(3),

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_idx" ON "AssistantConversation"("userId");

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_updatedAt_idx" ON "AssistantConversation"("userId", "updatedAt");

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role"           TEXT NOT NULL,
    "content"        TEXT NOT NULL DEFAULT '',
    "toolCalls"      JSONB,
    "toolCallId"     TEXT,
    "toolName"       TEXT,
    "toolArgsJson"   JSONB,
    "toolResultJson" JSONB,
    "status"         TEXT,
    "stopReason"     TEXT,
    "inputTokens"    INTEGER,
    "outputTokens"   INTEGER,
    "errorText"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_idx" ON "AssistantMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- CreateTable
CREATE TABLE "AssistantPendingConfirmation" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId"      TEXT NOT NULL,
    "toolCallId"     TEXT NOT NULL,
    "toolName"       TEXT NOT NULL,
    "toolArgsJson"   JSONB NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantPendingConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantPendingConfirmation_conversationId_idx" ON "AssistantPendingConfirmation"("conversationId");

-- CreateIndex
CREATE INDEX "AssistantPendingConfirmation_conversationId_status_idx" ON "AssistantPendingConfirmation"("conversationId", "status");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantPendingConfirmation" ADD CONSTRAINT "AssistantPendingConfirmation_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
