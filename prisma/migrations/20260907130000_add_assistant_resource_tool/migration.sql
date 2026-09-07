-- Each resource row shows why it is listed: the tool behind its most recent
-- mention. Nullable because rows written before this carry no tool.

-- AlterTable
ALTER TABLE "AssistantConversationResource" ADD COLUMN IF NOT EXISTS "toolName" TEXT;

-- AlterTable
ALTER TABLE "AssistantConversationResource" ADD COLUMN IF NOT EXISTS "toolTitle" TEXT;
