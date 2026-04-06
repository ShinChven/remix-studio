# Export Archive Storage & Cleanup Policy

This document covers how export archives (ZIP files) are stored, automatically expired,
and cleaned up in production. Any developer or AI agent working on the export system
**must read this before making changes.**

---

## Architecture Overview

Export archives use a **two-layer auto-cleanup strategy**:

| Layer | Mechanism | What it cleans |
|-------|-----------|----------------|
| DynamoDB TTL | Built-in AWS feature | DB records (export task metadata) |
| S3 Lifecycle Policy | S3 bucket rule | ZIP files in the export bucket |

Both layers are independent and must be configured together for complete cleanup.

---

## DynamoDB TTL — Auto-expire DB Records

Every export task record written to DynamoDB includes a `ttl` field (Unix timestamp in **seconds**).
AWS DynamoDB automatically deletes items when the current time exceeds their `ttl` value.

### TTL Values (set in `server/queue/export-manager.ts`)

| Task Status | TTL | Reason |
|-------------|-----|--------|
| `failed` | 24 hours from failure time | Failed tasks are noise; delete quickly |
| `completed` | 30 days from completion time | Give users time to download before cleanup |
| `pending` / `processing` | No TTL set | Long-running tasks are not expired |

### How to Enable TTL on the Table

TTL is enabled automatically when the DynamoDB table is first created (see `server/db/init-table.ts`).
The TTL attribute name is `ttl`.

To enable manually via AWS CLI:
```bash
aws dynamodb update-time-to-live \
  --table-name remix-studio \
  --time-to-live-specification "Enabled=true, AttributeName=ttl"
```

> **Note:** DynamoDB Local (used in local development) does **not** support TTL.
> Records will not be auto-deleted locally. This is expected and safe.

> **Note:** AWS TTL deletion has a latency of up to 48 hours after expiry. This is by design —
> records are guaranteed to be deleted eventually, but not immediately at the exact TTL timestamp.

---

## S3 Lifecycle Policy — Auto-delete ZIP Files

DynamoDB TTL only removes the DB record. The ZIP file in the export S3 bucket must be cleaned
up separately using an **S3 Lifecycle Policy**.

### S3 Key Structure

All export ZIPs are stored under a per-user path:
```
{userId}/exports/{taskId}/{projectName}_Album.zip
```

### Recommended Lifecycle Policy

Apply this to the **export bucket only** (e.g. `remix-studio-exports`), not the main image bucket.

**AWS Console (S3 → Bucket → Management → Lifecycle Rules):**
1. Create rule with name: `auto-delete-exports`
2. **Scope:** All objects in the bucket (or prefix filter if needed)
3. **Expiration:** 30 days after object creation
4. Enable the rule

**AWS CLI:**
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket remix-studio-exports \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "auto-delete-exports",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "Expiration": { "Days": 30 }
    }]
  }'
```

**MinIO (local development) via mc CLI:**
```bash
mc ilm add myminio/remix-studio-exports --expiry-days 30
```

**MinIO Console:**
Navigate to the export bucket → Management → Lifecycle → Add Lifecycle Rule → set Expiry to 30 days.

---

## Manual Deletion (User-Triggered)

When a user deletes an export record from the Archive page, the server:
1. Looks up the task by `taskId` to retrieve the stored `s3Key`
2. Deletes the ZIP file from S3: `DELETE {s3Key}`
3. Deletes the DB record from DynamoDB

This is handled in `DELETE /api/exports/:taskId` in `server/routes/projects.ts`.

---

## Why `s3Key` and Not `downloadUrl`

Early versions stored a presigned URL (`downloadUrl`) in the DB. This was problematic:
- Presigned URLs expire after 1 hour — making stored links useless
- The stored URL was tied to a specific endpoint format, making bucket migrations harder

The current design stores the raw **S3 key** (`s3Key`) in DynamoDB and generates a fresh
presigned URL on every read. Presigned URLs are **never persisted**.

---

## Cleanup Summary

| Scenario | DB Record | S3 File |
|----------|-----------|---------|
| User manually deletes | Deleted immediately | Deleted immediately |
| Task fails | Auto-deleted after 24h (TTL) | Auto-deleted after 30d (Lifecycle) |
| Task completes, user never deletes | Auto-deleted after 30d (TTL) | Auto-deleted after 30d (Lifecycle) |
| Local dev (DynamoDB Local) | **Not auto-deleted** (TTL unsupported) | Cleaned by Lifecycle if configured |

---

## Related Files

| File | Purpose |
|------|---------|
| `server/queue/export-manager.ts` | Sets `ttl` field on task save |
| `server/db/project-repository.ts` | `saveExportTask`, `deleteExportTask` (flat SK: `EXPORT#{taskId}`) |
| `server/db/init-table.ts` | Enables TTL on table creation |
| `server/routes/projects.ts` | `DELETE /api/exports/:taskId` — deletes S3 + DB |
