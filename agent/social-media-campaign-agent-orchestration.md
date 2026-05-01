# Agent Orchestration for Social Media Campaigns

## 1. Overview

This document outlines the plan to empower the built-in AI assistant and MCP tools to orchestrate social media campaigns. By providing the assistant with specialized tools, it can autonomously (under user confirmation) create campaigns, curate content from libraries and albums, draft posts, and manage schedules.

---

## 2. Updated Assistant Persona & System Prompt

The `ASSISTANT_SYSTEM_PROMPT` in `server/assistant/system-prompt.ts` will be updated to include:

- **New Capability:** "Manage social media campaigns, including creating campaigns, drafting posts, attaching media from libraries/albums, and scheduling content for publication."
- **New Vocabulary:**
    - **Campaign:** A collection of posts focused on a specific goal.
    - **Post:** A single social media update containing text and media.
    - **Social Account:** A connected platform profile (e.g., X/Twitter, LinkedIn).
- **Tool Use Heuristics:** "When creating posts, the assistant should first list available social accounts and content (libraries/albums) to provide context for the user's campaign goals."

---

## 3. New Assistant Tools (MCP Compatible)

The following tools will be added to `server/mcp/tool-definitions.ts`:

### Campaign Tools
- `create_campaign`: 
    - Input: `name` (string), `description` (string, optional), `socialAccountIds` (array of strings, optional).
    - Action: Creates a new campaign record and links it to the specified social accounts.
- `list_campaigns`:
    - Input: `status` (enum: active, archived, all), `page`, `limit`.
    - Action: Returns a list of campaigns, including post counts and linked social account IDs.
- `update_campaign`:
    - Input: `campaignId`, `name`, `description`, `status`, `socialAccountIds`.
    - Action: Updates campaign metadata and replaces the linked social accounts.

### Post Tools
- `create_post`:
    - Input: `campaignId`, `textContent` (string).
    - Action: Creates a draft post.
- `get_post`:
    - Input: `postId`.
    - Action: Returns full post details including text, status, attached media, and the status of any per-channel `executions` (if the post has been scheduled/published).
- `update_post`:
    - Input: `postId`, `textContent`, `scheduledAt`.
- `add_media_to_post`:
    - Input: `postId`, `sourceUrl` (from library or album item), `quality` (enum: raw, high, medium, low).
    - Action: Attaches media to a post and triggers the asynchronous processing queue.
- `schedule_post`:
    - Input: `postId`, `scheduledAt` (ISO date).
    - Action: Validates that media is processed and sets the post to `scheduled` status.

### Social Account Tools
- `list_social_accounts`:
    - Input: None.
    - Action: Lists the user's connected social profiles (channel, profile name, status).

---

## 4. Implementation Strategy

### A. Tool Registration
All new tools will be added to the `createAssistantToolDefinitions` function. This ensures they are immediately available to both the in-app assistant and any external MCP clients.

### B. Dependency Injection
The `ToolDependencies` interface in `server/mcp/tool-definitions.ts` will be expanded to include new repositories if necessary:
- `campaignRepository` (or use existing `repository` if expanded).
- `socialAccountRepository`.

### C. Write Action Gating
All new mutation tools (`create_campaign`, `create_post`, `add_media_to_post`, `schedule_post`) will be marked with `category: 'mutate'`. This automatically triggers the existing `AssistantRunner` confirmation logic, requiring the user to approve the agent's plan before any action is taken.

---

## 5. Example Orchestration Workflow

1. **User:** "I want to start a campaign for my new AI art collection. Find the best images from my 'Surreal Landscapes' library and draft 3 tweets for next week."
2. **Assistant:**
    - Calls `list_libraries` and `get_library_items` for 'Surreal Landscapes'.
    - Calls `list_social_accounts` to find the X (Twitter) connection.
    - Proposes a plan: "I'll create a campaign called 'Surreal Landscapes Launch', draft 3 posts with images X, Y, and Z, and schedule them for Monday, Wednesday, and Friday at 10 AM on X."
    - Calls `create_campaign`.
    - (User confirms)
    - Calls `create_post` (x3).
    - Calls `add_media_to_post` (x3).
    - Calls `schedule_post` (x3).
    - (User confirms each step or the session-approved toolset).

---

## 6. Security & Guardrails

- **Token Protection:** The assistant will *never* have access to raw OAuth tokens. It only interacts with the `SocialAccount` ID and the abstracted `ISocialChannel` methods.
- **Content Limits:** The assistant will be instructed (via system prompt) to respect channel-specific character and media limits (starting with X) discovered through the channel integration services.
- **Confirmation:** The existing `requiresConfirmation` pattern ensures no content is ever published or scheduled without explicit user oversight.
