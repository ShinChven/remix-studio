-- AlterTable
ALTER TABLE "Project" ADD COLUMN "comfyUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "comfyWorkflow" JSONB;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "comfyInputs" JSONB;

-- AlterTable
ALTER TABLE "WorkflowItem" ADD COLUMN "comfyTarget" JSONB;
