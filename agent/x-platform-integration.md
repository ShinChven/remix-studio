# X Platform Integration

This document describes the current X (Twitter) integration as implemented in remix-studio. It is based on the live code and observed runtime behavior, not on idealized assumptions.

Relevant code:
- [server/services/social/twitter-channel.ts](../server/services/social/twitter-channel.ts)
- [server/services/social/index.ts](../server/services/social/index.ts)
- [server/routes/social.ts](../server/routes/social.ts)
- [server/queue/post-manager.ts](../server/queue/post-manager.ts)

## Code Reference

Key implementation entry points:

- OAuth connect redirect: [social.ts — GET /api/social/:platform/connect](../server/routes/social.ts)
- OAuth callback + upsert: [social.ts — GET /api/social/:platform/callback](../server/routes/social.ts)
- Token refresh endpoint call: [twitter-channel.ts — refreshTokens()](../server/services/social/twitter-channel.ts)
- Media upload dispatcher: [twitter-channel.ts — uploadMedia()](../server/services/social/twitter-channel.ts)
- Direct image upload: [twitter-channel.ts — uploadMedia() isImage branch](../server/services/social/twitter-channel.ts)
- Chunked GIF/video upload (INIT/APPEND/FINALIZE): [twitter-channel.ts — uploadMedia() chunked branch](../server/services/social/twitter-channel.ts)
- Proactive + reactive refresh: [post-manager.ts — executePost()](../server/queue/post-manager.ts)
- Shared refresh with in-process lock: [post-manager.ts — refreshAccountToken()](../server/queue/post-manager.ts)
- Synchronous publish (send now): [post-manager.ts — fanOutAndExecute()](../server/queue/post-manager.ts)

## Goals

1. Use X API v2 endpoints only. No v1.1 or legacy `upload.twitter.com`.
2. Use OAuth 2.0 user-context bearer tokens.
3. Maintain a working image upload path via the direct upload endpoint.
4. Support GIF and video via the chunked v2 media flow.
5. Refresh tokens proactively and reactively without race conditions.
6. Upsert social accounts on reconnect — never create duplicates.

## Base Rules

- API base URL: `https://api.x.com`
- Tweet creation: `POST /2/tweets`
- Image upload: `POST /2/media/upload`
- GIF/video upload: split-endpoint chunked flow under `https://api.x.com/2/media/upload/...`
- Profile lookup: `GET /2/users/me?user.fields=name,username,profile_image_url`

## Configuration

Required environment variables:

- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `APP_URL` — used to construct the redirect URI: `${APP_URL}/api/social/twitter/callback`

## Authentication Model

OAuth 2.0 Authorization Code with PKCE. Scope requested:

```
tweet.read tweet.write users.read media.write offline.access
```

`offline.access` is required for refresh tokens. `media.write` is required for media uploads.

Stored token fields per `SocialAccount` DB record:

```
accessToken    — encrypted at rest (AES via crypto util)
refreshToken   — encrypted at rest
expiresAt      — DateTime, used for proactive refresh
accountId      — stable X user ID (from /2/users/me after auth)
profileName    — X display name
avatarUrl      — X profile image URL
```

### Token Refresh Strategy

Two refresh paths exist, both routing through `refreshAccountToken()`:

**Proactive refresh** — triggered before publish if the token is expired or within 5 minutes of expiry:

```typescript
const fiveMinutes = 5 * 60 * 1000;
if (account.expiresAt && account.expiresAt.getTime() - Date.now() < fiveMinutes && account.refreshToken) {
  const refreshed = await this.refreshAccountToken(account, channel);
  if (refreshed) accessToken = refreshed;
}
```

**Reactive refresh** — triggered when `publish()` throws a 401/403/Unauthorized/Forbidden error:

```typescript
const isAuthError = publishErr.message.includes('401') || publishErr.message.includes('403') || ...;
if (isAuthError && account.refreshToken) {
  const refreshed = await this.refreshAccountToken(account, channel, true);
  if (refreshed) {
    externalId = await channel.publish(..., { accessToken: refreshed });
  }
}
```

### In-Process Lock (Thundering Herd Protection)

`refreshAccountToken()` uses a `Map<accountId, Promise>` to prevent concurrent refresh calls for the same account within the same process:

```typescript
private refreshLocks = new Map<string, Promise<string | null>>();

private async refreshAccountToken(account, channel, force = false) {
  const existing = this.refreshLocks.get(account.id);
  if (existing) return existing; // wait for in-flight refresh

  const promise = (async () => {
    // ... call channel.refreshTokens(), persist new tokens, return accessToken
  })();

  this.refreshLocks.set(account.id, promise);
  return promise;
}
```

This is appropriate for remix-studio's single-container deployment. A distributed lock (e.g., Postgres advisory lock) would be needed if multiple instances were running.

### Refresh Token Preservation

X token rotation: X always issues a new refresh token on each refresh. If X doesn't return a new refresh token (edge case), the old one is preserved:

```typescript
const newRt = tokens.refreshToken ?? rt; // preserve old if X returns none
```

### Refresh Endpoint Call

`refreshTokens()` in `TwitterChannel` sends:

- `Authorization: Basic base64(clientId:clientSecret)`
- Body: `grant_type=refresh_token`, `refresh_token=<token>`, `client_id=<clientId>`

```typescript
const params = new URLSearchParams({
  refresh_token: refreshToken,
  grant_type: 'refresh_token',
  client_id: this.clientId,
});

const response = await fetch('https://api.twitter.com/2/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentials}`,
  },
  body: params.toString(),
});
```

## OAuth Connect Flow

### Connect

`GET /api/social/:platform/connect` — generates PKCE verifier + challenge + state, stores in short-lived cookies, redirects to X authorization URL.

### Callback

`GET /api/social/:platform/callback`:

1. Validates state cookie (CSRF protection).
2. Exchanges code + verifier for tokens via `exchangeCode()`.
3. Fetches real X user profile from `GET /2/users/me` to get a stable `accountId`.
4. Upserts `SocialAccount` on `(userId, platform, accountId)` — reconnecting refreshes tokens in place, never creates a duplicate.

Profile fetch:

```typescript
const profileRes = await fetch('https://api.x.com/2/users/me?user.fields=name,username,profile_image_url', {
  headers: { Authorization: `Bearer ${tokens.accessToken}` },
});
accountId = profileData.data?.id;
profileName = profileData.data?.name ?? profileData.data?.username;
avatarUrl = profileData.data?.profile_image_url;
```

## Current Media Strategy

Split by media type. Matches observed live endpoint behavior.

### Images

Uses the direct image upload endpoint: `POST /2/media/upload`

Request shape:
- `Authorization: Bearer <token>`
- JSON body: `media` (base64), `media_category: "tweet_image"`, `media_type`, `shared: false`

```typescript
const response = await fetch('https://api.x.com/2/media/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    media: fileBuffer.toString('base64'),
    media_category: 'tweet_image',
    media_type: mimeType,
    shared: false
  })
});
```

Media ID extraction: `data.id` from response JSON.

Rationale: `POST /2/media/upload/initialize` for still images returned repeated 503 in testing. Direct upload endpoint is the stable path.

### GIF and Video

Uses the chunked v2 flow:

1. `POST /2/media/upload/initialize` — `{ total_bytes, media_type, media_category }`
2. `POST /2/media/upload/{mediaId}/append` — `{ media: base64chunk, segment_index }`
3. `POST /2/media/upload/{mediaId}/finalize` — no body
4. `GET /2/media/upload?command=STATUS&media_id=...` — poll until `succeeded`

Chunk size: **2 MB** raw bytes. 4 MB chunks caused 413 after base64 JSON expansion.

`media_category` mapping:
- `image/gif` → `tweet_gif`
- `video/*` → `tweet_video`
- images → `tweet_image`

Important: `append` body must contain only `media` and `segment_index`. Including `command` or `media_id` in the body caused rejections in testing.

## Publish Flow

`TwitterChannel.publish()`:

1. Upload each media item (max 4) via `uploadMedia()`.
2. Create tweet via `POST /2/tweets` with `{ text, media: { media_ids } }`.
3. Return tweet ID as `externalId`.

`PostManager.fanOutAndExecute()` (used for Send Now — synchronous):

1. Fan out post → create `PostExecution` records per connected social account.
2. Immediately `executePost()` for each execution.
3. Set post `status` based on results: `completed` if all/any posted, `failed` if none.

Post status is set **after** real execution results are known — never prematurely.

## Retry Strategy

Upload-level retries: none currently (unlike pilot-banana's 3-attempt retry per upload step). A 429 or 5xx from the upload endpoint throws immediately.

Execution-level retries (queue path only): up to 3 attempts with backoff:
- Attempt 1: 1000 ms
- Attempt 2: 2500 ms
- Attempt 3: 5000 ms

Send Now path (synchronous) does not retry on transient errors — it returns the real result immediately to the caller.

## Known Gaps vs Pilot-Banana

1. **No per-upload-step retry** — pilot-banana retries 429/5xx up to 3 times per INIT/APPEND/FINALIZE/STATUS step. We throw on first failure.
2. **No image adaptation (resize/recompress)** — pilot-banana resizes oversized images to 4096px max and progressively reduces JPEG quality to fit under ~3.5 MB before upload. We send the raw buffer.
3. **No media composition validation** — no enforcement of one-video, one-GIF, or mixed-media restrictions at publish time.
4. **Single-process lock only** — in-process `Map` is sufficient for single-container deployment. Would need Postgres advisory lock for multi-instance.
5. **No upload diagnostics logging** — pilot-banana logs detailed request summaries and selected response headers (x-transaction-id, rate-limit headers) per upload step.

## When Changing This Integration

1. Update this document alongside code changes.
2. Test these cases separately:
   - Single JPEG image
   - Single PNG image
   - Single GIF
   - Single MP4 video
   - Multiple images (up to 4)
   - Post with no media (text only)
   - Reconnect same account (should update, not duplicate)
   - Expired token publish (should trigger proactive refresh)
   - Invalid token publish (should trigger reactive refresh)
3. Prefer small, reversible changes. X media endpoint behavior has not been fully consistent across documentation and live responses.
