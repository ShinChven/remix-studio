# Campaigns

Campaigns organize social posts, target channels, media preparation, schedules, and per-channel publishing results. They are separate from generation projects: project/library media can be reused in posts, but a campaign has its own records and lifecycle.

## Campaign Lifecycle

A campaign stores a name, description, status, posts, and a set of connected social accounts.

- **Active** campaigns can schedule and publish posts.
- Pausing/archiving a campaign prevents the scheduler from publishing its posts until the campaign becomes active again.
- Deleting a campaign removes its posts, media records, and execution history, including campaign-owned uploaded objects.

Assigning a channel targets that social account for posts in the campaign. Disconnecting the account removes its stored tokens and stops campaigns from targeting it; it does not delete posts already published on the social platform.

## Posts

A post contains optional text, ordered media, a status, an optional schedule, and one execution record per target social account.

The editor:

- Requires at least text or media.
- Accepts image and video uploads.
- Lets you remove and drag to reorder media.
- Supports up to four media items in the current post editor.
- Saves without a time as a draft.
- Rejects a scheduled time less than about five minutes in the future in the UI.

Post media moves through `pending`, `processing`, `ready`, or `failed`. Images are processed into platform-ready assets; current video/GIF processing preserves the uploaded source while marking it ready. A post cannot be scheduled or published while attached media is unready.

## Post and Execution States

Post status summarizes the whole post:

| Status | Meaning |
| :--- | :--- |
| `draft` | Editable and not scheduled |
| `scheduled` | Waiting for its due time |
| `queued` | Fan-out to channel execution records has begun |
| `completed` | At least one channel execution posted successfully and all executions settled |
| `failed` | Publishing could not produce a successful result |

Each target channel has a separate execution with `pending`, `publishing`, `posted`, or `failed` status, attempt count, retry time, error, and remote URL/ID. The post detail screen shows these per-channel results.

## Scheduling and Send Now

When a scheduled post becomes due, the scheduler:

1. Verifies the campaign is active.
2. Verifies it has at least one active connected account.
3. Verifies all media is ready.
4. Creates or resets one execution per target account.
5. Queues executions for publishing.

Executions use retry/backoff metadata for transient failures and rate limits. Authentication failures trigger one reactive token refresh when the platform supports it. Final post status is calculated only after all executions settle.

**Send Now** uses the same target-account fan-out without waiting for the schedule. Sending a completed post again creates another publishing attempt and may create another live social post.

## Batch Actions

The campaign Batch Actions view supports searchable, paginated post selection and:

- Batch schedule with a time assigned to each post.
- Batch unschedule, which returns scheduled posts to draft.
- Batch Send Now for an active campaign.
- Batch AI text generation.
- Creating one new draft post per selected/uploaded media item.

Batch operations report skipped items individually—for example, already completed posts, invalid dates, or media that is still processing.

### Batch Media Post Creation

The media batch screen queues uploads or owned media from libraries/albums and creates **one post per media item**. Local files are encoded and sent once; the server processes the batch asynchronously while the browser polls progress.

Optional per-user watermark settings are applied to image media during processing. Thumbnail previews show the queued source and the resulting draft posts remain editable.

### Batch AI Text Generation

Select posts, then choose an assistant-capable provider/model and a reusable prompt from a text library or enter instructions directly. The task can optionally include each post's images as model context.

The server processes the selected post IDs asynchronously and reports per-post success/failure. Generated text replaces the targeted post's text; it does not automatically schedule or send the post.

## Connected Channels

The current channel adapters are:

- **X (Twitter)** — OAuth 2.0, media upload, and post creation. See [X Setup](/integrations/x-platform).
- **Threads (Meta)** — long-lived token flow, public media fetching, and container publishing. See [Threads Setup](/integrations/threads-platform).

Access and refresh tokens are encrypted at rest. The scheduler proactively refreshes eligible tokens before expiry, and the publisher can retry after an authentication failure.

Platform rules still apply. For example, character limits, media combinations, account access tier, and rate limits can cause one channel execution to fail while another succeeds.

## Public Media URLs

Threads and other server-fetch platforms require an internet-reachable, time-limited URL. Remix Studio signs objects from the main storage bucket.

::: warning
`S3_PUBLIC_ENDPOINT` must resolve publicly to the same stored objects. An internal endpoint such as `http://minio:9000` is valid for the Remix Studio container but cannot be fetched by a social platform.
:::

X uploads media bytes through its API and therefore has different delivery mechanics, but its size/format rules still apply.

## Watermark Settings

Campaign media watermarks are per-user settings shared with the image-export watermark screen. They include text, position, padding, font size, opacity, and color.

Watermarking creates a processed post asset; it does not overwrite the original library/album source. Video watermarking is not part of the current image watermark utility.

## Tracking Activity

- **Scheduled Posts** lists and searches upcoming posts across campaigns.
- **Campaign History** shows completed/failed posts and channel errors.
- **Post Detail** shows media, schedule controls, generated text actions, and every channel execution.
- Campaign cards summarize total, completed, and scheduled ranges.

## Related

- [Projects & Albums](/concepts/projects) — sources for reusable generated media.
- [Libraries & Prompts](/concepts/libraries) — media and AI instruction reuse.
- [MCP Support](/integrations/mcp) — create/update campaigns and posts programmatically.
