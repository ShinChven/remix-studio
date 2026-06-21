# Queue & Concurrency

Remix Studio runs generation through a **recoverable, server-side queue**. This is what lets you expand a workflow into many drafts and execute them reliably in the background.

## How Jobs Flow

1. Running a project enqueues only jobs marked `pending`.
2. The queue is **global and in-process**, and groups work by [provider](/concepts/providers).
3. Each provider has its own **configurable concurrency limit**, controlling how many of its jobs run in parallel.
4. Jobs are **snapshotted** into `processing` state before dispatch, so the worker and poller operate on resolved metadata.
5. Providers that return a remote task ID are handed off to a **detached poller**, which checks status every 30 seconds until completion or failure.

## Job States

| State | Meaning |
| :--- | :--- |
| `pending` | Queued, not yet dispatched |
| `processing` | Snapshotted and dispatched (or being polled) |
| `completed` | Finished successfully; output in the album |
| `failed` | Errored; can be retried |

## Per-Provider Concurrency

Because work is grouped by provider, you control parallelism independently for each one. A slow or rate-limited provider can run one job at a time while a fast one runs several — without blocking each other.

## Recovery After Restart

The queue is designed to survive restarts:

- On server startup, **pending jobs are re-enqueued**.
- **Interrupted `processing` jobs are recovered** so work can continue.

## Storage Guard

A **storage-limit check** runs before enqueuing pending jobs for a project, so generation won't push a user past their [storage](/concepts/storage) quota.

## Monitoring

The **Queue Monitor** view shows live job status across projects, so you can watch progress, spot failures, and retry. Generated outputs can be reviewed in-app, and failures retried individually.

## Related

- [Workflows](/concepts/workflows) — how drafts become queued jobs.
- [Providers & Models](/concepts/providers) — where concurrency limits are configured.
