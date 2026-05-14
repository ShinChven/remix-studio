ALTER TABLE "AssistantConversation"
  ADD COLUMN IF NOT EXISTS "approvedTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
