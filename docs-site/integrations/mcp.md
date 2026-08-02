# MCP Support

Remix Studio exposes a streamable HTTP **Model Context Protocol (MCP)** endpoint at `/mcp`. It lets an external client work with the same user-scoped libraries, projects, models, storage summaries, campaigns, and posts used by the web interface.

The [in-app assistant](/concepts/assistant) is built on the same tool registry, but authentication and write confirmation differ.

## Capabilities

Available MCP capabilities include:

- Create [libraries](/concepts/libraries) and create text prompts, including **batch prompt creation**.
- **Search** library items across libraries, or browse a single library with pagination and tag filters.
- **Update** a single text prompt's content, title, or tags with `update_prompt`.
- **Delete** a single text prompt from a text library with `delete_prompt`.
- **Inspect** storage usage, albums, libraries, library items, and usable model/provider pairings.
- **Browse** the items inside a project album with `get_album_items`, including each item's prompt, format, aspect ratio, size, and storage keys.
- **Download** stored files with `get_file_urls`, which converts internal storage keys into temporary presigned URLs (optionally as save-as download links).
- **Create and update** workflow-backed projects.

Write and destructive tools are **confirmation-gated**. Prompt deletion is scoped to one item in a text library and requires an explicit confirmed tool call.

### File access

Read tools return **storage keys**, not links. To fetch, view, or download a file, pass those keys to `get_file_urls`:

- Accepts up to 50 keys per call, with `expires_in` between 60 and 86400 seconds (default 1 hour) and `download: true` for an attachment (save-as) URL.
- Signs a key only when it is still referenced by media the authenticated user owns — library items, album items, job outputs, or campaign post media. Everything else is returned under `denied` with a reason, and values that are already absolute URLs are rejected as needing no signing.
- Returned URLs are temporary; request new ones rather than reusing expired links. When the deployment sets `S3_PUBLIC_CUSTOM_DOMAIN`, storage returns a direct public URL instead of a signed one.

## Authentication

MCP requests require a bearer token obtained through either:

- **OAuth 2.0 authorization code flow**, with PKCE support and refresh tokens.
- A **personal access token (PAT)** created in Remix Studio.

Manage connections under **Assistant Settings → MCP**. PATs are shown only when created, are stored as hashes, can have an expiry, and can be revoked. All MCP tools use the `mcp:tools` scope and enforce the authenticated user's ownership in their handlers.

OAuth discovery metadata is available at:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

The related endpoints are `/register`, `/authorize`, and `/token`. Dynamically registered clients are tied to the account that created them. The server rotates OAuth refresh tokens and detects reuse outside its recovery grace window.

## Client Configuration with a PAT

```json
{
  "mcpServers": {
    "remix-studio": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Replace the origin with the public `APP_URL` of your deployment. Use HTTPS outside local development because the token grants access to your Remix Studio data.

## Tool Catalog

The exact schemas are returned by MCP tool discovery. At the current source version, the catalog is:

| Area | Read tools | Write/destructive tools |
| :--- | :--- | :--- |
| Libraries | `list_libraries`, `get_library_items`, `search_library_items` | `create_library`, `update_library`, `create_prompt`, `batch_create_prompts`, `update_prompt`, `update_library_item`, `batch_update_library_items`, `delete_prompt` |
| Projects | `get_project`, `list_albums`, `get_album_items`, `list_available_models`, `get_storage_usage` | `create_project_with_workflow`, `update_project` |
| Files | `get_file_urls` | — |
| Campaigns | `list_social_accounts`, `list_campaigns` | `create_campaign`, `update_campaign` |
| Posts | `get_post`, `get_post_text` | `create_post`, `update_post`, `update_post_text`, `add_media_to_post`, `schedule_post` |

Important boundaries:

- Prompt creation/deletion is for **text libraries**.
- `update_library_item` can update text content only for a text library; batch updates change titles/tags only and accept at most 100 items.
- `update_project` replaces the entire workflow when `workflowItems` is supplied. Call `get_project` immediately beforehand and carry forward every step that should remain.
- Media added to a post must be an internal storage key already owned by the authenticated user and valid for that campaign.
- Scheduling requires a valid time, an active channel on the campaign, and ready media.

## Write Confirmation Protocol

External MCP writes use an argument-bound two-call protocol:

1. Call the tool with the desired arguments and without `confirmed: true`.
2. The server returns a preview containing a summary, normalized arguments, and `confirmationHash`; no mutation has occurred.
3. Show that exact action to the user.
4. If approved, call the same tool again with the same arguments plus `confirmed: true` and the returned `confirmationHash`.

The hash binds approval to the tool name and normalized arguments. If any argument changes, the hash is rejected and a new preview is required.

Read-only tools do not need this protocol. External clients cannot use the in-app assistant's per-conversation approved-tools list.

## Workflow Update Safety

Project workflow updates are replacement operations, not patches to one step. A safe client sequence is:

1. Call `get_project`.
2. Start from the newly returned `workflowItems`.
3. Apply the requested edit while preserving order, selected tags, and disabled state.
4. Preview `update_project`.
5. Confirm the exact replacement.

This prevents a long-running conversation from silently dropping workflow edits made elsewhere.

## Inspecting the Server

During local development:

```bash
npm run mcp:inspect
```

The script launches the MCP Inspector against `http://localhost:3000/mcp`. Sign in or provide a token as required by the inspector.

For source-level details, see `server/mcp/tool-definitions.ts` and `server/mcp/tool-confirmation.ts`.
