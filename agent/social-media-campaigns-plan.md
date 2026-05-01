# Social Media Campaigns: Comprehensive Architecture & Design

## 1. Executive Summary & Architectural Philosophy

The "Social Media Campaigns" feature transforms Remix Studio from an isolated AI generation and asset management tool into an end-to-end content creation and distribution hub. By allowing users to organize assets into Campaigns and automatically distribute them across connected Social Channels (starting with X, formerly Twitter), the platform bridges the gap between creation and audience engagement.

**Architectural Philosophy:**
1.  **Resilience over Speed:** Social media APIs (especially X's v2 API) are prone to rate limits (HTTP 429), temporary internal errors (HTTP 5xx), and strict payload constraints. The scheduling engine must be designed around failure, utilizing exponential backoff and granular, per-account execution tracking.
2.  **Stateless Polling:** Rather than introducing heavy infrastructure like Redis or RabbitMQ, we leverage our existing PostgreSQL database as a robust queue. By utilizing `SKIP LOCKED` row-level locking, we achieve safe concurrency across multiple Node.js worker instances without external dependencies.
3.  **Asynchronous Media Pipelining:** AI-generated media can be massive (e.g., 4K upscaled images or raw video). Preparing this media for social distribution (downscaling, formatting) must happen asynchronously so the user interface remains snappy.
4.  **Strict Tenant Isolation & Security:** OAuth access tokens are highly sensitive credentials. They must be encrypted at rest, and all API interactions must strictly validate tenant ownership to prevent cross-account posting vulnerabilities.

---

## 2. Comprehensive Database Schema Design

The Prisma schema must be extended to support campaigns, social account connections, posts, media processing states, and execution tracking. Performance relies heavily on strategic indexing.

### `SocialAccount`
Stores OAuth 2.0 credentials securely. 

```prisma
model SocialAccount {
  id               String    @id @default(uuid())
  userId           String
  platform         String    // "twitter", "linkedin", "facebook"
  accountId        String    // Remote provider ID (e.g., Twitter user ID)
  profileName      String?   // Display name
  avatarUrl        String?
  accessToken      String    @db.Text // Encrypted at rest
  refreshToken     String?   @db.Text // Encrypted at rest
  scopes           Json?     // Array of granted OAuth scopes
  expiresAt        DateTime?
  status           String    @default("active") // "active", "disconnected", "expired"
  rateLimitResetAt DateTime? // Optional: Track when the next API call is allowed globally
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaigns        Campaign[] // Implicit many-to-many relation
  
  @@unique([userId, platform, accountId])
  @@index([status])
}
```

### `Campaign`
A structural grouping linking content to delivery channels.

```prisma
model Campaign {
  id             String          @id @default(uuid())
  userId         String
  name           String
  description    String?         @db.Text
  status         String          @default("active") // "active", "completed", "archived"
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  posts          Post[]
  socialAccounts SocialAccount[] // Implicit many-to-many: target channels
  
  @@index([userId, status])
}
```

### `Post` & `PostMedia`
The content payloads. A post is not ready for scheduling until all associated media reaches a `ready` state.

```prisma
model Post {
  id          String   @id @default(uuid())
  campaignId  String
  userId      String
  textContent String?  @db.Text
  status      String   @default("draft") // "draft", "scheduled", "completed", "failed"
  scheduledAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  campaign    Campaign        @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  media       PostMedia[]
  executions  PostExecution[] 
  
  // High-frequency index for the polling engine looking for due posts
  @@index([status, scheduledAt]) 
}

model PostMedia {
  id           String   @id @default(uuid())
  postId       String
  sourceUrl    String   // Reference to internal Library/Album S3 key
  processedUrl String?  // Target S3 key after format/compression
  thumbnailUrl String?
  type         String   // "image", "video", "gif"
  status       String   @default("pending") // "pending", "processing", "ready", "failed"
  quality      String   @default("high")    // "raw", "high", "medium", "low"
  mimeType     String?
  width        Int?
  height       Int?
  size         BigInt?
  errorMsg     String?  @db.Text
  createdAt    DateTime @default(now())

  post         Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  
  @@index([status])
}
```

### `PostExecution`
The core entity for delivery tracking. Isolating execution per channel ensures that a rate limit on X does not prevent a successful post on LinkedIn.

```prisma
model PostExecution {
  id               String   @id @default(uuid())
  postId           String
  socialAccountId  String
  status           String   @default("pending") // "pending", "publishing", "posted", "failed"
  externalId       String?  // The Tweet ID or LinkedIn URN
  externalUrl      String?  // Direct link to the public post
  errorMsg         String?  @db.Text
  
  // Resilience & Backoff fields
  attempts         Int      @default(0)
  lastAttemptAt    DateTime?
  nextAttemptAt    DateTime? // For rate limit and exponential backoff
  
  publishedAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  post             Post          @relation(fields: [postId], references: [id], onDelete: Cascade)
  socialAccount    SocialAccount @relation(fields: [socialAccountId], references: [id], onDelete: Cascade)

  // Critical index for the execution worker loop
  @@index([status, nextAttemptAt])
}
```

---

## 3. Security, Authorization & Compliance

### OAuth 2.0 Flow (PKCE & CSRF Protection)
To connect a social account, the system will use OAuth 2.0 with PKCE (Proof Key for Code Exchange) where supported (e.g., X v2 API). 
1. **State Parameter:** A secure, random `state` parameter is generated, stored in a short-lived HTTP-only signed cookie (or Redis/DB session), and passed to the authorization URL. This prevents Cross-Site Request Forgery (CSRF).
2. **Code Verifier:** A PKCE `code_verifier` is generated, hashed (`code_challenge`), and sent. Upon redirect, the server exchanges the authorization code alongside the original `code_verifier` to prove identity.

### Encryption at Rest
OAuth `accessToken` and `refreshToken` fields in the `SocialAccount` table grant the application the ability to act on the user's behalf.
- **Implementation:** These tokens must be symmetrically encrypted before being written to Postgres using the `PROVIDER_ENCRYPTION_KEY` environment variable (AES-256-GCM).
- **Decryption:** Tokens are decrypted in-memory only exactly when needed by the `PostManager` or `SocialChannelFactory`.

### Tenant Isolation
Every database query involved in the execution pipeline must strictly validate the `userId` chain. When `PostManager` executes a `PostExecution`, it must verify that the `Post.userId` matches the `SocialAccount.userId`.

---

## 4. Social Channel Abstraction & Integration (Focus: X / Twitter)

To future-proof the application, all social interactions occur through an abstract interface: `ISocialChannel`. 

```typescript
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface ISocialChannel {
  platformName: string;
  getAuthUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  publish(text: string, mediaUrls: string[], tokens: TokenSet): Promise<string>;
}
```

### X (Twitter) Implementation Specifics
The `TwitterChannel` will strictly and exclusively utilize the **X API v2** for all operations. No legacy v1.1 endpoints are permitted.
- **Media Uploads:** All media processing and uploading must be implemented using the X API v2 media upload endpoints. The resulting media identifiers are then attached to the v2 `tweets` endpoint payload.
- **Constraints:** X limits posts to 280 characters (for standard accounts). Media is limited to 4 images OR 1 video/GIF per tweet. Videos must meet specific codec (H264), framerate, and dimension constraints. 
- **Token Management:** X OAuth 2.0 access tokens are typically short-lived (e.g., 2 hours). The integration must preemptively check `expiresAt` before publishing and utilize the `refreshToken` to acquire a fresh set, updating the `SocialAccount` record via a transaction before proceeding with the post.

---

## 5. High-Performance Asynchronous Media Processing

AI-generated media cannot be directly blasted to social APIs; it must be optimized. 

**The `MediaProcessingPoller` Worker:**
- A dedicated background loop polling `PostMedia` where `status = 'pending'`.
- Using `SKIP LOCKED`, workers claim media rows to prevent duplicate processing.
- **Image Pipeline:** Utilizes the `sharp` library. Images are fetched via streaming from the source S3 bucket, resized (max 4096px dimension to satisfy most social networks while preserving quality), compressed to JPEG/WebP based on user preference, and streamed directly back to a target S3 prefix (`campaigns/{campaignId}/media/{uuid}`). 
- **Thumbnailing:** A tiny, heavily compressed thumbnail is generated for rapid UI rendering in the campaign dashboard.
- **Video Pipeline:** If video is supported, the system will utilize `ffmpeg` (via a spawned child process) to ensure the video conforms to standard MP4 (H.264/AAC) requirements.
- **State Transition:** Upon success, `processedUrl` is populated and status becomes `ready`. If a post was in a "waiting for media" state, checking the post can now allow it to transition to `scheduled`.

---

## 6. The Scheduling & Execution Engine (Postgres Queue)

The core of the system is a highly reliable, failure-tolerant delivery engine utilizing Postgres as the queuing backend.

### Phase 1: The Fan-Out Trigger (`PostManager`)
A lightweight `setInterval` worker running every 60 seconds.
1. **Query:** `SELECT * FROM Post WHERE status = 'scheduled' AND scheduledAt <= NOW() FOR UPDATE SKIP LOCKED LIMIT 100`
2. **Action:** For each Post, retrieve its parent `Campaign` and the associated `SocialAccount`s.
3. **Fan-out Logic:**
    - If 0 accounts: Update Post status to `failed`, `errorMsg: "No linked accounts"`.
    - If >0 accounts: Update Post status to `completed`. For *each* account, `INSERT INTO PostExecution (postId, socialAccountId, status, nextAttemptAt) VALUES (..., 'pending', NOW())`.

### Phase 2: The Execution Worker
A separate concurrency-controlled worker processing `PostExecution` records.
1. **Query:** `SELECT * FROM PostExecution WHERE status = 'pending' AND nextAttemptAt <= NOW() FOR UPDATE SKIP LOCKED LIMIT 10`
2. **Pre-flight:** 
    - Update row to `status: 'publishing'`, increment `attempts`, set `lastAttemptAt: NOW()`.
    - Decrypt OAuth tokens. Refresh if expired.
3. **Publishing:** 
    - Download processed media from S3 to a temporary buffer (or stream directly to the provider).
    - Call `ISocialChannel.publish()`.
4. **Resolution & Exponential Backoff:**
    - **Success:** Update status to `posted`, save `externalId` and `externalUrl`.
    - **Transient Failure (e.g., 429 Too Many Requests, 503 Server Error, network timeouts):**
        - If `attempts < MAX_RETRIES` (e.g., 3): Calculate backoff using a fast-retry strategy (e.g., 1000ms for attempt 1, 2500ms for attempt 2, 5000ms for attempt 3). Set `nextAttemptAt = NOW() + backoff`. Revert status to `pending`.
        - If `retry-after` or `x-rate-limit-reset` headers are present, strictly respect those exact timestamps for `nextAttemptAt` over the default backoff.
    - **Fatal Failure (e.g., 401 Unauthorized, 400 Bad Request, Content Policy Violation):**
        - Set status to `failed`, record the exact `errorMsg` returned by the provider.
        - If `401 Unauthorized`, automatically update the parent `SocialAccount` to `status: 'disconnected'` to alert the user to re-authenticate.

---

## 7. User Interface, UX & Frontend Integration

The Remix Studio frontend will be updated to make campaign management intuitive and informative.

### Connections Dashboard
A dedicated "Social Integrations" panel under User Settings. Users click "Connect X", which redirects to the OAuth flow and returns them. The UI dynamically reflects the `status` ("Active", "Disconnected") and allows manual revocation.

### Campaign Management UI
- **List View:** A grid of Campaigns showing aggregated metrics (Total Posts, Drafts, Scheduled, Failed, Successfully Posted).
- **Campaign Detail (Kanban/List):** A view categorizing posts by their state.
- **The Post Composer:** 
    - A specialized modal featuring a text area with dynamic character limits based on the selected channel (e.g., 280 for X).
    - A media attachment interface pulling directly from the user's Library/Albums.
    - A date/time picker utilizing the user's local timezone (converted to UTC for backend storage).
    - Real-time polling via React Query / SWR to reflect the asynchronous media processing status (showing a spinner over attached media until it reaches `ready`).

### Granular Error Reporting
When viewing a Post, if it has `PostExecution` records, the UI will display per-channel status chips. E.g., a green "X: Posted" chip next to a red "LinkedIn: Failed (Invalid Token)" chip. This empowers the user to understand exactly what happened without digging through system logs.

---

## 8. Observability, Analytics & Future-Proofing

### Observability
Every step of the execution pipeline will utilize structured logging (JSON) detailing `userId`, `campaignId`, `postId`, `socialAccountId`, and the specific action or error. This allows for rapid debugging via external log aggregators (like Datadog or CloudWatch) if a user reports a failed delivery.

### Analytics (Future Scope)
Because we store the `externalId` (the ID of the Tweet/Post) in `PostExecution`, future iterations of the Poller can include an Analytics Worker. This worker would query the social network APIs periodically to fetch Impressions, Likes, Reposts, and Comments, storing them in a new `PostAnalytics` table to provide ROI reporting within the Campaign dashboard.

### Extension to New Channels
Adding LinkedIn, Instagram, or Facebook simply requires writing a new class implementing `ISocialChannel` and adding its OAuth credentials to the `.env` file. The core database schema, queueing logic, media processing, and fan-out architecture remain entirely untouched, proving the robustness of the decoupled design.

---

## 9. Validation & Publishing Philosophy

Based on empirical evidence regarding the volatility of social media APIs, the system enforces a strict separation between local drafting constraints and remote publishing constraints.

### Permissive Save-Time Validation
When a user is drafting a post within Remix Studio, validation must be **permissive**:
- **Allowed:** Enforce only basic structural limits, such as maximum total media items (e.g., 4), maximum application-side file sizes (e.g., 20MB for images, 512MB for videos), and supported MIME types.
- **Not Allowed:** Do not block the user from attaching "mixed media" (e.g., an image and a video) or multiple videos at the draft stage. Blocking drafts based on assumptions about platform-specific rules creates friction, especially since those rules often change or differ wildly between channels (e.g., X vs. LinkedIn).

### Strict Send-Time Execution
Platform-specific constraints (e.g., X's rule of 1 video max per tweet, or specific character limits) are handled exclusively at execution time by the `ISocialChannel` adapter:
- The adapter will take a "best effort" approach, such as uploading up to the first 4 media URLs.
- If the platform rejects the combination, the failure is tracked granularly in the `PostExecution` record, ensuring one failing channel doesn't cascade and break the core campaign logic.