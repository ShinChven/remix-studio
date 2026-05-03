DROP INDEX IF EXISTS "LibraryItem_libraryId_order_idx";
ALTER TABLE "LibraryItem" DROP COLUMN IF EXISTS "order";
