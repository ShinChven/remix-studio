-- Job: the tags of the library items a job was drafted from, which the album
-- items it produces start with.
ALTER TABLE "Job" ADD COLUMN "tags" JSONB;
