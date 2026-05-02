# Memory Monitoring

Remix Studio exposes a lightweight memory snapshot endpoint and emits a periodic memory log line so you can tell whether high container RSS is a real JavaScript leak or just native (Sharp / ffmpeg / Buffer) growth.

## What you get

### 1. HTTP endpoint

```
GET /api/internal/memory
```

Returns the current `process.memoryUsage()` snapshot in MB:

```json
{
  "rss": 420.3,
  "heapUsed": 180.1,
  "heapTotal": 210.5,
  "external": 85.2,
  "arrayBuffers": 12.4,
  "uptimeSec": 3724,
  "unit": "MB"
}
```

The endpoint is unauthenticated (same posture as `/healthz` and `/readyz`). It only exposes memory counters — no secrets, no user data. If your server is reachable from the public internet, restrict `/api/internal/*` at your reverse proxy.

### 2. Periodic log line

Every 30 seconds the server prints:

```
[mem] rss=420.3MB heap=180.1/210.5MB ext=85.2MB
```

- `rss` — what the OS / container metrics see (the number on your dashboards)
- `heap` — V8 used / total
- `ext` — native memory tied to V8 objects (Buffers, Sharp pipelines, etc.)

## Common usage

One-off check:

```bash
curl -s localhost:3000/api/internal/memory | jq
```

Live trend in a terminal:

```bash
watch -n 2 'curl -s localhost:3000/api/internal/memory | jq'
```

Historical view from container logs:

```bash
docker logs -f <container> | grep '\[mem\]'
```

## How to interpret

| Pattern | Likely cause |
|---|---|
| `rss` rises, `heap` stays flat, `ext` rises with `rss` | Native growth — Sharp / ffmpeg / large Buffers. Not a JS leak; V8 also doesn't return RSS to the OS quickly. |
| `heap` rises monotonically and never drops after GC | Real JS leak. Take a heap snapshot via `node --inspect` and Chrome DevTools. |
| Both spike during media jobs, then settle | Normal concurrent media processing peak. |
| `rss` stuck high long after activity ended | Expected V8 behaviour — memory pages are reused on the next spike. |

## When to take a heap snapshot

If `heap` keeps growing across hours with no plateau:

```bash
# Start the server with the inspector enabled
node --inspect dist-server/server.js
# Then open chrome://inspect in Chrome -> Memory -> Heap snapshot
```

Or programmatically dump from inside the process:

```ts
import v8 from 'v8';
v8.writeHeapSnapshot('/tmp/heap.heapsnapshot');
```

Copy the file out of the container and load it in Chrome DevTools' Memory tab.
