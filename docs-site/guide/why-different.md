# Why It Feels Different

Most AI generation tools optimize a single prompt box. Remix Studio separates reusable source material, draft composition, provider execution, durable results, and distribution. That separation is what makes large, repeatable content systems manageable.

## Assistant-First Orchestration

The built-in [assistant](/concepts/assistant) reads current libraries, project workflows, album summaries, model availability, storage, campaigns, and posts through the same account-scoped tools exposed over MCP. It can prepare changes, but write/destructive operations stop for review.

This makes the assistant an alternative control surface over real workspace objects, not a separate chat that merely suggests text for you to copy.

## Combination Engine

Workflows mix fixed direct inputs with reusable text/image/video/audio libraries. Combination mode walks the Cartesian product; Shuffle samples independently from each library for a bounded draft count.

Crucially, composition and execution are separate. You can inspect the resolved prompt, contexts, model, and settings before deciding which drafts deserve provider calls. See [Workflows & Combinations](/concepts/workflows).

## Campaign Workspace

Project output does not have to end as a downloaded file. Campaigns reuse generated/library media, prepare post copy in batches, process attachments, schedule posts, and retain per-channel results for X and Threads. A failure on one target remains visible without hiding a success on another. Read [Campaigns](/concepts/campaigns).

## Batch Execution

Generation runs through a recoverable [queue](/concepts/queue) with concurrency per provider connection. Synchronous calls and remote async tasks share the same job history; detached tasks are polled without occupying a browser tab, and pending/interrupted work is reconciled after restart.

Exports, external deliveries, campaign media, and social posting use their own worker loops so a slow archive upload does not become a generation job.

## Self-Hosted Control

You bring the provider accounts, PostgreSQL database, S3-compatible buckets, OAuth applications, and deployment secrets. Credentials are encrypted before database storage and every workspace route/tool applies user ownership.

Self-hosting also means operational responsibility: back up PostgreSQL **and** object storage, preserve the encryption key, publish storage endpoints required by social platforms, and tune provider concurrency for your hardware and vendor limits.

## Combination-Driven Workflow at a Glance

If you have 3 subjects, 4 styles, and 2 reference images, the workflow has **24 possible combinations**. Set Job Quantity to 24 for one pass through the full set, or a smaller number for a prefix of that deterministic sequence.

With Shuffle enabled, each draft randomly picks one item from every library step. Sampling is with replacement, so it bounds cost but does not promise unique combinations.

The result of either mode is a reviewable draft set. Starting selected drafts moves only those rows into the persistent provider queue.
