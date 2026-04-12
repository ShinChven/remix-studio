-- AlterTable
ALTER TABLE "AlbumItem" ADD COLUMN "duration" INTEGER;
ALTER TABLE "AlbumItem" ADD COLUMN "resolution" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "duration" INTEGER;
ALTER TABLE "Job" ADD COLUMN "resolution" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "duration" INTEGER;
ALTER TABLE "Project" ADD COLUMN "resolution" TEXT;

-- AlterTable
ALTER TABLE "TrashItem" ADD COLUMN "duration" INTEGER;
ALTER TABLE "TrashItem" ADD COLUMN "resolution" TEXT;
