# Calling MCP Tools over HTTP

Remix Studio's [MCP endpoint](/integrations/mcp) is plain HTTP. Any client that can POST JSON — `curl`, a shell script, a cron job, a language without an MCP SDK — can list and call the same tools an MCP-aware client uses, without any MCP library.

This page documents the wire protocol of the `/mcp` endpoint: what to send, what comes back, and how to drive the write-confirmation handshake by hand.

If your client already speaks MCP (Claude Desktop, Claude Code, the MCP Inspector, an SDK), use the [client configuration](/integrations/mcp#client-configuration-with-a-pat) instead — it does all of this for you.

## Endpoint Basics

| | |
| :--- | :--- |
| URL | `POST {APP_URL}/mcp` |
| Auth | `Authorization: Bearer <token>` — a PAT or an OAuth access token |
| Content type | `Content-Type: application/json` |
| Accept | `Accept: application/json, text/event-stream` — **both**, or the request is rejected |
| Body | A single [JSON-RPC 2.0](https://www.jsonrpc.org/specification) message |
| Response | An SSE frame (`text/event-stream`) carrying the JSON-RPC response |

Create a personal access token under **Assistant Settings → MCP**. The token is shown only once, carries the `mcp:tools` scope, and acts as the user it belongs to — treat it like a password and use HTTPS outside local development.

### No session, no handshake

The server runs the streamable HTTP transport in **stateless mode**: it builds a fresh server instance per request. That has two consequences for a hand-written client:

- There is no `Mcp-Session-Id`. The server never issues one, and you never send one back.
- You do **not** have to call `initialize` first. A bare `tools/list` or `tools/call` works on its own, and each request is independent.

You may still send `initialize` to negotiate a protocol version and read the server's capabilities; the response is a normal `initialize` result. It just isn't a prerequisite for anything.

The `MCP-Protocol-Version` header is optional. If you send it, it must be a version the server supports (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, `2024-10-07`) — anything else is a `400`.

### Reading the response

Responses are sent as Server-Sent Events, even for a single reply. One response looks like this on the wire:

```
event: message
data: {"result":{...},"jsonrpc":"2.0","id":1}

```

So the JSON-RPC payload is the part after `data: `. With `curl`, strip the framing before piping to `jq`:

```bash
curl -sN http://localhost:3000/mcp \
  -H "Authorization: Bearer $REMIX_MCP_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | sed -n 's/^data: //p' | jq .
```

`-N` disables curl's output buffering, which matters for the export tools that can hold the connection open for minutes.

::: tip Reuse a helper
Every example below uses the same headers. Define a shell function once:

```bash
mcp() {
  curl -sN "${REMIX_APP_URL:-http://localhost:3000}/mcp" \
    -H "Authorization: Bearer $REMIX_MCP_TOKEN" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "$1" | sed -n 's/^data: //p'
}
```
:::

## Discovering Tools

`tools/list` returns every tool with its JSON Schema, title, and read-only/destructive hints — the authoritative catalog for your deployment, more current than any table in these docs.

```bash
mcp '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[] | {name, title: .annotations.title, readOnly: .annotations.readOnlyHint}'
```

Note that write tools carry two extra properties in their schema, `confirmed` and `confirmationHash`, which the [confirmation protocol](#calling-a-write-tool) below uses.

## Calling a Read Tool

`tools/call` takes the tool name and an `arguments` object matching its schema:

```bash
mcp '{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list_libraries",
    "arguments": { "type": "text", "limit": 20 }
  }
}' | jq .
```

The result envelope is the same for every tool:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "…human-readable summary…" }],
    "structuredContent": { "libraries": [], "pagination": {} }
  }
}
```

Read `structuredContent` in code — it is the machine-readable form of the same data. `content[0].text` is the rendering meant for a model or a human.

A tool that fails its own validation still returns HTTP 200 with a `result`, flagged by `"isError": true`; the message is in `content[0].text`. A malformed request — bad JSON, unknown method — comes back as a JSON-RPC `error` instead.

### Two calls you will need often

`get_current_account` confirms which account a token resolves to — the quickest check that a new PAT works:

```bash
mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_current_account","arguments":{}}}' \
  | jq '.result.structuredContent'
```

Read tools return **storage keys**, not links. Turn them into temporary URLs with `get_file_urls`:

```bash
mcp '{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get_file_urls",
    "arguments": { "keys": ["uploads/…", "outputs/…"], "expires_in": 3600 }
  }
}' | jq '.result.structuredContent'
```

Keys the authenticated user does not own come back under `denied` with a reason rather than failing the whole call. See [file access](/integrations/mcp#file-access) for the rules.

## Calling a Write Tool

Write and destructive tools use an argument-bound, two-call confirmation protocol. Over HTTP you drive both calls yourself.

**Step 1 — preview.** Call the tool with your arguments and no `confirmed` flag. Nothing is mutated:

```bash
mcp '{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "create_library",
    "arguments": { "name": "Campaign Prompts", "type": "text" }
  }
}' | jq '.result.structuredContent'
```

```json
{
  "requiresConfirmation": true,
  "confirmationLevel": "write",
  "tool": { "name": "create_library", "title": "Create Library", "category": "write" },
  "summary": "Create a text library named \"Campaign Prompts\".",
  "normalizedArguments": { "name": "Campaign Prompts", "type": "text" },
  "confirmationHash": "3f9a…",
  "message": "Review this action with the user. To execute it, re-call create_library …"
}
```

**Step 2 — confirm.** Show `summary` to whoever is authorizing the action, then repeat the call with the **same** arguments plus `confirmed: true` and the `confirmationHash` from the preview:

```bash
mcp '{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "create_library",
    "arguments": {
      "name": "Campaign Prompts",
      "type": "text",
      "confirmed": true,
      "confirmationHash": "3f9a…"
    }
  }
}' | jq '.result.structuredContent'
```

The hash is a digest of the tool name plus the normalized arguments, so it is not a generic approval token:

- Change any argument between the two calls and the hash no longer matches — the call is refused and you need a fresh preview.
- A hash from one tool cannot confirm another.
- `confirmed: true` without a hash is refused.
- Both refusals arrive as `isError` results, not transport errors.

Caching a hash and replaying it later is exactly what the design prevents; ask for a new preview each time. For scripted, unattended writes this means your script must carry the preview's `summary` into whatever record or approval step your process uses — the server will not skip the step.

::: warning Confirmation is not a dry run
The preview does not validate ownership or run the tool's business logic. Arguments that pass the preview can still fail on the confirmed call — for example a `library_id` that belongs to another account.
:::

Long-running writes behave the same way. `export_project` and `export_project_album` hold the connection up to `wait_seconds` and then return either a `downloadUrl` or a `taskId` to poll with; polling with `task_id` is itself a confirmation-gated call. See [exports](/integrations/mcp#exports).

## Scripting Examples

### Python

```python
import json, urllib.request

APP_URL = "http://localhost:3000"
TOKEN = "YOUR_MCP_TOKEN"

def mcp(method, params=None, req_id=1):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}})
    req = urllib.request.Request(
        f"{APP_URL}/mcp",
        data=body.encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    with urllib.request.urlopen(req) as res:
        for line in res:                       # SSE frames
            line = line.decode().rstrip("\n")
            if line.startswith("data: "):
                return json.loads(line[6:])
    raise RuntimeError("no data frame in response")

def call_tool(name, arguments):
    payload = mcp("tools/call", {"name": name, "arguments": arguments}, req_id=2)
    result = payload["result"]
    if result.get("isError"):
        raise RuntimeError(result["content"][0]["text"])
    return result.get("structuredContent", result)

print(call_tool("list_libraries", {"type": "text", "limit": 10}))
```

### Node.js

```js
const APP_URL = process.env.REMIX_APP_URL ?? 'http://localhost:3000';
const TOKEN = process.env.REMIX_MCP_TOKEN;

async function mcp(method, params = {}, id = 1) {
  const res = await fetch(`${APP_URL}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const frames = await res.text();
  const line = frames.split('\n').find((l) => l.startsWith('data: '));
  if (!line) throw new Error('no data frame in response');
  return JSON.parse(line.slice(6));
}

async function callTool(name, args) {
  const { result, error } = await mcp('tools/call', { name, arguments: args }, 2);
  if (error) throw new Error(error.message);
  if (result.isError) throw new Error(result.content[0].text);
  return result.structuredContent ?? result;
}

console.log(await callTool('get_current_account', {}));
```

Both helpers read only the first `data:` frame, which is all a single request/response exchange produces. Keep the connection open (don't buffer the whole body with a short timeout) when calling the export tools.

## Errors

| Status | Cause | Fix |
| :--- | :--- | :--- |
| `401` | Missing, revoked, or expired bearer token. Body is `{"error":"Unauthorized"}` and a `WWW-Authenticate` header points at the OAuth metadata. | Issue a new PAT, or refresh the OAuth token. |
| `406` | `Accept` did not list **both** `application/json` and `text/event-stream`. | Send `Accept: application/json, text/event-stream`. |
| `415` | `Content-Type` was not `application/json`. | Set the header; `curl -d` alone sends a form content type. |
| `400` (`-32700`) | Body was not valid JSON, or not a valid JSON-RPC message. | Check quoting — shell heredocs beat inline quotes for large payloads. |
| `400` (`-32000`) | Unsupported `MCP-Protocol-Version` header. | Drop the header or send a supported version. |
| `405` | Method other than `GET`, `POST`, or `DELETE`. | Use `POST`. |
| `200` with `isError` | The tool ran and refused — bad arguments, missing ownership, a failed confirmation hash. | Read `content[0].text`. |

A `GET /mcp` opens a long-lived SSE stream for server-initiated messages and will appear to hang in a terminal; a hand-written client has no reason to use it. `DELETE` is a session teardown that stateless mode has nothing to tear down.

## Debugging

`npm run mcp:inspect` launches the MCP Inspector against `http://localhost:3000/mcp` — the fastest way to compare a hand-written request with what a real client sends, and to browse live tool schemas.

For source-level details, see `server/mcp/mcp-server.ts` (routing and auth) and `server/mcp/tool-confirmation.ts` (the confirmation hash).
