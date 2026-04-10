-- AlterTable: Add text generation fields to Project
ALTER TABLE "Project" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "Project" ADD COLUMN "systemPrompt" TEXT;
ALTER TABLE "Project" ADD COLUMN "temperature" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "maxTokens" INTEGER;

-- AlterTable: Add resultText to Job
ALTER TABLE "Job" ADD COLUMN "resultText" TEXT;

-- AlterTable: Add textContent to AlbumItem
ALTER TABLE "AlbumItem" ADD COLUMN "textContent" TEXT;

-- AlterTable: Add textContent to TrashItem
ALTER TABLE "TrashItem" ADD COLUMN "textContent" TEXT;
