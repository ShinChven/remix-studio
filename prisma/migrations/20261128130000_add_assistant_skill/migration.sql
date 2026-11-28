-- CreateTable
CREATE TABLE "AssistantSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantSkill_userId_createdAt_idx" ON "AssistantSkill"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantSkill" ADD CONSTRAINT "AssistantSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy skills out of the text libraries that used to hold them. The libraries
-- themselves are left in place as ordinary text libraries.
INSERT INTO "AssistantSkill" ("id", "userId", "title", "content", "createdAt", "updatedAt")
SELECT
    li."id",
    l."userId",
    COALESCE(NULLIF(BTRIM(li."title"), ''), LEFT(BTRIM(REGEXP_REPLACE(li."content", '\s+', ' ', 'g')), 80)),
    li."content",
    li."createdAt",
    li."updatedAt"
FROM "LibraryItem" li
JOIN "Library" l ON l."id" = li."libraryId"
WHERE l."name" = 'Assistant Skills' AND l."type" = 'text'
ON CONFLICT ("id") DO NOTHING;
