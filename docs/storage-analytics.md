# Storage Analytics Design

This document describes how per-user storage usage is calculated and reported in the
`/storage` dashboard. Developers and AI agents modifying storage-related code must read
this first to avoid introducing data inconsistencies.

---

## Overview

Storage usage is reported via a single API endpoint:

```
GET /api/storage/analysis
```

The response breaks down a user's total storage into categories (Projects, Libraries,
Archives, Recycle Bin) and provides a per-project ranking.

---

## Guiding Principle: DB is the Source of Truth

**All categorized sizes are calculated from DynamoDB-stored `size` fields, not from S3.**

Every file-bearing record in DynamoDB (`AlbumItem`, `TrashItem`, `LibraryItem`)
stores three size fields written at upload time:

| Field | What it measures |
|-------|-----------------|
| `size` | Original file size in bytes |
| `optimizedSize` | Optimized/compressed version size |
| `thumbnailSize` | Thumbnail size |

The storage analysis sums all three fields for every relevant record:
```ts
const itemSize = (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
```

This approach ensures the Storage dashboard always agrees with what the user sees on the
Project Album page, Trash page, and Library page — because they all read from the same DB fields.

> **Why not scan S3 directly?**
> S3 key matching against DB URLs is unreliable. URL encoding differences, path format
> mismatches, and missing S3 objects all produce silent zero-size results. DB fields are
> written atomically at upload time and are always consistent.

---

## Data Flow

```
GET /api/storage/analysis
  │
  ├─ 1. Parallel DB fetch
  │     ├─ getAllUserItems(userId)   → aggregates items across multiple PostgreSQL tables
  │     ├─ getTrashItems(userId)    → trash records (for size sum)
  │     └─ userRepository.findById  → storage limit from user record
  │
  ├─ 2. S3 scan (main bucket only)
  │     └─ listObjectsWithMetadata(`{userId}/`)  → used for orphan detection only
  │
  ├─ 3. DB-based size aggregation (main loop)
  │     Iterates all items, dispatches by SK prefix:
  │     ├─ PROJECT#pid#ALBUM#iid  → album size   (DB size fields)
  │     ├─ PROJECT#pid#JOB#jid   → referenced only, not counted toward storage
  │     ├─ PROJECT#pid#WF#wid    → workflow size (DB size fields)
  │     ├─ LIBRARY#lid#ITEM#iid  → library size  (DB size fields)
  │     ├─ TRASH#iid             → keys marked (size from getTrashItems)
  │     └─ EXPORT#tid            → collected for step 5
  │
  ├─ 4. S3 orphan scan
  │     S3 objects NOT in referencedKeys → assigned to project as "orphan" size
  │
  ├─ 5. Archive size lookup
  │     For each completed export task: exportStorage.getSize(task.s3Key)
  │
  └─ 6. Aggregate & respond
```

---

## Categories and Their Data Sources

| Category | Sub-category | Data Source |
|----------|-------------|-------------|
| Projects | Album | DB: `AlbumItem.size + optimizedSize + thumbnailSize` |
| Projects | Workflow | DB: `WorkflowItem.size + optimizedSize + thumbnailSize` |
| Projects | Orphans | S3 scan: files in project folder not in DB |
| Libraries | — | DB: `LibraryItem.size + optimizedSize + thumbnailSize` |
| Archives | — | S3 `HeadObject` on `ExportTask.s3Key` |
| Recycle Bin | — | DB: `TrashItem.size + optimizedSize + thumbnailSize` |

### Why Archives Use S3 and Not DB

Export task records store `s3Key` but not the file size. The ZIP size is only known after
the archive is built and uploaded. Storing the size back in the DB after upload would
require an extra write and a `getSize` call anyway. Since the number of export tasks per
user is small (typically single digits), a `HeadObject` call per completed task is acceptable.

> If this becomes a bottleneck at scale, add a `zipSize` field to `ExportTask` and write
> it at upload time (in `ExportManager.runExportTask`).

---

## Orphan Detection

An **orphan** is a file that exists in S3 under a project folder but is not referenced by
any DB record (not in Album, Jobs, Workflow, or Trash).

Orphan detection works in two steps:

1. **Build `referencedKeys`**: During the DB iteration phase, every known S3 key (imageUrl,
   thumbnailUrl, optimizedUrl, content) is added to a `Set<string>`.

2. **S3 scan**: Every object under `{userId}/` is checked against `referencedKeys`.
   - If found → already counted, skip.
   - If not found and path matches a known project folder (`{userId}/{projectId}/`) →
     counted as an orphan for that project.
   - If not found and no project matches → ignored (prevents double-counting trash/library
     files whose sizes were already summed from DB).

Orphan size is included in the project's `total` but reported separately under `orphans`
so the UI can highlight it.

---

## Storage Limit

Each user has a `storageLimit` field in their DynamoDB record (`USER#sk` partition).
The default is **5 GB** if no limit is set.

The limit is fetched via `UserRepository.findById` during the analysis pass and returned
alongside the usage total so the frontend can render the usage bar correctly.

> The limit is **not** stored in the JWT. It is always read from the DB at request time,
> so admin changes take effect immediately without requiring the user to log out.

---

## API Response Shape

```ts
interface StorageAnalysis {
  totalSize: number;       // bytes
  limit: number;           // bytes (user's storage quota)
  categories: {
    id: string;            // 'projects' | 'libraries' | 'archives' | 'trash'
    name: string;
    size: number;          // bytes
    subCategories?: {
      id: string;          // 'album' | 'drafts' | 'workflow' | 'orphans'
      name: string;
      size: number;
    }[];
  }[];
  projects: {
    id: string;
    name: string;
    total: number;
    album: number;
    drafts: number;
    workflow: number;
    orphans: number;
  }[];   // sorted by total descending
}
```

---

## Quota Enforcement Consistency

The pre-upload quota check (`server/utils/storage-check.ts`) uses the **exact same
DB-first strategy** as the analytics endpoint. Both call `getAllUserItems`, sum the same
three size fields for album, workflow, library, and trash records, and look up export
sizes via `task.s3Key`.

This means:
- The storage bar the user sees on the dashboard reflects what the upload gate actually enforces.
- There is no gap where uploads are allowed but not counted, or counted but not enforced.

> **Critical rule:** If the aggregation logic in `storage-router.ts` changes, the same
> change must be applied to `storage-check.ts`. The two files must always use identical
> size calculation logic.

---

## Related Files

| File | Role |
|------|------|
| `server/routes/storage-router.ts` | Implements `GET /api/storage/analysis` — all aggregation logic lives here |
| `server/utils/storage-check.ts` | Pre-upload quota enforcement — **must stay in sync with storage-router.ts** |
| `server/db/project-repository.ts` | `getAllUserItems()` — full partition scan used as input |
| `server/storage/s3-storage.ts` | `listObjectsWithMetadata()` for orphan scan; `getSize()` for archive sizing |
| `src/components/StorageView.tsx` | Frontend dashboard that renders the analysis response |
| `src/api.ts` | `fetchStorageAnalysis()` — calls the API endpoint |

---

## Consistency Guarantees

The dashboard is guaranteed to match the data shown on individual pages because:

- **Project Album page** sums `AlbumItem` records from DB → same records used here
- **Trash page** lists `TrashItem` records from DB → same records used here
- **Library page** lists `LibraryItem` records from DB → same records used here

The only category that may diverge is **Orphans**, as it reflects files physically present
in S3 but not tracked in the DB. This is intentional — orphans are abnormal and should be
surfaced to the user for cleanup.
