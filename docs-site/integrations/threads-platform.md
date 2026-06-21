# Threads (Meta) Platform Setup

To use Threads as a social channel in Remix Studio [campaigns](/concepts/campaigns), create a **Meta app with the Threads use case** and configure OAuth.

::: warning Use Threads-specific credentials
The Threads App ID/Secret are **not** the same as a generic Meta/Facebook app's App ID/Secret. Confirm you are copying the values from the **Threads use case**, not Facebook Login.
:::

## 1. Create a Meta App with the Threads Use Case

1. Go to the [Meta for Developers](https://developers.facebook.com/) dashboard and sign in.
2. Click **Create App**.
3. When prompted for a use case, choose **Access the Threads API** (the Threads use case).
4. Finish creating the app.

## 2. Configure the Threads Use Case

1. Open your app, then go to the **Threads** use case (or **Use cases → Threads → Customize**).
2. Under **Settings**, add the **Redirect Callback URL**:
   - `${APP_URL}/api/social/threads/callback`
   - Example (Local): `http://localhost:3000/api/social/threads/callback`
   - Example (Production): `https://your-studio.com/api/social/threads/callback`
3. Add your account as a Threads **tester** and accept the tester invite from your Threads app settings, so you can authorize while the app is in development mode.

### Uninstall & Delete Callback URLs

The same settings screen also shows an **Uninstall Callback URL** and a **Delete Callback URL**. These are **not** part of the login flow (only the Redirect Callback URL is needed to connect), but Meta requires both fields. Remix Studio ships endpoints for them:

- **Uninstall Callback URL**: `${APP_URL}/api/social/threads/deauthorize`
- **Delete Callback URL**: `${APP_URL}/api/social/threads/data-deletion`

Examples (production): `https://your-studio.com/api/social/threads/deauthorize` and `https://your-studio.com/api/social/threads/data-deletion`.

How they work:

- Meta `POST`s a signed `signed_request` to each. The endpoints verify the signature with `THREADS_APP_SECRET`, read the `user_id`, and **delete that Threads account and its stored tokens** from Remix Studio.
- The data-deletion endpoint additionally returns the JSON Meta requires (`{ url, confirmation_code }`) pointing at a status page.

::: tip
These endpoints are **public** (Meta calls them server-to-server, with no user login), so they must be reachable on your public `APP_URL` — `localhost` will not work for the live callbacks. While developing in dev mode you can paste your production URLs here; Meta only invokes them on real uninstall/deletion events. Users can also revoke access anytime by disconnecting the channel in **Campaigns → Channels**.
:::

## 3. Request Permissions (Scopes)

Add the permissions Remix Studio needs for the MVP:

- `threads_basic` — read your profile (account id, name, avatar). **Required.**
- `threads_content_publish` — create and publish posts. **Required.**

Optional permissions you may add later as features are introduced (not required today): `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`, `threads_manage_mentions`, `threads_keyword_search`, `threads_location_tagging`, `threads_delete`.

## 4. Get the Threads App ID and Secret

1. In the Threads use case settings, locate the **Threads App ID** and **Threads App Secret**.
2. Copy both values. The secret is sensitive — store it securely.

## 5. Configure Remix Studio

Add the credentials to your `.env` file:

```ini
# ======== Threads (Meta) OAuth (For Social Media Campaigns) ========
THREADS_APP_ID=your_threads_app_id_here
THREADS_APP_SECRET=your_threads_app_secret_here

# Ensure APP_URL matches the base of your registered Redirect Callback URL
APP_URL=http://localhost:3000
```

## How Tokens Work

- On connect, Remix Studio exchanges the authorization code for a short-lived token and immediately upgrades it to a **long-lived token** (~60 days).
- The scheduler proactively re-exchanges the long-lived token before it expires, so scheduled posts keep working without you reconnecting.

## Media Requirements

Threads publishes images and videos by fetching them from a **public URL** that Meta cURLs server-side. Remix Studio supplies time-limited presigned URLs from your configured [S3-compatible storage](/concepts/storage).

- Your storage's public endpoint (`S3_PUBLIC_ENDPOINT` / custom domain) must be reachable from the public internet, or Meta cannot fetch the media and publishing will fail.
- Supported post shapes: text-only, single image, single video, and carousels of **2 to 20** image/video items.

## Troubleshooting

- **Redirect URI error**: Ensure `APP_URL` in `.env` exactly matches the start of the Redirect Callback URL (including `http` vs `https`).
- **Media fails to publish**: Confirm the storage public endpoint is internet-reachable and that presigned URLs resolve from outside your network.
- **Authorization fails in development**: Confirm your account is added as a Threads tester and that you accepted the tester invite.
