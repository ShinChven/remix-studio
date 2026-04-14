# Queue Architecture Isolation Design

This document outlines the proposed architectural refactoring for the `QueueManager` to physically isolate synchronous AI providers (e.g., OpenAI, Google Vertex) from asynchronous, polling-based providers (e.g., RunningHub). 

This isolation prevents logical cross-contamination (where fixing an error in a synchronous pipeline accidentally breaks the detached polling strategy of an asynchronous pipeline) and ensures robust handling of edge cases like storage failures and metadata resolution.

## 1. Core Design Goals

1. **Single Responsibility Principle (SRP):** Separate the concerns of "dispatching requests" from "polling for asynchronous results" and "processing downloaded images."
2. **Physical Execution Path Isolation:** Synchronous models use a dedicated execution method that awaits the final image. Asynchronous models use a handoff method that only retrieves a `taskId` and exits the main queue flow immediately.
3. **Shared Image Processing:** Regardless of how the image was generated (sync wait vs. async poll), the final step (downloading, compressing, saving to S3, updating the DB to `completed`) is handled by a unified, isolated module.

## 2. Component Breakdown

### A. Unified Image Processor (`server/queue/image-processor.ts`)
Extracts the monolithic `processCompletedImage` method.
* **Role:** Takes raw `imageBytes` and the full `Job` metadata, generates thumbnails/optimized versions, enforces storage quotas, saves to S3/MinIO, and marks the database status as `completed`.
* **Local Failure Handling:** If saving to storage fails (e.g., disk full), it marks the job as `failed` but **explicitly preserves the `taskId`** in the database. This allows the user to click "Retry" and resume the job without re-triggering the remote generation.

### B. Detached Poller (`server/queue/detached-poller.ts`)
Extracts `pollDetachedTasks` and `checkJobStatus` from the `QueueManager` into a standalone background daemon.
* **Role:** Runs on a 30-second interval. It queries the database exclusively for jobs where `status === 'processing'` AND `taskId != null`. It calls the generator's `checkStatus()` and, upon completion, passes the result to the `ImageProcessor`.
* **Isolation Benefit:** The polling logic is physically separated. Modifications to the main queue dispatcher cannot accidentally break the polling loop.

### C. The Queue Dispatcher (`server/queue/queue-manager.ts`)
The `QueueManager` becomes purely a concurrency controller and dispatcher. In its `executeJob` method, it performs a **strict branch isolation**:

```typescript
const generator = buildGenerator(...);

if (generator.checkStatus) {
    // [Asynchronous Pipeline] (e.g., RunningHub)
    await this.executeAsyncHandoff(userId, projectId, job, queued, generator);
} else {
    // [Synchronous Pipeline] (e.g., OpenAI / Vertex)
    await this.executeSyncJob(userId, projectId, job, queued, generator);
}
```

## 3. Critical Architecture Fixes (Edge Cases)

During the design phase, two critical edge cases were identified and addressed to ensure the isolation strategy is flawless:

### Critical Fix 1: Preventing Stale Task ID Deadlocks (Pre-check Mechanism)
**The Problem:** If an asynchronous job fails locally (e.g., storage quota exceeded), the `taskId` is preserved. If the user clicks "Retry" days later, the `QueueManager` might hand the stale `taskId` to the `DetachedPoller`. The remote provider (RunningHub) might return an "Expired" error, causing the poller to fail the job again. The user would have to click "Retry" a *second* time to clear the ID and start over.
**The Solution:** In `executeAsyncHandoff`, before blindly skipping generation, the dispatcher actively pings `generator.checkStatus(taskId)`. 
* If the task is still alive (`processing` or `completed`), it hands off to the poller.
* If the task is dead/expired/failed remotely, it immediately clears the `taskId` from the database and falls through to `generator.generate()` to initiate a fresh request transparently.

### Critical Fix 2: Preventing Metadata Loss on Async Completion (Snapshotting)
**The Problem:** Jobs often rely on Project-level fallback settings for generation parameters (e.g., if a job's `aspectRatio` is undefined, it uses `project.aspectRatio`). The `DetachedPoller` fetches the `Job` from the database but does not fetch the `Project`. If the fallback parameters aren't persisted to the `Job` table, the `ImageProcessor` will save the final album item with missing metadata.
**The Solution (Snapshotting):** At the exact moment `executeJob` transitions a job's status to `processing`, it must write the resolved, final parameters (`aspectRatio`, `quality`, `format`, `providerId`) directly into the `Job` database record. This makes the database record completely stateless and self-contained, allowing the `DetachedPoller` to process the job blindly with 100% data integrity.

## 4. Architecture Diagram

```mermaid
flowchart TD
    %% Styling
    classDef frontend fill:#f9f9f9,stroke:#333,stroke-width:2px;
    classDef router fill:#d4e157,stroke:#333,stroke-width:2px;
    classDef queue fill:#ffcc80,stroke:#333,stroke-width:2px;
    classDef sync fill:#81d4fa,stroke:#333,stroke-width:2px;
    classDef async fill:#ce93d8,stroke:#333,stroke-width:2px;
    classDef processor fill:#a5d6a7,stroke:#333,stroke-width:2px;
    classDef db fill:#f48fb1,stroke:#333,stroke-width:2px;

    %% Nodes
    Client[Web Client]:::frontend
    API[API Route / enqueueProject]:::router
    
    subgraph QueueManager.ts
        Dispatcher{Has checkStatus()?}:::queue
        Dispatcher -- No (OpenAI / Vertex) --> SyncChannel[executeSyncJob\nAwait result synchronously]:::sync
        Dispatcher -- Yes (RunningHub) --> AsyncChannel[executeAsyncHandoff\nGet TaskId and exit]:::async
    end

    subgraph DetachedPoller.ts
        Poller[Query every 30s:\n status=processing\n & taskId != null]:::async
        Poller --> CheckStatus[generator.checkStatus()]:::async
    end

    subgraph ImageProcessor.ts
        Process[processCompletedImage\nCreate thumbs / Quota check / S3]:::processor
        FailHandler[handleLocalFailure\nKeep taskId on S3 fail]:::processor
    end

    DB[(PostgreSQL)]:::db

    %% Flow
    Client -- Submit generation --> API
    API -- Save 'pending' --> DB
    API -- Add to memory queue --> Dispatcher

    %% Sync Flow
    SyncChannel -- 1. generate() returns image --> Process
    SyncChannel -- Remote error --> SyncFail[Mark 'failed'\nClear taskId]:::sync
    SyncFail --> DB

    %% Async Flow
    AsyncChannel -- Pre-check alive? -- Yes --> DB
    AsyncChannel -- 1. generate() returns taskId --> DB
    DB -- 2. Fetch active tasks --> Poller
    CheckStatus -- Returns 'completed' + image --> Process
    CheckStatus -- Returns 'processing' --> PollerWait[Wait for next interval]:::async
    CheckStatus -- Remote error / Expired --> AsyncFail[Mark 'failed'\nClear taskId]:::async
    AsyncFail --> DB

    %% Shared Image Processing Flow
    Process -- Success: Save S3, update 'completed' --> DB
    Process -- Local Failure (e.g. Quota full) --> FailHandler
    FailHandler -- Mark 'failed'\nPRESERVE taskId --> DB
```