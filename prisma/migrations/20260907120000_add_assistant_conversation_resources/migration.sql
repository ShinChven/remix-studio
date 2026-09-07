-- Workspace entities a conversation has touched. A row is upserted whenever an
-- assistant tool call resolves to a library, project, campaign, or post, so the
-- assistant sidebar can list them across reloads, most recent first.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantConversationResource" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT,
    "subType" TEXT,
    "href" TEXT NOT NULL,
    "summary" TEXT,
    "mentionCount" INTEGER NOT NULL DEFAULT 1,
    "lastMentionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantConversationResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantConversationResource_entity_key"
    ON "AssistantConversationResource"("conversationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistantConversationResource_recent_idx"
    ON "AssistantConversationResource"("conversationId", "lastMentionedAt");

-- AddForeignKey
ALTER TABLE "AssistantConversationResource"
    ADD CONSTRAINT "AssistantConversationResource_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
