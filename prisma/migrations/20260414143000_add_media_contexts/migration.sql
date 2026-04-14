ALTER TABLE "Job"
ADD COLUMN "videoContexts" JSONB,
ADD COLUMN "audioContexts" JSONB;

ALTER TABLE "AlbumItem"
ADD COLUMN "videoContexts" JSONB,
ADD COLUMN "audioContexts" JSONB;

ALTER TABLE "TrashItem"
ADD COLUMN "videoContexts" JSONB,
ADD COLUMN "audioContexts" JSONB;
