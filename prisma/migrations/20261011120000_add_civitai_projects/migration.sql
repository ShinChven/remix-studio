-- AlterTable
ALTER TABLE "Project" ADD COLUMN "civitaiConfig" JSONB;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "civitaiParams" JSONB;
