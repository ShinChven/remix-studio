-- ExportTask: the worker's input (every album item to archive and, for a
-- project bundle, its whole manifest) used to live in "data", which the
-- exports list and every status poll read back in full — tens of megabytes
-- for one page of a busy account. It moves to its own column that those
-- reads leave out.
ALTER TABLE "ExportTask" ADD COLUMN "payload" JSONB;

-- Tasks still waiting for (or held by) a worker keep their input.
UPDATE "ExportTask"
SET "payload" = (
  SELECT jsonb_object_agg(key, value)
  FROM jsonb_each("data")
  WHERE key IN ('items', 'bundleManifest')
)
WHERE "status" IN ('pending', 'processing')
  AND ("data" ? 'items' OR "data" ? 'bundleManifest');

-- Settled tasks never read it again.
UPDATE "ExportTask"
SET "data" = "data" - 'items' - 'bundleManifest'
WHERE "data" ? 'items' OR "data" ? 'bundleManifest';
