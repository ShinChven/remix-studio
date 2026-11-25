import fs from 'fs';
import path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { S3Storage } from '../../storage/s3-storage';
import { isInternalStorageValue } from '../tool-definitions';

/**
 * MCP Apps (the `io.modelcontextprotocol/ui` extension): interactive views
 * that compliant hosts render in a sandboxed iframe next to a tool result.
 *
 * A tool opts in through `_meta.ui.resourceUri`; the host reads that `ui://`
 * resource (one self-contained HTML file built from `src/mcp-apps/`) and hands
 * the tool result to it. Hosts without the extension ignore the metadata and
 * keep showing the text result, so nothing changes for them.
 */

export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/** Result `_meta` key carrying presigned URLs for the storage keys in a result. */
export const MEDIA_URLS_META_KEY = 'remix-studio/mediaUrls';

const MEDIA_URL_TTL_SECONDS = 3600;
const MAX_MEDIA_URLS_PER_RESULT = 300;

interface McpAppView {
  /** Basename of the built file in dist/mcp-apps. */
  file: string;
  uri: string;
  title: string;
  description: string;
}

const VIEWS = {
  media: {
    file: 'media-grid',
    uri: 'ui://remix-studio/media-grid.html',
    title: 'Remix Studio media grid',
    description: 'Browses album and library items as a thumbnail grid with a full-size viewer.',
  },
  queue: {
    file: 'queue-monitor',
    uri: 'ui://remix-studio/queue-monitor.html',
    title: 'Remix Studio queue monitor',
    description: 'Shows generation queue totals and per-project or per-provider rows.',
  },
  post: {
    file: 'post-preview',
    uri: 'ui://remix-studio/post-preview.html',
    title: 'Remix Studio post preview',
    description: 'Previews a campaign post: its text, media, schedule and publishing status.',
  },
} satisfies Record<string, McpAppView>;

type StructuredResult = Record<string, any>;

interface McpAppTool {
  view: McpAppView;
  /** Storage keys in the result the view needs to display, signed into result `_meta`. */
  mediaKeys?: (result: StructuredResult) => (string | null | undefined)[];
}

const APP_TOOLS: Record<string, McpAppTool> = {
  get_album_items: {
    view: VIEWS.media,
    mediaKeys: (result) =>
      (result.items ?? []).flatMap((item: any) => [item.thumbnailKey, item.optimizedKey, item.storageKey]),
  },
  get_library_items: {
    view: VIEWS.media,
    mediaKeys: (result) =>
      result.libraryType === 'text'
        ? (result.items ?? []).map((item: any) => item.thumbnailUrl)
        : (result.items ?? []).flatMap((item: any) => [item.thumbnailUrl, item.storageKey]),
  },
  get_queue_status: {
    view: VIEWS.queue,
  },
  get_post: {
    view: VIEWS.post,
    mediaKeys: (result) =>
      (result.media ?? []).flatMap((media: any) => [media.thumbnailUrl, media.processedUrl, media.sourceUrl]),
  },
};

/** The `_meta` a tool is registered with, or undefined when it has no view. */
export function getMcpAppToolMeta(toolName: string): Record<string, unknown> | undefined {
  const tool = APP_TOOLS[toolName];
  if (!tool) return undefined;
  return {
    ui: { resourceUri: tool.view.uri },
    // Older hosts read the flat key from the extension's first drafts.
    'ui/resourceUri': tool.view.uri,
  };
}

/**
 * Presigned URLs for the storage keys a view displays. They ride in the result
 * `_meta`, which hosts pass to the view but keep out of the model's context, so
 * the text result the model reads stays the same. The keys come from the
 * handler's own result for the authenticated user, so they need no further
 * ownership check.
 */
export async function buildMcpAppResultMeta(
  toolName: string,
  structuredContent: StructuredResult | undefined,
  storage: S3Storage,
): Promise<Record<string, unknown> | undefined> {
  const extract = APP_TOOLS[toolName]?.mediaKeys;
  if (!extract || !structuredContent) return undefined;

  const keys = [
    ...new Set(
      extract(structuredContent).filter(
        (key): key is string => typeof key === 'string' && key.length > 0 && isInternalStorageValue(key),
      ),
    ),
  ].slice(0, MAX_MEDIA_URLS_PER_RESULT);
  if (keys.length === 0) return undefined;

  const entries = await Promise.all(
    keys.map(async (key) => {
      try {
        return [key, await storage.getPresignedUrl(key, MEDIA_URL_TTL_SECONDS)] as const;
      } catch {
        return null;
      }
    }),
  );
  return {
    [MEDIA_URLS_META_KEY]: Object.fromEntries(entries.filter((entry) => entry !== null)),
  };
}

const htmlCache = new Map<string, string>();

function readViewHtml(view: McpAppView): string {
  const cached = htmlCache.get(view.file);
  if (cached) return cached;

  const file = path.join(process.cwd(), 'dist', 'mcp-apps', `${view.file}.html`);
  if (!fs.existsSync(file)) {
    // Dev servers run before any build: say how to produce the file rather
    // than failing the resource read.
    return `<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">The ${view.title} view has not been built. Run <code>npm run build:mcp-apps</code>.</p>`;
  }
  const html = fs.readFileSync(file, 'utf-8');
  if (process.env.NODE_ENV === 'production') htmlCache.set(view.file, html);
  return html;
}

/**
 * Origin the presigned media URLs are served from. It is read off a signed
 * URL rather than the config, so a virtual-hosted AWS bucket, a path-style
 * MinIO endpoint and an R2 custom domain all come out right.
 */
async function storageOrigin(storage: S3Storage): Promise<string | undefined> {
  try {
    return new URL(await storage.getPresignedUrl('mcp-apps/origin-probe', 60)).origin;
  } catch {
    return undefined;
  }
}

export function registerMcpAppResources(server: McpServer, storage: S3Storage) {
  for (const view of Object.values(VIEWS)) {
    server.registerResource(
      view.title,
      view.uri,
      { title: view.title, description: view.description, mimeType: MCP_APP_MIME_TYPE },
      async () => {
        const origin = await storageOrigin(storage);
        return {
          contents: [
            {
              uri: view.uri,
              mimeType: MCP_APP_MIME_TYPE,
              text: readViewHtml(view),
              _meta: {
                ui: {
                  csp: { resourceDomains: origin ? [origin] : [] },
                  prefersBorder: true,
                },
              },
            },
          ],
        };
      },
    );
  }
}
