-- Album items (and the trash records they become when deleted) carry a
-- free-form tag list, stored as a JSON string array the same way
-- "LibraryItem"."tags" is.

-- AlterTable
ALTER TABLE "AlbumItem" ADD COLUMN IF NOT EXISTS "tags" JSONB;

-- AlterTable
ALTER TABLE "TrashItem" ADD COLUMN IF NOT EXISTS "tags" JSONB;
