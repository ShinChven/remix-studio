# X (Twitter) API v2 Integration Plan

This document outlines the detailed integration plan for connecting Remix Studio to X (formerly Twitter). Per architectural mandates, this integration **strictly and exclusively utilizes the X API v2**. No legacy v1.1 endpoints are permitted.

## 1. Authentication: OAuth 2.0 with PKCE

To act on behalf of a user (post tweets, upload media), the application must use the **OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)**.

### Flow Details
1. **Generate PKCE Secrets:**
   - Create a high-entropy random string as the `code_verifier`.
   - Hash it using SHA-256 and base64url-encode it to create the `code_challenge`.
2. **Authorization Request:**
   - **Endpoint:** `GET https://twitter.com/i/oauth2/authorize`
   - **Parameters:**
     - `response_type=code`
     - `client_id={YOUR_CLIENT_ID}`
     - `redirect_uri={YOUR_REGISTERED_REDIRECT_URI}` (Must match exactly)
     - `scope=tweet.read tweet.write users.read offline.access` (Note: `offline.access` is required to receive a `refresh_token`).
     - `state={CSRF_TOKEN}`
     - `code_challenge={GENERATED_CHALLENGE}`
     - `code_challenge_method=S256`
3. **Token Exchange:**
   - Upon redirect, extract the `code` and `state`.
   - **Endpoint:** `POST https://api.twitter.com/2/oauth2/token`
   - **Body:** `grant_type=authorization_code`, `client_id`, `redirect_uri`, `code`, and the original plain-text `code_verifier`.
4. **Token Refresh:**
   - Access tokens typically expire in 2 hours.
   - **Endpoint:** `POST https://api.twitter.com/2/oauth2/token`
   - **Body:** `grant_type=refresh_token`, `client_id`, `refresh_token`.

*Reference:* [X Developer Docs: OAuth 2.0](https://developer.x.com/en/docs/authentication/oauth-2-0)

---

## 2. Media Upload: Empirical v2 API Workflow

While the official documentation suggests a unified chunked upload path, empirical testing and live runtime behavior mandate a split strategy based on media type. X has transitioned media uploads to the `api.x.com/2/media/upload` domain.

### Strict Media Limits & Image Optimization
- **Images (JPG, PNG, WEBP):** Max 5 MB per file.
  - *Optimization Strategy:* Before uploading, images with a long edge > 4096px must be resized to 4096px. If the file exceeds 4.7 MB, it should be progressively re-encoded (e.g., JPEG quality ladder: 92, 88, 84... down to 60) until it fits under the target size to prevent rejection.
- **GIFs (Animated):** Max 15 MB per file.
- **Videos (MP4, MOV):** Max 512 MB per file. Maximum duration is strictly **140 seconds**.
- **Attachment Limit:** Up to 4 images OR 1 video OR 1 GIF per tweet.

### Path A: Images (Direct Upload)

**Why:** Observed runtime behavior shows that calling the chunked `initialize` endpoint for `tweet_image` repeatedly returns `503 Service Unavailable`.

**Endpoint:** `POST https://api.x.com/2/media/upload`

- **Payload (JSON):**
  ```json
  {
    "media": "<Base64_Encoded_Image_Bytes>",
    "media_category": "tweet_image",
    "media_type": "image/jpeg",
    "shared": false
  }
  ```
- **Response:** Returns a `data.id` which is the `media_id_string`.

### Path B: GIF & Video (Chunked Upload)

**Why:** Large files require chunking, and the `initialize` endpoint works successfully for `tweet_video` and `tweet_gif`.

1. **INIT (Initialization):**
   - **Endpoint:** `POST https://api.x.com/2/media/upload/initialize`
   - **Payload (JSON):**
     ```json
     {
       "total_bytes": 1234567,
       "media_type": "video/mp4",
       "media_category": "tweet_video"
     }
     ```
   - **Response:** Returns the `media_id_string` in `data.id`.

2. **APPEND (Upload Chunks):**
   - **Endpoint:** `POST https://api.x.com/2/media/upload/{MEDIA_ID}/append`
   - **Critical Constraint:** Raw 4MB chunks cause `413 Payload Too Large` after Base64 JSON expansion. **Chunk size must be limited to 2 MB.**
   - **Critical Constraint:** The live endpoint rejects requests that include `command` or `media_id` in the body.
   - **Payload (JSON):**
     ```json
     {
       "media": "<Base64_Encoded_Chunk_2MB_Max>",
       "segment_index": 0
     }
     ```
   - Repeat incrementing `segment_index` until all bytes are uploaded.

3. **FINALIZE (Completion):**
   - **Endpoint:** `POST https://api.x.com/2/media/upload/{MEDIA_ID}/finalize`
   - **Payload:** Empty body.
   - **Response:** May return a `processing_info` object indicating async processing.

4. **STATUS (Polling for Videos/GIFs):**
   - If `FINALIZE` returned `processing_info`, you must poll.
   - **Endpoint:** `GET https://api.x.com/2/media/upload?command=STATUS&media_id={MEDIA_ID}`
   - Poll based on `check_after_secs` until `state` is `succeeded`.

*Reference:* [X Developer Docs: Media Uploads](https://developer.x.com/en/docs/x-api/v1/media/upload-media/overview) *(Note: While the core concepts originate from v1.1, X directs developers to use the `api.x.com/2/media/upload` base URL for new integrations).*

---

## 3. Creating the Tweet

Once tokens are acquired and media is fully uploaded and processed, the final step is creating the post.

**Endpoint:** `POST https://api.twitter.com/2/tweets`
**Authentication:** OAuth 2.0 User Access Token (Bearer Token).

### Payload Constraints
- **Text:** Maximum 280 characters.
- **Media:** Must reference the `media_id_string` acquired from the upload process.

### Request Body (JSON)
```json
{
  "text": "Excited to share this new creation from Remix Studio! #AIart",
  "media": {
    "media_ids": ["1234567890123456789", "9876543210987654321"]
  }
}
```

### Execution Handling
- **Success:** The API returns the new Tweet's `id` and `text`. The `PostExecution` record in Remix Studio should be updated with this `id` as the `externalId`.
- **Rate Limits:** X strictly enforces rate limits (e.g., 50 tweets per 24 hours per user on the Free tier, or specific 15-minute window limits). The application must parse the `x-rate-limit-remaining` and `x-rate-limit-reset` headers. If a `429 Too Many Requests` is encountered, the `PostExecution.nextAttemptAt` must be set to the value of `x-rate-limit-reset` to orchestrate proper backoff.

*Reference:* [X Developer Docs: Manage Tweets](https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets)