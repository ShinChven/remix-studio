# Queue & Concurrency

Generation runs through a recoverable, server-side queue. Drafts become database-backed jobs before dispatch, while a small in-memory scheduler enforces each provider record's concurrency limit.

## From Draft to Job

A draft has status `draft` and is not visible to the server worker. Starting one or more drafts:

1. Validates that the jobs belong to the project and are startable.
2. Estimates future storage at approximately 25 MB per pending job and checks the user's limit.
3. Moves the selected `draft` or `failed` rows to `pending`.
4. Enqueues those job IDs for the project's provider queues.

Starting all drafts affects draft rows only. Existing pending/processing jobs are not duplicated.

## Job States

| Database state | Meaning |
| :--- | :--- |
| `draft` | Prepared in the project but not submitted to the server queue |
| `pending` | Eligible for dispatch; may be waiting for a provider slot |
| `processing` | A provider call is running or a remote task is being polled |
| `completed` | Processing succeeded and the result was written to the album |
| `failed` | Dispatch, provider execution, polling, or local processing failed |

The Queue Monitor additionally derives operational states:

- **Waiting** — pending in the database but not currently in the in-memory queue.
- **Queued** — waiting in a provider's in-memory queue.
- **Running** — executing synchronously and consuming a provider slot.
- **Detached** — a remote async task ID is being polled and still consumes a slot.

## Provider Resolution and Snapshots

Before execution, the queue resolves the effective provider and writes the final provider/model and output parameters to the job. This snapshot prevents a later project edit from changing an in-flight job.

Aspect ratio, quality and resolution are resolved against the job's model at the same point. A value the model does not offer — `1024x1024` from an OpenAI entry sent to a RunningHub model that takes ratios, say — is replaced by the allowed value closest in shape (`1:1`), so jobs drafted before a model switch, through the API or by an agent still run. A model that publishes no list, such as a custom alias, gets the value unchanged.

Text, audio, and synchronous image/video calls finish within the worker execution path. Providers that return a remote task ID hand the job to the detached poller.

## Per-Provider Concurrency

Concurrency is configured on each provider record, not globally by provider family. The scheduler keeps independent queues and active-slot counts per provider ID.

For example, one Google provider can run four jobs while a separate rate-limited provider runs one. A detached remote task continues to occupy its provider slot until it completes, fails, times out, or is reconciled after deletion.

Changing a provider's configured concurrency affects subsequent scheduling; it does not cancel work already running remotely.

## Detached Polling and Timeouts

Remote async jobs are checked every 30 seconds; Civitai jobs, which finish in seconds, are also checked every 5 seconds so a result shows up promptly. Every check re-reads the job first, so the two cycles never act on a job the other has finished. A remote task reaching a terminal state is passed to the image/video processor and then releases its provider slot.

A task can return more than one image. A layer-decomposition model, for example, returns a base image and up to 16 transparent layers; each becomes its own album item, and a retried job overwrites its layers instead of adding a second set.

If a task never reaches a terminal state, it is marked failed after `JOB_PROCESSING_TIMEOUT_MS` (two hours by default). The first-observed timeout window resets on a server restart.

Transient polling errors do not immediately fail a task; polling continues until the provider reports failure or the stuck timeout is reached.

## ComfyUI Projects

[ComfyUI projects](/concepts/projects#comfyui-projects) have no provider record, so they do not use provider queues. A runner sends each project's jobs to its own ComfyUI instance, keeping at most two prompts waiting or running there at a time — one generating, the next ready — and polls ComfyUI's queue and history every two seconds.

- A prompt stops counting once ComfyUI has finished it, so the next job is sent while the result downloads.
- A download is abandoned only when no data arrives for a minute, within 30 minutes overall.
- A check that fails three times in a row fails the job with the reason and keeps its prompt ID, so retrying it downloads the finished result instead of generating it again.
- An instance that stays unreachable for ten minutes fails its in-flight jobs.
- Reference files are named by their content, and one ComfyUI already holds is not uploaded again.

ComfyUI jobs carry on after a server restart, and a retry reuses a result ComfyUI has already produced.

## Recovery After Restart

On startup the recovery scan:

- Re-enqueues every `pending` job.
- Resets `processing` jobs without a remote task ID to `pending`, because their synchronous process was interrupted.
- Leaves `processing` jobs with a task ID in place, reserves their provider slots, and immediately polls them.

After each detached poll cycle the queue reconciles slot tracking with the database. It also heals untracked `processing` rows without task IDs by returning them to pending, while avoiding jobs that are genuinely executing in the current process.

This is recovery by retry, not exactly-once execution. A synchronous provider request interrupted after the remote service accepted it but before Remix Studio stored the result may be submitted again.

## Failures and Retry

Failed jobs retain their error and resolved configuration. Retry returns selected failures to pending and enqueues them again. The Queue Monitor can also clear failed job records globally, by project, or by provider queue.

Clearing a failed job removes the job record; it does not delete an album item that was already saved by a successful run.

## Queue Monitor

Open **Projects → Queue Monitor** to see:

- Total pending, processing, and failed jobs.
- Active slots versus configured concurrency.
- Project-grouped and provider-grouped views.
- Waiting, queued, running, and detached counts.
- Provider/model and output metadata for individual jobs.
- Scoped controls for clearing failures.

The monitor polls for current server state. Project pages additionally receive live WebSocket events. MCP clients and the assistant read the same counts with `get_queue_status` and clear failures with `clear_failed_jobs`.

## Finish Notifications

When a project that was running jobs has none left pending or processing, every device that switched on **Notifications** under **Account → Preferences** gets a browser notification with how many jobs finished and how many failed. See [Finish Notifications](/concepts/projects#finish-notifications).

## Related

- [Workflows & Combinations](/concepts/workflows) — draft creation and selection.
- [Providers & Models](/concepts/providers) — credentials, models, and concurrency.
- [Storage](/concepts/storage) — quota accounting and the pre-start estimate.
