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
- **Create and update** workflow-backed projects.

Write and destructive tools are **confirmation-gated**. Prompt deletion is scoped to one item in a text library and requires an explicit confirmed tool call.

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
