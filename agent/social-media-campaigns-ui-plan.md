# Social Media Campaigns: User Interface & Experience Plan

## 1. Executive Summary

This document outlines the user interface (UI) and user experience (UX) specifications for the Social Media Campaigns feature in Remix Studio. The UI must cleanly bridge the gap between AI asset generation and external distribution. It is designed around three core principles:
1.  **Frictionless Drafting:** Permissive validation allows users to freely compose posts with mixed media without being blocked by platform-specific edge cases during the creative phase.
2.  **Transparent Asynchronous State:** Heavy media processing happens in the background. The UI must clearly communicate these pending states (e.g., "Compressing for X") without blocking user interaction.
3.  **Granular Observability:** Multi-channel fan-out means a post might succeed on X but fail on LinkedIn. The UI must present these branched execution states clearly and actionably.

---

## 2. Navigation & Routing Structure

The feature introduces new primary and secondary navigation paths within Remix Studio:

*   **`/campaigns` (Primary Nav):** The main dashboard listing all campaigns.
*   **`/campaigns/:id`:** The detail view for a specific campaign, managing its posts.
*   **`/settings/integrations` (Secondary Nav):** A new tab in the global settings modal/page dedicated to OAuth connections.

---

## 3. Settings: Social Integrations Panel

This interface handles the secure connection of external social accounts (e.g., X, LinkedIn).

### UI Components
*   **Integration Cards:** A grid or list of supported platforms. Each card displays the platform logo, current connection status, and the connected profile name/avatar.
*   **Connection Flow:** 
    *   Clicking "Connect [Platform]" redirects the user to the platform's OAuth consent screen.
    *   Upon returning to Remix Studio (via the `redirect_uri`), a toast notification confirms success or failure.
*   **Status Indicators:**
    *   🟢 **Active:** Token is valid and ready.
    *   🔴 **Disconnected/Expired:** The refresh token failed or the user revoked access natively. Prompts the user with a "Reconnect" button.
*   **Revocation:** A "Disconnect" action requires a confirmation modal and triggers the deletion of the `SocialAccount` record.

---

## 4. Campaigns Dashboard (`/campaigns`)

The hub for organizing social distribution efforts.

### UI Components
*   **Header:** Title ("Campaigns") and a prominent "Create Campaign" primary button.
*   **Campaign Grid/List:** Displays cards or rows for each `Campaign`.
*   **Campaign Card Anatomy:**
    *   **Title & Description:** Truncated if necessary.
    *   **Target Channels:** Small icons indicating which social accounts this campaign is linked to (e.g., X logo, LinkedIn logo).
    *   **Aggregated Metrics:** Quick stats such as "3 Drafts | 5 Scheduled | 12 Posted | 1 Failed".
    *   **Status Badge:** Active, Completed, or Archived.
*   **Creation Modal:** Triggered by "Create Campaign". Requires `name`, optional `description`, and a multi-select dropdown to choose target `SocialAccounts` for the campaign.

---

## 5. Campaign Detail View (`/campaigns/:id`)

This view manages the individual posts within a campaign. A Kanban-style board is recommended for visualizing the content pipeline, though a dense list view should also be available.

### Kanban Board Layout
*   **Columns by Status:**
    1.  **Drafts:** Ideas in progress, missing media, or not yet scheduled.
    2.  **Scheduled:** Posts with a future `scheduledAt` date, waiting for the `PostManager` to pick them up.
    3.  **Published:** Successfully executed posts.
    4.  **Failed:** Posts that encountered fatal errors during execution.
*   **Post Card Anatomy:**
    *   **Content Preview:** The first ~100 characters of the `textContent`.
    *   **Media Thumbnails:** Small, cropped previews of attached media (using the lightweight `thumbnailUrl` generated during async processing).
    *   **Execution Status Chips:** If the post is scheduled or published, it displays per-channel chips. E.g., a green "X" chip and a red "LinkedIn" chip if one failed.
    *   **Schedule Tag:** E.g., "Tomorrow, 10:00 AM".

---

## 6. The Post Composer (Drafting & Scheduling)

The most complex component of the UI. It must handle permissive drafting, media selection, and scheduling. It opens as a large modal or a dedicated full-screen route when clicking "Create Post" or editing an existing post.

### 6.1 Text Editing & Dynamic Limits
*   **Text Area:** A standard textarea for composing the post body.
*   **Character Counter:** Since a campaign might target multiple channels (e.g., X at 280 chars, LinkedIn at 3000 chars), the counter should visually warn the user based on the *most restrictive* connected channel. 
    *   *UX Note:* If the text exceeds 280 characters and X is a target, show a warning ("Will be truncated on X"), but **do not block** the save. This adheres to the "Permissive Save-Time Validation" philosophy.

### 6.2 Media Attachment & Asynchronous State
*   **"Add Media" Action:** Opens a specialized picker allowing the user to select assets from their Remix Studio Library or Albums.
*   **Permissive Constraints:** The picker allows selecting up to 4 items. It does not block mixing images and videos. 
*   **Async Processing Indicators:**
    *   When media is selected, a `PostMedia` record is created with `status: 'pending'`.
    *   The UI displays the media thumbnails with a visual overlay (e.g., a loading spinner and text like "Optimizing for Social...").
    *   A polling mechanism (via React Query/SWR) checks the `PostMedia` status. Once `ready`, the spinner disappears.
    *   *Constraint:* The "Schedule" button is disabled until all attached media is `ready`.

### 6.3 Scheduling & Timezones
*   **Date/Time Picker:** Allows the user to select when the post should go live.
*   **Timezone Handling:** The picker must default to the user's local browser timezone to prevent mental math errors. The selected time is converted to UTC before being sent to the API and saved in the database.
*   **Validation:** The selected time must be in the future (e.g., at least 5 minutes from `NOW()` to ensure the poller catches it reliably).

---

## 7. Granular Execution & Error Reporting

When a post attempts to publish, it fans out to multiple `PostExecution` records. The UI must surface this complexity clearly.

### Execution Status View
When viewing a Scheduled, Published, or Failed post, the UI displays a breakdown of the execution per channel.

*   **Success State:** 
    *   Displays a green checkmark next to the channel name.
    *   Provides a "View Post" external link utilizing the `externalUrl` (e.g., linking directly to the live Tweet).
*   **Transient/Pending State:**
    *   If a post hit a rate limit and is backing off, display an orange spinner: "X: Rate limited, retrying at 10:05 AM".
*   **Fatal Error State:**
    *   Displays a red warning icon.
    *   Surfaces the exact, human-readable `errorMsg` returned by the provider (e.g., "X: Media type unsupported", or "LinkedIn: Unauthorized - Please reconnect your account").
    *   Provides an actionable "Retry" button (which resets the specific `PostExecution` to `pending`) or a "Reconnect Account" link if it was an OAuth failure.

---

## 8. Mobile Responsiveness

*   **Integrations:** Cards must stack vertically on small screens.
*   **Campaign Detail:** The Kanban board should switch to a swipeable carousel of columns or a single unified list view sorted by status/date on mobile devices.
*   **Composer:** The media picker and text area must consume the full viewport on mobile to maximize drafting space.