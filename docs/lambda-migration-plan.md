# Lambda Migration Plan — Remix Studio

## Context

Remix Studio currently runs as a single Node.js process: Hono HTTP server + SQS polling workers + interval-based pollers all in one. The goal is to fully adapt the architecture for AWS Lambda while keeping local development unchanged (single process + LocalStack).

## Target Architecture

### Production (AWS)

| Component | Runtime | Trigger |
|-----------|---------|---------|
| API | Lambda + Function URL / API Gateway | HTTP requests |
| Generator Worker | Lambda | SQS event source mapping (`remix-generator-queue`) |
| Export Worker | Lambda (high memory, 15min timeout) | SQS event source mapping (`remix-export-queue`) |
| Detached Poller + Recovery | Lambda | EventBridge scheduled rule (every 2–5 minutes) |

### Local Development

Unchanged. `npm run dev` runs `server.ts` as a single process. LocalStack provides SQS/DynamoDB/S3.

## Implementation Plan

### Phase 1: Extract Business Logic into Standalone Functions

No Lambda introduced yet. Purely a refactor that can be verified locally.

**1.1 Create `server/queue/job-executor.ts`**
- Extract `executeJob()` and `processCompletedImage()` from `QueueManager` into standalone exported functions.
- Accept explicit dependency parameters instead of `this`:
  ```typescript
  export async function executeJob(queued: QueuedJob, providerRecord: any, deps: {
    providerRepo: ProviderRepository;
    projectRepo: ProjectRepository;
    storage: S3Storage;
    userRepository: UserRepository;
    exportStorage: S3Storage;
  }): Promise<void>
  ```
- `QueueManager` internally delegates to this extracted function.

**1.2 Create `server/queue/detached-poller.ts`**
- Extract `pollDetachedTasks()` and `checkJobStatus()` from `QueueManager` into standalone exported functions.
- `QueueManager`'s 30s interval timer calls the extracted function.

**1.3 Create `server/queue/task-recovery.ts`**
- Extract `recoverTasks()` from `QueueManager` into a standalone exported function.

**1.4 Create `server/queue/export-executor.ts`**
- Extract `runExportTask()` from `ExportManager` into a standalone exported function.

**1.5 Add options to QueueManager constructor**
- New parameter: `options?: { enablePolling?: boolean }`
- Default: `enablePolling: true` (local dev behavior unchanged). Lambda passes `false` to disable the `setInterval`.

**Verification:** `npm run dev` — all features (generation, export, polling recovery) work identically to before.

### Phase 2: Create Lambda Handlers

**2.1 `server/lambda/shared.ts`** — Dependency Factory
- Module-level singleton cache for Lambda warm starts.
- Builds all AWS clients and repositories from environment variables.
- No LocalStack fallbacks (production SDK connects to real AWS automatically).

**2.2 `server/lambda/api.ts`** — API Handler
- Uses `hono/aws-lambda` adapter: `import { handle } from 'hono/aws-lambda'`.
- Mounts all existing route factories (same as `server.ts`).
- `QueueManager` instance has polling disabled (`{ enablePolling: false }`); only uses `enqueueProject()` to send SQS messages.
- `ExportManager` instance does not call `startWorker()`; only uses `startExport()` / `getTask()`.
- Does **not** include Vite dev server or static file serving (CloudFront + S3 hosts the SPA in production).

**2.3 `server/lambda/generator.ts`** — Image Generation Worker
- Receives `SQSEvent`, parses `event.Records[0].body` as `QueuedJob`.
- Calls `getDeps()` for cached dependencies, then calls `executeJob()`.
- On success, SQS automatically deletes the message. On failure, the message returns to the queue after visibility timeout.
- SQS event source mapping config: `batchSize: 1`.

**2.4 `server/lambda/export.ts`** — Export Worker
- Same pattern as generator worker, calls `runExportTask()`.
- Lambda config: memory 3072MB, timeout 15 minutes.

**2.5 `server/lambda/poller.ts`** — Scheduled Poller
- Triggered by EventBridge.
- Executes `pollDetachedTasks()` + `recoverTasks()`.

### Phase 3: Build Pipeline

**3.1 New build scripts in `package.json`**
```json
{
  "build:lambda:api": "tsup server/lambda/api.ts --format esm --out-dir dist-lambda/api --clean --external sharp",
  "build:lambda:generator": "tsup server/lambda/generator.ts --format esm --out-dir dist-lambda/generator --clean --external sharp",
  "build:lambda:export": "tsup server/lambda/export.ts --format esm --out-dir dist-lambda/export --clean --external sharp",
  "build:lambda:poller": "tsup server/lambda/poller.ts --format esm --out-dir dist-lambda/poller --clean --external sharp",
  "build:lambda": "npm run build:lambda:api && npm run build:lambda:generator && npm run build:lambda:export && npm run build:lambda:poller"
}
```

**3.2 Sharp Handling**
- Use Lambda Container Images (based on `public.ecr.aws/lambda/nodejs:20-arm64`).
- Install `sharp` with `--platform=linux --arch=arm64` during Docker build.
- Mark `sharp` as `--external` in tsup bundles.

**3.3 New Dependencies**
- `hono/aws-lambda` — already included in the `hono` package, no extra install needed.
- `@types/aws-lambda` — TypeScript type definitions for Lambda event types.

### Phase 4: Infrastructure (CDK)

Create a new `infra/` directory using AWS CDK (TypeScript):

**Resources:**
- DynamoDB table (`remix-studio`) with TTL on `ttl` attribute
- S3 buckets: `remix-studio`, `remix-studio-exports`
- SQS queues: `remix-generator-queue` (VisibilityTimeout=300s), `remix-export-queue` (VisibilityTimeout=900s) + Dead Letter Queues
- API Lambda + Function URL
- Generator Lambda + SQS event source mapping (`maxConcurrency` for throttling)
- Export Lambda + SQS event source mapping
- Poller Lambda + EventBridge schedule rule
- CloudFront distribution: S3 origin (SPA) + Lambda origin (`/api/*`)
- IAM roles with least-privilege policies

## Provider Concurrency Control

No in-memory state is available in Lambda. Strategy:

- **Initial approach:** Use SQS event source mapping `maxConcurrency` to set a global concurrency limit (e.g., 10).
- **If per-provider control is needed later:** Implement a distributed semaphore using DynamoDB conditional updates — atomically increment a counter per provider before processing, throw if over limit (message returns to SQS via visibility timeout).

## Key Files

| File | Change |
|------|--------|
| `server/queue/queue-manager.ts` | Extract methods to standalone files, add constructor options |
| `server/queue/export-manager.ts` | Extract `runExportTask` |
| `server.ts` | No change (local dev entry point) |
| `server/queue/sqs-client.ts` | No change |
| `package.json` | Add Lambda build scripts, add `@types/aws-lambda` |
| New: `server/lambda/*.ts` | Lambda handler entry points |
| New: `server/queue/job-executor.ts` | Extracted business logic |
| New: `server/queue/export-executor.ts` | Extracted business logic |
| New: `server/queue/detached-poller.ts` | Extracted business logic |
| New: `server/queue/task-recovery.ts` | Extracted business logic |
| New: `infra/` | CDK infrastructure code |

## Verification

1. **After Phase 1:** `npm run dev` — all features work identically to before the refactor.
2. **After Phase 2:** Test individual Lambda handlers locally using `aws-lambda-ric` or SAM local.
3. **After Phase 3:** `npm run build:lambda` successfully produces four Lambda bundles.
4. **After Phase 4:** CDK deploy to staging environment, end-to-end testing.