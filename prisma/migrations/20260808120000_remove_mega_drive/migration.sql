-- MEGA is no longer a supported release destination. Its sign-in had no OAuth
-- equivalent, so connecting an account meant storing the account password (the
-- key MEGA derives its master key from) for every upload — a full-account
-- secret with no scope and no way to revoke it short of a password change.
--
-- Existing connections are removed here rather than left dormant, so the stored
-- passwords leave the database with the feature.

-- Deliveries still queued against a MEGA drive can never run again.
UPDATE "DeliveryTask" d
SET "status" = 'failed',
    "error" = 'MEGA support was removed. Release this export to another connected drive.'
FROM "DriveConnection" c
WHERE d."driveConnectionId" = c."id"
  AND c."provider" = 'mega'
  AND d."status" IN ('pending', 'processing');

-- History rows keep their "mega" platform label; the foreign key nulls itself
-- out (ON DELETE SET NULL) so past releases stay visible in Release History.
DELETE FROM "DriveConnection" WHERE "provider" = 'mega';

-- The column only ever held MEGA's email/password blob.
ALTER TABLE "DriveConnection" DROP COLUMN IF EXISTS "credentials";
