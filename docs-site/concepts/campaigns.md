# Campaigns

The **campaign workspace** turns generated copy and media into scheduled social posts. It connects generation output, reusable media, scheduling, post history, and social channel delivery in the same app.

## What a Campaign Contains

- **Posts** with copy and attached media.
- A **scheduling timeline** for when posts publish.
- **Connected channels** to publish through.
- **History** of published and failed posts.

## Batch Post Creation

Just like workflows expand inputs into drafts, campaigns can generate **post copy in batches** and attach reusable media. Campaign media creation runs as **asynchronous batch processing with status polling**, and batch actions show **thumbnail previews** of attached media.

## Channels

Connect social accounts under **Campaigns → Channels**. Supported channels:

- **X (Twitter)** — see [X Setup](/integrations/x-platform).
- **Threads (Meta)** — see [Threads Setup](/integrations/threads-platform).

Connection status is surfaced through UI toasts, and channel-specific API errors are parsed and reported clearly. Disconnecting a channel deletes the stored social account and its tokens.

## Scheduling & Publishing

- Posts are scheduled on a timeline and published through connected channels at their scheduled time.
- The scheduler proactively refreshes long-lived OAuth tokens before they expire, so scheduled posts keep working without you reconnecting.
- **Scheduled Posts** and **Campaign History** views let you track upcoming and past posts.

## Media Requirements

Social platforms fetch media from a **public URL** that the platform requests server-side. Remix Studio supplies time-limited presigned URLs from your configured [S3-compatible storage](/concepts/storage).

::: warning
Your storage's public endpoint (`S3_PUBLIC_ENDPOINT` / custom domain) must be reachable from the public internet, or the platform cannot fetch the media and publishing will fail.
:::

## Watermarking

Campaign and album exports support **watermarking**, configured through a dedicated panel, with automated image processing in the delivery queue. Per-product watermark settings also apply to listing covers when [selling exports](/concepts/selling-exports).

## Related

- [Projects & Albums](/concepts/projects) — the source of campaign media.
- [Exports & Delivery](/concepts/exports) — package and deliver finished media.
