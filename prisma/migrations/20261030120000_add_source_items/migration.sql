-- Job, AlbumItem, TrashItem: the library items a job was drafted from, as
-- [{ "libraryId": ..., "itemId": ... }], which its album items keep so a
-- result can be traced back to its sources and a source to its results.
ALTER TABLE "Job" ADD COLUMN "sourceItems" JSONB;
ALTER TABLE "AlbumItem" ADD COLUMN "sourceItems" JSONB;
ALTER TABLE "TrashItem" ADD COLUMN "sourceItems" JSONB;

CREATE INDEX "AlbumItem_sourceItems_idx" ON "AlbumItem" USING GIN ("sourceItems" jsonb_path_ops);
