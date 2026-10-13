-- AlbumItem / TrashItem: what a Civitai result was generated with, kept with
-- the result so it outlives the job that produced it.
ALTER TABLE "AlbumItem" ADD COLUMN "civitaiParams" JSONB;
ALTER TABLE "TrashItem" ADD COLUMN "civitaiParams" JSONB;
