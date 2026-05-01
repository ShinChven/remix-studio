-- Add position column with default 0
ALTER TABLE "PostMedia" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill position by createdAt ascending within each post
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "postId" ORDER BY "createdAt" ASC, id ASC) - 1 AS pos
  FROM "PostMedia"
)
UPDATE "PostMedia" pm SET "position" = ordered.pos
FROM ordered
WHERE pm.id = ordered.id;

-- Index for fast ordered reads per post
CREATE INDEX "PostMedia_postId_position_idx" ON "PostMedia"("postId", "position");
