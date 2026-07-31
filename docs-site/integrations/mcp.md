# MCP Support

Remix Studio exposes an **MCP server** at `/mcp` for authenticated, account-scoped automation. External MCP clients can work with libraries, prompts, storage summaries, album summaries, model discovery, direct workflow inputs, and workflow-backed project creation and updates.

The in-app [assistant](/concepts/assistant) uses the same shared tool registry, so chat orchestration and MCP automation stay aligned.

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

Clients can connect with either:

- **OAuth 2.0 authorization code flow**, with **PKCE** supported.
- A **personal access token (PAT)**.

Manage both under **Account → MCP** (the MCP Connections page, which also includes a Claude Code and Codex CLI setup guide).

OAuth metadata is available at:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

Related endpoints are `/register`, `/authorize`, and `/token`. All tools are user-scoped and use the `mcp:tools` OAuth scope.

## Client Configuration

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

Replace `http://localhost:3000` with your deployed origin.

## Inspecting the Server

During local development you can launch the MCP inspector against the running app:

```bash
npm run mcp:inspect
```

This connects to `http://localhost:3000/mcp` over HTTP transport.

## Tool Catalog

The full tool catalog is defined in `server/mcp/tool-definitions.ts` in the repository.
