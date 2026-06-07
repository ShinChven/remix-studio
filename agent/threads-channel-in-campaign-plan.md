# Threads Channel In Campaign Implementation Plan

Created: 2026-06-07

This plan is based on repository inspection plus online verification against Meta's official Threads Postman workspace on 2026-06-07. Do not implement from memory. Before coding, re-open the Meta Threads changelog and the official Postman workspace, then update this document if anything has changed.

## Official Documentation Verification

Primary verified sources:

- Meta official Threads Postman workspace: https://www.postman.com/meta/threads/overview
- Meta official Threads API collection/docs: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- Threads changelog URL referenced by Meta's Postman collection: https://developers.facebook.com/docs/threads/changelog
- Threads developer docs root: https://developers.facebook.com/docs/threads/

Important verification notes:

- The Postman workspace says it is Meta's official Threads API workspace and a source of truth for Threads APIs. The workspace showed an update timestamp of June 5, 2026.
- The Postman collection itself warns that it may not showcase all latest features and says to use the developer documentation changelog for the most up-to-date features.
- The web fetcher could not retrieve `developers.facebook.com/docs/threads/...` pages directly during this research, so the implementation must begin with a fresh manual/browser check of the changelog and the relevant developer-doc pages.

Verified API facts from the official Postman collection:

- Setup requires a Meta app with the Threads use case, user authorization, and a Threads user access token.
- Scopes shown for the baseline authorization flow include `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, and `threads_manage_insights`. Newer request pages also show optional scopes such as `threads_keyword_search`, `threads_manage_mentions`, `threads_delete`, `threads_location_tagging`, and `threads_profile_discovery`.
- Token flow:
  - Exchange code: `POST https://graph.threads.net/oauth/access_token`
  - Exchange short-lived token for long-lived token: `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=...`
  - Refresh long-lived token: `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token`
- Profile lookup for the connected account uses `GET https://graph.threads.net/me?fields=id,username,name,threads_profile_picture_url,threads_biography`.
- Publishing is container based:
  - Create container: `POST /me/threads`
  - Publish container: `POST /me/threads_publish?creation_id=...`
  - Text uses `media_type=TEXT`.
  - Image uses `media_type=IMAGE&image_url=...`.
  - Video uses `media_type=VIDEO&video_url=...`.
  - Images/videos are fetched by Meta from the provided URL, so URLs must be publicly reachable.
- Carousel publishing is supported:
  - Create image/video item containers with `is_carousel_item=true`.
  - Create a parent `media_type=CAROUSEL` container with `children=<container ids>`.
  - The official Postman request says carousel `children` can include 2 to 20 image/video container IDs.
- Container status can be checked with `GET /{container_id}?fields=...`; documented statuses include `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, and `PUBLISHED`.
- Publishing quota can be checked with `GET /me/threads_publishing_limit?fields=...`; the sample includes `quota_usage`, `config.quota_total`, and `config.quota_duration`.

## Current Remix Studio Architecture

Relevant local code:

- Social channel contract and factory: `server/services/social/index.ts`
- Existing X adapter: `server/services/social/twitter-channel.ts`
- OAuth/social account routes: `server/routes/social.ts`
- Campaign fan-out and execution worker: `server/queue/post-manager.ts`
- Campaign/channel schema: `prisma/schema.prisma`
- Campaign channel UI: `src/pages/CampaignChannels.tsx`
- Campaign create/edit UI: `src/pages/CampaignForm.tsx`
- Campaign/post views: `src/pages/CampaignDetail.tsx`, `src/pages/CampaignPostDetail.tsx`, `src/pages/CampaignHistory.tsx`, `src/pages/PostForm.tsx`
- Agent campaign tools: `server/mcp/tool-definitions.ts`

Local constraints:

- `SocialAccount.platform` is already a string, and campaigns already target `SocialAccount[]`, so adding `platform='threads'` should not need a core campaign schema migration.
- The existing `ISocialChannel.publish()` contract accepts media buffers. Threads requires `image_url` and `video_url`; this is the main backend mismatch.
- `server/routes/social.ts` currently fetches profile data with hard-coded X API calls. That needs to move behind the social channel abstraction.
- `PostManager.executePost()` currently reads each media object into memory before calling `publish()`. Threads should use stable public/presigned URLs instead.
- The channel UI is hard-coded around X for connect buttons, icons, copy, and reconnect URLs.
- Assistant tools already list social accounts and connect them to campaigns by ID. Once Threads accounts appear in `SocialAccount`, agent campaign workflows should mostly work without new MCP tools.

## Scope

MVP:

- Connect a Threads account.
- Store encrypted Threads tokens in `SocialAccount`.
- Display Threads accounts in channel management and campaign selection.
- Publish campaign posts to Threads through scheduled and send-now flows.
- Support text-only, single image, single video, and carousel posts where current campaign post media contains 2 to 20 image/video items.
- Persist `PostExecution.externalId`, `externalUrl` when available, error messages, and retry state.

Not MVP:

- Reply moderation, mentions, keyword search, post/account insights, webhooks, oEmbed, location tagging, ghost posts, polls, text attachments, GIF provider attachments, and deletion. These are documented capabilities but should be separate features.

## Implementation Phases

### 0. Re-verify Documentation Before Coding

- Open the official Threads changelog and confirm there are no breaking changes to auth, scopes, publish endpoints, media URL rules, carousel flow, or quota behavior.
- Re-open the official Postman collection and verify the workspace/collection updated date.
- Confirm the authorization-window URL and PKCE support requirements from the official Meta developer docs page. Do not infer this solely from old examples.
- Update this plan's "Official Documentation Verification" section with the exact checked date and any changed facts.

### 1. Make The Social Channel Abstraction Provider-Neutral

Change `ISocialChannel` so profile lookup and publish result handling are not X-specific:

- Add a method like `getProfile(accessToken): Promise<{ accountId; profileName; avatarUrl?; username? }>` and use it in `server/routes/social.ts`.
- Change `publish()` to return a structured result:

```ts
type PublishResult = {
  externalId: string;
  externalUrl?: string;
};
```

- Pass richer media objects into `publish()`:

```ts
type PreparedSocialMedia = {
  type: 'image' | 'video' | 'gif';
  mimeType: string;
  buffer?: Buffer;
  publicUrl?: string;
  storageKey?: string;
  altText?: string;
};
```

- Keep buffers for X and add `publicUrl` for Threads. `PostManager` can prepare both so existing X behavior is preserved.

### 2. Implement `ThreadsChannel`

Add `server/services/social/threads-channel.ts`.

Configuration:

- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `APP_URL`
- Redirect URI: `${APP_URL}/api/social/threads/callback`

Auth/token behavior:

- Build auth URL only after re-verifying the official authorization-window docs.
- Exchange the callback code with `POST /oauth/access_token`.
- Immediately exchange the short-lived token for a long-lived token with `GET /access_token?grant_type=th_exchange_token&client_secret=...`.
- Store the long-lived token and `expiresAt` from `expires_in`.
- Implement `refreshTokens()` with `GET /refresh_access_token?grant_type=th_refresh_token`.
- Store granted scopes in `SocialAccount.scopes` when available.

Profile:

- Implement `getProfile()` using `GET /me?fields=id,username,name,threads_profile_picture_url,threads_biography`.
- Use `id` as `accountId`, `name || username` as `profileName`, and `threads_profile_picture_url` as `avatarUrl`.

Publishing:

- Before publishing, optionally call `GET /me/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config` and fail early with a clear error if quota is exhausted.
- Text-only: create `media_type=TEXT` container, then publish it.
- Single image/video: generate a public/presigned URL from storage, create `IMAGE` or `VIDEO` container, poll status until `FINISHED`, then publish.
- Carousel: for 2 to 20 image/video media items, create item containers with `is_carousel_item=true`, create parent `media_type=CAROUSEL&children=...&text=...`, poll status, then publish.
- After publish, fetch the published media object with fields including `permalink` and return `{ externalId, externalUrl: permalink }` when available.

### 3. Update `PostManager` Media Preparation

Modify `server/queue/post-manager.ts`:

- Replace buffer-only preparation with provider-neutral `PreparedSocialMedia`.
- For each media item, use `processedUrl || sourceUrl`.
- Continue reading `buffer` for X.
- Also call `storage.getPresignedUrl(key, 86400)` for Threads so Meta can fetch the media. Use a long enough expiry to cover container processing and retry; 24 hours is a practical starting point.
- Add a channel/platform hook if some providers should not pay the cost of reading buffers.
- Handle structured publish results and store `externalUrl` from the channel rather than constructing every URL in `PostManager`.
- Keep current tenant isolation, proactive refresh, reactive auth retry, and backoff behavior.

### 4. Wire Factory And Social Routes

Modify `server/services/social/index.ts`:

- Register `platform === 'threads'`.
- Validate `THREADS_APP_ID` and `THREADS_APP_SECRET`.

Modify `server/routes/social.ts`:

- Use `channel.getProfile(tokens.accessToken)` in callback instead of hard-coded X profile fetch.
- Use `channel.getProfile()` in refresh-profile for all platforms that implement it.
- Store `scopes` if token exchange returns them.
- Keep current CSRF state cookie behavior.

### 5. UI Integration

Update UI platform helpers:

- Add Threads icon/display name helpers shared by:
  - `CampaignChannels.tsx`
  - `CampaignForm.tsx`
  - `CampaignDetail.tsx`
  - `CampaignPostDetail.tsx`
  - `CampaignHistory.tsx`
  - `PostForm.tsx`
- Add a "Connect Threads" button pointing to `/api/social/threads/connect`.
- Make reconnect URLs provider-specific instead of hard-coded to X.
- In empty channel copy, say "Connect a channel" instead of "Connect an X account".
- Add Threads external link handling using `PostExecution.externalUrl`; do not synthesize a URL unless official docs confirm the format.

### 6. Documentation And Environment

- Add `THREADS_APP_ID` and `THREADS_APP_SECRET` to `.env.example`, `.env.docker.example`, and Docker env examples where X credentials are currently documented.
- Add `docs/THREADS_PLATFORM_SETUP.md` with:
  - Meta app with Threads use case.
  - Redirect URL: `${APP_URL}/api/social/threads/callback`.
  - Required MVP scopes: `threads_basic`, `threads_content_publish`.
  - Optional later scopes: replies, insights, mentions, keyword search, location tagging, delete.
  - Reminder to use Threads-specific app ID/secret, not unrelated Meta app credentials, after verifying this in current Meta docs.

### 7. Agent/MCP Surface

No new campaign tools are required for the MVP because `list_social_accounts`, `create_campaign`, and `update_campaign` already work from `SocialAccount` IDs.

Recommended refinements:

- Update assistant system prompt wording from "like X/Twitter" to "like X/Twitter or Threads".
- Ensure `SAFE_SOCIAL_ACCOUNT_SELECT` includes `platform`, `profileName`, `avatarUrl`, and `scopes` only if safe.
- Consider adding a read-only `get_social_account_capabilities` tool later if platform-specific limits become user-visible.

### 8. Tests And Verification

Unit tests:

- `ThreadsChannel.exchangeCode()` parses short-lived and long-lived tokens.
- `ThreadsChannel.refreshTokens()` parses refreshed token expiry.
- `ThreadsChannel.getProfile()` maps Threads profile fields to `SocialAccount` fields.
- `ThreadsChannel.publish()` chooses text, single media, or carousel flows based on media count/type.
- `SocialChannelFactory.getChannel('threads')` validates env vars and returns the adapter.

Integration tests with fetch mocks:

- `/api/social/threads/callback` upserts a `SocialAccount` with encrypted tokens.
- `/api/social/:platform/:id/refresh-profile` uses channel profile lookup for Threads.
- `PostManager.executePost()` passes public URLs to Threads and stores `externalId`/`externalUrl`.
- Existing X publish tests still pass after interface changes.

Manual QA:

- Connect Threads account locally and in production-like `APP_URL` environment.
- Create a campaign with X plus Threads and confirm fan-out creates one `PostExecution` per account.
- Send now: text-only, one image, one video, carousel with 2 images.
- Scheduled publish: same media cases.
- Force expired token path and confirm refresh works.
- Force private/expired media URL and verify the error is actionable.
- Confirm UI channel chips, reconnect, disconnect, campaign selection, history links, and post detail all render Threads correctly.

## Risks And Open Questions

- Direct developer docs and changelog were not fetchable through the web tool during planning. This is a hard gate before implementation.
- Meta must be able to fetch media URLs. Private storage deployments without a public S3/R2 endpoint or valid presigned URLs will fail.
- The current media processing path passes videos/GIFs through without format validation. Threads-specific video constraints need current-doc verification before broad video support is declared production-ready.
- `getPresignedUrl(..., 86400)` may not be enough if retries happen after URL expiry. If retries are likely, generate fresh URLs on each execution attempt rather than storing them.
- Campaign create/update routes currently connect arbitrary social account IDs without explicitly resolving ownership. MCP tools already resolve ownership; HTTP routes should be tightened while touching this area.
