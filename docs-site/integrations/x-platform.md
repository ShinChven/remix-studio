# X (Twitter) Platform Setup

To use X (formerly Twitter) as a social channel in Remix Studio [campaigns](/concepts/campaigns), create an application on the **X Developer Console** and configure OAuth 2.0.

## 1. Access the X Developer Console

1. Go directly to the [X Developer Console](https://console.x.com/).
2. Sign in with your X account.
3. If you haven't used the developer platform before, you may need to complete a brief application and accept the latest terms of service (including Pay-Per-Use or Free tier options).

## 2. Locate or Create an Application

In the revamped X Developer Console, the "Project" hierarchy might be simplified or hidden depending on your account tier.

1. Look for **Apps** or **Applications** in the sidebar or main dashboard.
2. If you have an existing application, select it.
3. Otherwise, click **+ Create App** or **Add App**.
4. Give your app a name (e.g. "Remix Studio - Your Name"). This name is visible to you when you authorize the connection.

## 3. Configure User Authentication (OAuth 2.0)

This is the most critical step for Remix Studio to work correctly.

1. Within your App's settings, find the **User authentication settings** section.
2. Click **Set up** or **Edit**.
3. **App permissions**: Select **Read and write** (allows fetching your profile and posting tweets).
4. **Type of App**: Select **Web App, Automated App or Bot**.
5. **App Info**:
   - **Callback URI / Redirect URL**: `${YOUR_APP_URL}/api/social/twitter/callback`
     - Example (Local): `http://localhost:3000/api/social/twitter/callback`
     - Example (Production): `https://your-studio.com/api/social/twitter/callback`
   - **Website URL**: Your application's base URL (e.g. `https://your-studio.com`).
6. Click **Save**.

## 4. Get OAuth 2.0 Client ID and Secret

1. Navigate to the **Keys and tokens** tab (or the section providing OAuth 2.0 credentials).
2. Find the **OAuth 2.0 Client ID** and **Client Secret**.
3. The Client Secret is only shown once when generated — if you lose it, regenerate it.
4. Copy both values.

## 5. Configure Remix Studio

Add the credentials to your `.env` file:

```ini
# ======== X OAuth 2.0 (For Social Media Campaigns) ========
X_CLIENT_ID=your_client_id_here
X_CLIENT_SECRET=your_client_secret_here

# Ensure APP_URL matches the base of your registered Callback URI
APP_URL=http://localhost:3000
```

## Required Scopes

Remix Studio requires the following scopes to operate your campaigns:

- `tweet.read` — verify post status.
- `tweet.write` — publish new posts and media.
- `users.read` — display your account name and avatar.
- `media.write` — upload images, GIFs, and videos for your posts.
- `offline.access` — **required** to receive refresh tokens, so Remix Studio can post scheduled content even when you are not actively using the app.

## Troubleshooting

- **"Project not found"**: The new console focuses on individual **Apps**. As long as you have an App with OAuth 2.0 enabled, the "Project" grouping is secondary.
- **Redirect URI error**: Confirm `APP_URL` in `.env` matches the beginning of the Redirect URL in the X Console exactly (including `http` vs `https`).
- **Missing refresh token**: Ensure `offline.access` is enabled. If posts fail after a few hours, reconnect the account in Remix Studio settings.
