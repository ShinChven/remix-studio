# Album Export — Streaming Architecture Plan

This document is the implementation plan for reworking album export to run safely on a
**4 GB RAM VPS** while producing **multi-GB ZIP archives**. It is a companion to
`export-archive-cleanup.md` (which covers post-export storage/TTL) and should be read
before touching `server/queue/export-manager.ts` or `server/storage/s3-storage.ts`.

---

## 1. Problem

The current implementation in `server/queue/export-manager.ts` buffers the entire archive
in memory twice over:

| Phase | Current behaviour | Memory held |
|-------|-------------------|-------------|
| 1. Download | `for` loop reads every image into `entries[]` as `Buffer` | Sum of all source files |
| 2. Zip | `archiver` pushes all chunks into a local `chunks[]`, then `Buffer.concat` | Sum of all source files (again) |
| 3. Upload | `S3Storage.save()` takes a `Buffer`, SDK holds another reference | Same buffer, pinned until PUT done |

Peak RSS is therefore roughly **2 × total source size**. For a 2 GB album this is ~4 GB,
which is larger than the entire VPS. Node's default old-space (~1.7 GB) is exceeded long
before that. Concurrent exports make it worse.

A secondary issue: `S3Storage.save()` uses `PutObjectCommand`, which requires a known
`Content-Length` — that API cannot stream an unknown-size archive even if we wanted it to.

---

## 2. Constraints

| Constraint | Value |
|-----------|-------|
| VPS RAM | 4 GB total |
| Co-resident services | API server, image-generation workers, Postgres / Redis |
| Realistic Node budget for export worker | ~300–500 MB |
| Typical archive size | Several GB (e.g. 200 × 10 MB) |
| Max tolerated archive size | No hard cap; must scale to 10+ GB |
| Download path | Must **not** pass through the VPS (egress budget is tight) |

The architecture must hold **per-task memory under ~50 MB** regardless of archive size.

---

## 3. Target Architecture

### 3.1 Pipeline

```
S3 GetObject (Readable)  ─┐
(one item at a time)      ├─▶ archiver (store mode) ─▶ PassThrough (byte counter) ─▶ Sink
                          ┘
```

- Source images are read from S3 one at a time as Node streams (`GetObjectCommand.Body`).
- `archiver` is used in **store mode** (`zlib: { level: 0 }`) — JPG/PNG are already
  compressed, and CPU is scarce on a 4 GB VPS.
- A `PassThrough` between `archiver` and the sink acts as a byte counter for runtime
  quota enforcement.
- `archiver` handles its own backpressure; the pipeline runs at the speed of the slowest
  link.

### 3.2 Per-task memory budget

| Component | Size |
|-----------|------|
| One in-flight source stream | ~4 MB (S3 SDK buffer) |
| `archiver` internal highWaterMark | 4 MB (reduced from default 16 MB) |
| `@aws-sdk/lib-storage` `Upload` | `partSize × queueSize` = 5 MB × 2 = 10 MB |
| Overhead / working set | ~10 MB |
| **Total per task** | **~30 MB** |

With a concurrency cap of 2, total export memory stays under ~80 MB.

### 3.3 Two kinds of long-running work

There are two distinct async jobs in this subsystem. They must not be conflated:

| Job | Produces | Triggered by | Phase |
|-----|----------|--------------|-------|
| **Export** | A ZIP archive stored in the export S3 bucket | User clicks "Export Album" | Phase 1 |
| **Delivery** | A copy of an existing archive placed at another destination (Drive, Dropbox, etc.) | User clicks "Push to Drive" on an already-completed export | Phase 2 |

**Both jobs are background tasks with their own DB record and status polling. Neither is
a synchronous HTTP request.** A "Push to Drive" click returns a `deliveryTaskId`
immediately; the frontend polls it the same way it polls `ExportTask`.

This separation matters because:

- The archive is built **once**. Delivering it to N destinations does not re-zip N times.
- Each destination can fail / retry independently without invalidating the archive.
- The user can add a destination hours after the export completes.
- Export concurrency and delivery concurrency have different limits (§5.1).

### 3.4 Sinks (pluggable destination writers)

A **sink** is the final writable in the streaming pipeline. Both jobs use sinks, but
they feed sinks from different sources:

| Job | Source stream | Sink input |
|-----|---------------|------------|
| Export | `archiver` over N source images | First write of a new archive |
| Delivery | `s3.readStream(exportKey)` over an existing ZIP | Re-upload of a completed archive |

| Sink | Used by | Status | Implementation |
|------|---------|--------|----------------|
| `S3ExportSink` | Export | **Phase 1** | `@aws-sdk/lib-storage` `Upload` to the export bucket |
| `DriveSink` | Delivery | Phase 2 | `googleapis` `drive.files.create` with resumable upload |
| `DirectDownloadSink` | Export (alt) | Phase 3 (optional) | Pipes archiver to an HTTP response |

A delivery job is just `s3.readStream(exportKey) → Sink` — no archiver, no image loop,
no quota re-check. Memory peak is whatever the sink's internal buffers use (~10 MB for
Drive's resumable chunks).

### 3.4 Upload: why `lib-storage` Upload, not `PutObjectCommand`

`PutObjectCommand` needs `Content-Length` up front; streaming archive size is unknown
until `finalize()`. `@aws-sdk/lib-storage`'s `Upload` class:

- Accepts a `Readable` body.
- Does S3 multipart internally: 5 MB per part, uploading parts as they fill.
- Auto-aborts the multipart upload on error when `leavePartsOnError: false` (default),
  so failed exports don't leak storage.
- Reports progress via `httpUploadProgress` events → drives the `current` field on the
  export task.

```ts
new Upload({
  client: this.client,
  params: { Bucket, Key, Body: passThrough, ContentType: 'application/zip' },
  partSize: 5 * 1024 * 1024,
  queueSize: 2,
  leavePartsOnError: false,
})
```

### 3.5 Append loop

`archiver` allows appending streams, but if you append all N streams up front you open N
concurrent S3 connections — defeats the memory budget. The loop must append **one at a
time** and wait for `archiver` to drain the previous entry:

```ts
for (const item of items) {
  const stream = imageStorage.readStream(item.imageUrl);
  archive.append(stream, { name });
  await once(archive, 'entry');
  updateTask({ current: ++done });
}
archive.finalize();
```

This guarantees only one source stream is open at any moment.

---

## 4. Quota Enforcement

Streaming means the final ZIP size is not known up front. Two layers of enforcement:

### 4.1 Pre-flight estimate

Before starting the pipeline:

1. `HeadObject` every source key to get `ContentLength`.
2. Sum them. ZIP overhead in store mode is ~100 bytes per entry — negligible.
3. Compare `currentUsage + estimatedTotal` against `user.storageLimit`. Reject early if
   over.

200 `HeadObject` calls take a few seconds and cost ~nothing compared to aborting mid-stream.

### 4.2 Runtime byte counter

The `PassThrough` in the pipeline increments a counter on every chunk. If
`counter + currentUsage > limit`, the task:

1. Calls `archive.abort()` and `upload.abort()`.
2. Marks the task `failed` with a quota error.
3. Multipart upload parts are cleaned up automatically by `leavePartsOnError: false`.

This catches discrepancies between estimate and reality (e.g. racing concurrent exports).

The two pre-existing checks in `server/routes/projects.ts:595` and
`server/queue/export-manager.ts:126-132` should be **unified** into the new estimator —
no more duplicated logic.

---

## 5. Global Queues and Worker Model

### 5.1 One queue per job type, shared by all users

There are exactly **two global queues**, both backed by Postgres tables, both shared
across all users:

| Queue | Backing table | Global concurrency |
|-------|---------------|---------------------|
| Export | `ExportTask` | 2 |
| Delivery | `DeliveryTask` | 2 |

Not per-user. A 4 GB VPS has a fixed total memory budget — partitioning it per user
makes it smaller, not fairer. Per-user quotas are enforced on *admission* (storage
limit, active-task cap) but *execution* happens out of a single pool.

Export and delivery have their own budgets because they saturate different resources:
export saturates S3 read + CPU + the archiver pipeline, delivery saturates outbound
network to a third party. A Drive upload in progress does not compete with a zip build
in progress.

### 5.2 Atomic claim via `FOR UPDATE SKIP LOCKED`

The queue is not a Redis data structure — it is a SQL query. A worker claims the next
task with a single atomic statement:

```sql
UPDATE "ExportTask"
SET status       = 'processing',
    "claimedAt"  = NOW(),
    "workerId"   = $1,
    "heartbeatAt" = NOW()
WHERE id = (
  SELECT id FROM "ExportTask"
  WHERE status = 'pending'
  ORDER BY "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

Properties:

- **Atomic.** Two workers racing for the same row cannot both win — `SKIP LOCKED`
  makes the loser skip that row and pick the next one.
- **FIFO by `createdAt`.** Good enough baseline for fairness (see §5.5).
- **Crash-safe.** A killed worker leaves the row as `processing`. The reaper (§5.4)
  brings it back to `pending` or marks it failed.
- **Horizontally scalable.** N workers on N processes or N hosts all claim from the
  same query with no coordination.

Prisma does not generate type-safe bindings for `FOR UPDATE SKIP LOCKED`. Use
`prisma.$queryRaw` for the claim step. Everything else (updates, reads) stays
type-safe.

### 5.3 Schema additions

Add to both `ExportTask` and the new `DeliveryTask`:

| Column | Type | Purpose |
|--------|------|---------|
| `claimedAt` | `DateTime?` | Set when a worker takes the row. Null for unclaimed. |
| `workerId` | `String?` | Opaque ID of the claiming worker process (uuid per process). Helps debugging. |
| `heartbeatAt` | `DateTime?` | Updated every ~10 s while the task is running. Stale heartbeat = worker dead. |
| `attempts` | `Int @default(0)` | Incremented on each claim. Cap at 3 to avoid infinite retries. |

Index needed: `@@index([status, createdAt])` so the claim query is fast.

### 5.4 Stuck-task recovery (reaper)

A worker can die between claim and completion: OOM, SIGKILL, VPS reboot. The row is
left as `processing` forever unless something recovers it.

A reaper job runs every ~1 minute:

```sql
UPDATE "ExportTask"
SET status = CASE WHEN attempts < 3 THEN 'pending' ELSE 'failed' END,
    error = CASE WHEN attempts >= 3 THEN 'worker timeout' ELSE error END,
    "claimedAt" = NULL,
    "workerId" = NULL
WHERE status = 'processing'
  AND "heartbeatAt" < NOW() - INTERVAL '2 minutes';
```

Workers update `heartbeatAt` every 10 seconds while running. If no heartbeat for 2
minutes, the task is considered dead and returns to `pending` for a retry — unless
already retried 3 times, in which case it is marked `failed`.

The reaper can live inside any worker process or in the API process; it's just a SQL
update running on a timer. Only one reaper at a time is needed — a lightweight advisory
lock (`pg_try_advisory_lock`) prevents duplicates.

### 5.5 Fairness (deferred)

Pure FIFO means one user submitting 20 exports blocks everyone else for an hour. Two
mitigations, in order of cost:

| Mitigation | When to add |
|------------|-------------|
| Per-user admission limit (max 3 pending/processing per user) | Phase 1, simple `COUNT` check in `startExport` before insert |
| Fair-share claim (round-robin users instead of pure FIFO) | Only if users complain. Replace the `ORDER BY createdAt` with a window function that prefers the user with the fewest recent tasks. |

The admission limit alone solves 90% of the starvation scenario at near-zero complexity.

### 5.6 Why we do NOT split out a worker process

An earlier draft proposed extracting export/delivery into a separate Node process, to
isolate OOM risk. **We are explicitly not doing this.** The reasoning:

**The risk being defended against is already gone after Phase 1.** With the streaming
pipeline, a single export holds ~30–50 MB. With `MAX_CONCURRENT_EXPORTS = 2` and
`MAX_CONCURRENT_DELIVERIES = 2`, total export+delivery memory tops out around 200 MB.
The previous OOM threat came from buffering whole archives — it does not exist once
§3 ships.

**The existing architecture is single-process.** `server/queue/queue-manager.ts` runs
image generation in-process today. Carving out a worker only for export would make it
an architectural outlier and force us to solve problems (cross-process locking,
`LISTEN/NOTIFY` wake-ups, deployment topology, log aggregation) that don't exist in a
single process.

**The claim loop is already portable.** Phase 1 builds the loop as a component inside
`ExportManager` that reads from `claimNextExportTask`. If a real production signal
later says "we need to split this out," moving it to a worker process is a mechanical
~100-line change plus one systemd unit — maybe an hour's work. Don't pay for it now.

**Cheap safety measures, in-process, instead:**

1. **Process-level RSS watchdog.** Every 30 s, check `process.memoryUsage().rss`.
   Above a threshold (e.g. 1.5 GB), flip an admission flag: new `POST /export`
   requests are rejected with "server busy, try again shortly." In-flight tasks drain
   normally. No new memory pressure is added.
2. **`--max-old-space-size=2048`** on the main Node process. Caps V8 heap growth and
   forces GC pressure before the OS starts swapping the whole box.
3. **systemd `MemoryMax=3G` + `Restart=always`.** If a genuine memory leak in a
   third-party library slips through, the OS kills and restarts the process rather
   than letting it drag the whole VPS into swap. Co-resident services survive.

These three together give most of the isolation benefit of a separate worker at a
fraction of the operational cost.

### 5.7 Triggers that would justify revisiting §5.6

Build the worker split **only** if production shows any of:

| Signal | Why it matters |
|--------|----------------|
| Export task crashes the API process more than once per month | Isolation would have prevented user-visible downtime |
| Peak export+delivery RSS consistently exceeds 500 MB during normal load | Resource contention with API request handling |
| The VPS is replaced with multi-host deployment | Workers would need to run on separate machines anyway |
| Image generation and export both need to scale independently | Different resource profiles warrant different process budgets |

Until at least one of these fires, the single-process model stays.

---

## 6. Timeouts

The existing 30-second hard timeout per image (`export-manager.ts:90-93`) does not work
for streaming — a slow 50 MB file can legitimately take longer. Replace with an
**idle timeout**:

- Reset a timer on every `data` event from the in-flight source stream.
- If no data for 20 seconds → destroy the stream, `archive.abort()`, mark task failed.
- This covers stuck S3 connections without punishing slow but healthy transfers.

---

## 7. Download Path

Downloads **already** bypass the VPS: `export-manager.ts:166-173` presigns the S3 key on
every read request. The frontend receives a `downloadUrl` and the browser connects
directly to S3 / MinIO / R2.

Two small tweaks:

### 7.1 Longer presign expiry

`export-manager.ts:169` currently uses `expiresIn: 3600` (1 hour). A multi-GB download on
a slow connection can exceed this. Raise to **24 hours**. Note: S3 only checks the
expiry at request start — in-flight downloads continue even if the URL expires mid-transfer.

### 7.2 Force attachment download

When generating the presigned URL for an export, include:

```ts
ResponseContentDisposition: `attachment; filename="${safeName}_Album.zip"`,
ResponseContentType: 'application/zip',
```

This makes browsers download the file instead of rendering or navigating. The current
`S3Storage.getPresignedUrl` does not accept these parameters — add optional fields.

### 7.3 Public endpoint

`S3Storage` already separates `client` (internal) from `publicClient` (presign). For
deployments where internal and public endpoints differ (MinIO, R2 with custom domain),
ensure `publicEndpoint` is configured so the presigned URL resolves from user browsers.
No code change — just documentation and ops.

### 7.4 Frontend must use `<a download>`, not `fetch().blob()`

Using `fetch().blob()` pulls the entire archive into browser memory — fatal for multi-GB
files on user laptops. The download UI must use a direct anchor click so the browser's
native downloader streams to disk. Audit the Archive page and any download buttons.

---

## 8. Implementation Phases

### Phase 1 — Streaming S3 sink + global queue

Goal: eliminate OOM, introduce the global queue, keep external behaviour unchanged.

**Schema migration**

| Step | Change |
|------|--------|
| S1 | Add `claimedAt DateTime?`, `workerId String?`, `heartbeatAt DateTime?`, `attempts Int @default(0)` to `ExportTask`. |
| S2 | Add `@@index([status, createdAt])` on `ExportTask`. |

**Storage layer**

| Step | File | Change |
|------|------|--------|
| 1 | `server/storage/s3-storage.ts` | Add `readStream(key): Readable` — return `GetObjectCommand` body directly, no `transformToByteArray`. |
| 2 | `server/storage/s3-storage.ts` | Add `uploadStream(key, stream, contentType): Promise<void>` using `@aws-sdk/lib-storage` `Upload`. |
| 3 | `server/storage/s3-storage.ts` | Extend `getPresignedUrl` to accept optional `responseContentDisposition` and `responseContentType`. |

**Queue and pipeline**

| Step | File | Change |
|------|------|--------|
| 4 | `server/db/project-repository.ts` | Add `claimNextExportTask(workerId): Promise<ExportTask \| null>` using `$queryRaw` with `FOR UPDATE SKIP LOCKED`. |
| 5 | `server/db/project-repository.ts` | Add `heartbeatExportTask(id)` and `reapStaleExportTasks(thresholdMinutes)`. |
| 6 | `server/queue/export-manager.ts` | Replace `fire-and-forget` with a claim loop: at most `MAX_CONCURRENT_EXPORTS = 2` simultaneous `runExportTask` calls, each claiming from the global queue. |
| 7 | `server/queue/export-manager.ts` | Rewrite `runExportTask` as the streaming pipeline in §3. |
| 8 | `server/queue/export-manager.ts` | Start a heartbeat timer (every 10 s) while a task runs. |
| 9 | `server/queue/export-manager.ts` | Add pre-flight `HeadObject` quota estimator; remove duplicated check in `routes/projects.ts:595`. |
| 10 | `server/queue/export-manager.ts` | Add runtime byte counter on the `PassThrough`. |
| 11 | `server/queue/export-manager.ts` | Replace per-file 30s hard timeout with a 20s idle-timeout per source stream. |
| 12 | `server/queue/export-manager.ts` | Reaper loop (every 60 s) requeues tasks with stale `heartbeatAt`. |
| 13 | `server/routes/projects.ts` | `POST /api/projects/:id/export` becomes "insert row + return id" — no direct call into `runExportTask`. |
| 14 | `server/routes/projects.ts` | Per-user admission limit: reject if the user already has 3+ `pending`/`processing` export tasks. |
| 15 | `server/queue/export-manager.ts` | Change presigned URL expiry from 1h to 24h; add `ContentDisposition: attachment`. |
| 16 | Frontend | Audit download UI to ensure it uses anchor click, not `fetch().blob()`. |

**Operational safety (in-process, see §5.6)**

| Step | Change |
|------|--------|
| 17 | `server/queue/export-manager.ts` | RSS watchdog: every 30 s check `process.memoryUsage().rss`; above 1.5 GB, flip an admission flag that causes `POST /export` to return 503. |
| 18 | Node startup flags | Add `--max-old-space-size=2048` to the main process launch command. |
| 19 | Deployment docs | Document `systemd` unit with `MemoryMax=3G` and `Restart=always` as the production runbook. |

Each step is a separate commit. After Phase 1 the export path is safe on a 4 GB VPS,
the global queue is in place, and the single-process architecture has enough
self-defence to avoid needing a separate worker (§5.6).

### Phase 2 — Delivery tasks (Google Drive sink)

Delivery is its own async task type. "Push to Drive" is a button on a **completed
export** that creates a `DeliveryTask` and returns immediately — the HTTP request does
not wait for the upload. The frontend polls delivery status the same way it polls
export status.

#### Data model

New table / record type (parallel to `ExportTask`):

```ts
interface DeliveryTask {
  id: string;
  exportTaskId: string;        // the source archive (must be `completed`)
  destination: 'drive';        // extensible: 'dropbox', 'onedrive', ...
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytesTransferred: number;
  totalBytes: number;          // copied from the export task
  externalId?: string;         // Drive file ID once uploaded
  externalUrl?: string;        // shareable Drive URL
  resumableUri?: string;       // Drive resumable session URI for crash recovery
  error?: string;
  createdAt: number;
  ttl?: number;
}
```

A single export can have multiple deliveries (Drive + Dropbox + retry-after-failure),
all pointing at the same `exportTaskId`. Deleting an export should cascade to its
deliveries.

#### HTTP contract

| Method | Route | Behaviour |
|--------|-------|-----------|
| `POST` | `/api/exports/:taskId/deliver` | Body `{ destination: 'drive' }`. Validates export is `completed`. Creates `DeliveryTask`, returns `{ deliveryTaskId }` immediately. **Does not block on upload.** |
| `GET` | `/api/deliveries/:deliveryTaskId` | Returns task state for polling. |
| `DELETE` | `/api/deliveries/:deliveryTaskId` | Cancels in-flight delivery: aborts the resumable session, marks task failed. Does **not** delete the file from Drive if already uploaded. |

#### Pipeline

`DeliveryManager.runDeliveryTask`:

1. Load the `ExportTask`, verify status is `completed` and `s3Key` exists.
2. Open `exportStorage.readStream(exportTask.s3Key)` — one stream, the already-built ZIP.
3. Pipe through a byte counter (`PassThrough`) → `DriveSink`.
4. `DriveSink` uses `googleapis` `drive.files.create` with `uploadType: 'resumable'`
   and `media.body: passThrough`.
5. On every chunk ack, update `bytesTransferred`. On completion, write `externalId` /
   `externalUrl`, mark `completed`.
6. On failure, store `resumableUri` so the retry path can resume instead of restart.

Per-task memory: **~10 MB** (one S3 read stream + Drive's chunked upload buffer).

#### Steps

| Step | Change |
|------|--------|
| 1 | OAuth: add "Connect Google Drive" flow, store refresh token per user. |
| 2 | Data layer: `DeliveryTask` table + repository CRUD + cascade-delete on export removal. |
| 3 | `server/queue/delivery-manager.ts`: new `DeliveryManager` with `Semaphore(2)`, polling, status updates. |
| 4 | `DriveSink`: resumable upload via `googleapis`, progress events, retry-with-resume on 5xx. |
| 5 | HTTP routes (`POST /api/exports/:taskId/deliver`, `GET/DELETE /api/deliveries/:id`). |
| 6 | Worker process (if Phase 1.5 shipped): delivery worker claims `DeliveryTask` rows the same way export worker claims `ExportTask`. |
| 7 | Frontend: "Push to Drive" button on completed exports, delivery status card with polling. |

#### Edge cases

- **Export deleted mid-delivery.** Delivery reads the S3 stream; if the key disappears,
  the read stream errors. Mark delivery failed with `error: 'source archive removed'`.
- **User revokes Drive OAuth mid-delivery.** `googleapis` returns 401; mark failed,
  prompt user to reconnect.
- **Drive quota exceeded.** 403 with `storageQuotaExceeded`. Surface a specific error
  message, don't retry.
- **Duplicate clicks.** `POST /deliver` is not idempotent — clicking twice creates two
  deliveries. Frontend should disable the button while a `pending`/`processing` delivery
  exists for the same `(exportTaskId, destination)` pair.

### Phase 3 — Direct HTTP download (optional)

Only build if users complain about wait times or storage fees.

| Step | Change |
|------|--------|
| 1 | Add `GET /api/projects/:id/download?token=xxx` that sets `Content-Disposition: attachment` and pipes the archiver to the response. |
| 2 | Hold the export under a short-lived one-shot token so the URL cannot be replayed. |
| 3 | Document the tradeoff: no resume, user must stay connected, saturates VPS egress while running. |

---

## 9. Anti-patterns to Avoid

These mistakes would each reintroduce the original failure mode. Do not:

- Buffer the full archive to disk as an intermediate file. We have 4 GB of RAM and a
  single VPS disk — there is no disk budget either.
- Compress archive contents. `level: 0` (store) stays. Media files do not shrink.
- Hold more than one source stream open concurrently.
- Use `PutObjectCommand` with `Body: stream` — it still needs `Content-Length` and will
  buffer.
- Run export and image generation in the same Node process after Phase 1.5 ships.
- Use `fetch(url).then(r => r.blob())` on the frontend for the download.
- Store presigned URLs in the database. The `s3Key` is the source of truth
  (see `export-archive-cleanup.md §Why s3Key and Not downloadUrl`).

---

## 10. Related Files

| File | Role |
|------|------|
| `server/queue/export-manager.ts` | Task lifecycle, pipeline orchestration, quota, concurrency |
| `server/storage/s3-storage.ts` | Stream read, multipart upload, presign |
| `server/routes/projects.ts` | `POST /api/projects/:id/export`, presign response |
| `server/db/project-repository.ts` | Task persistence (`saveExportTask`, `deleteExportTask`) |
| `design/export-archive-cleanup.md` | TTL and lifecycle rules for completed archives |
| `design/storage-analytics.md` | How export task sizes feed into the quota calculation |
