/**
 * Reads the Web Share Target payload the service worker stashed in Cache Storage, and explains
 * a share that arrived empty. Shared by the share page of the new UI.
 */
const SHARE_CACHE = 'remix-studio-share-v1';
const SHARE_PREFIX = '/__share-cache/';
const META_KEY = `${SHARE_PREFIX}meta.json`;

// A share lands here within a second of being sent. Anything older is left
// over from a session that never finished, and is cleared rather than shown.
const SHARE_MAX_AGE_MS = 15 * 60 * 1000;

type FileMeta = {
  key: string;
  name: string;
  type: string;
  size?: number;
};

type ShareDiagnostics = {
  fieldNames?: string[];
  fileCount?: number;
  unreadableFiles?: number;
  contentType?: string;
  method?: string;
  parseError?: string;
  /** Bytes in the request body, or -1 when it was never read. */
  bodyBytes?: number;
  /** Set when the platform parser found nothing and the body was parsed by hand. */
  recoveredBy?: string;
};

type ShareMeta = {
  text: string;
  title: string;
  url: string;
  extras?: string[];
  files: FileMeta[];
  diagnostics?: ShareDiagnostics;
  receivedAt?: number;
};

type SharedImage = {
  name: string;
  type: string;
  blob: Blob;
  objectUrl: string;
};

export type LoadedShare = {
  text: string;
  title: string;
  url: string;
  images: SharedImage[];
  diagnostics: ShareDiagnostics;
  /** Files the worker recorded that were no longer readable from the cache. */
  missingFiles: number;
};

const IMAGE_TYPE_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jpe: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

/**
 * Android hands over gallery photos with an empty or generic MIME type often
 * enough to matter: a blob typed application/octet-stream neither renders in
 * an <img> nor survives the hand-off to /import as a usable data URL, so the
 * name decides the type when the platform would not.
 */
function resolveImageType(declared: string, name: string): string {
  const type = (declared || '').toLowerCase();
  if (type.startsWith('image/')) return type;
  const match = /\.([a-z0-9]+)$/i.exec(name || '');
  const guessed = match ? IMAGE_TYPE_BY_EXTENSION[match[1].toLowerCase()] : '';
  return guessed || type || 'application/octet-stream';
}

async function openShareCache(): Promise<Cache | null> {
  if (!('caches' in window)) return null;
  try {
    return await caches.open(SHARE_CACHE);
  } catch {
    return null;
  }
}

/**
 * Reads the payload the service worker stashed. Nothing is deleted here: the
 * page can mount more than once for a single share (a remount while auth
 * resolves, React's double-invoked effects in development, a pull-to-refresh),
 * and a read that consumed the payload left the second pass rendering an empty
 * preview. The cache is cleared once the share has actually been acted on.
 */
export async function loadShare(): Promise<LoadedShare | null> {
  const cache = await openShareCache();
  if (!cache) return null;

  const metaRes = await cache.match(META_KEY);
  if (!metaRes) return null;

  const meta = (await metaRes.json()) as ShareMeta;

  if (meta.receivedAt && Date.now() - meta.receivedAt > SHARE_MAX_AGE_MS) {
    await clearShare();
    return null;
  }

  const images: SharedImage[] = [];
  let missingFiles = 0;
  for (const file of meta.files || []) {
    const fileRes = await cache.match(`${SHARE_PREFIX}${file.key}`);
    if (!fileRes) {
      missingFiles += 1;
      continue;
    }
    const raw = await fileRes.blob();
    const type = resolveImageType(file.type || raw.type, file.name || '');
    const blob = type === raw.type ? raw : new Blob([raw], { type });
    images.push({
      name: file.name || '',
      type,
      blob,
      objectUrl: URL.createObjectURL(blob),
    });
  }

  const textParts = [meta.text, ...(meta.extras || [])].filter(Boolean);

  return {
    text: textParts.join('\n').trim(),
    title: meta.title || '',
    url: meta.url || '',
    images,
    diagnostics: meta.diagnostics || {},
    missingFiles,
  };
}

export async function clearShare(): Promise<void> {
  const cache = await openShareCache();
  if (!cache) return;
  try {
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => cache.delete(req)));
  } catch {
    // A share that outlives its cache entry is harmless; it ages out.
  }
}

export function describeDiagnostics(share: LoadedShare): string {
  const { unreadableFiles, fieldNames, method, contentType, parseError } = share.diagnostics;
  if (share.missingFiles > 0) {
    return `The shared ${share.missingFiles === 1 ? 'file' : 'files'} could not be read back from storage. Sharing again usually works.`;
  }
  if (unreadableFiles) {
    return `The other app offered ${unreadableFiles === 1 ? 'a file' : `${unreadableFiles} files`} that the browser could not open. Try sharing from the gallery, or save the image first and share the saved copy.`;
  }
  if (fieldNames && fieldNames.length > 0) {
    return `The share arrived with no content in it (fields received: ${fieldNames.join(', ')}).`;
  }
  // Nothing at all came through, and the body was read back to be sure of it:
  // an empty body is the sending app's doing, while a body with bytes in it
  // that still parses to nothing is ours. Saying which is which is the only
  // thing that makes the next report of this actionable.
  const { bodyBytes } = share.diagnostics;
  if (bodyBytes === 0) {
    return 'The other app started a share but sent no content with it. Try sharing from the gallery rather than the preview, or save the image first and share the saved copy.';
  }
  const seen = [
    method ? `method ${method}` : '',
    typeof bodyBytes === 'number' && bodyBytes > 0 ? `${bodyBytes} bytes` : '',
    contentType ? `content type ${contentType}` : '',
    parseError ? `parse error: ${parseError}` : '',
  ].filter(Boolean);
  return seen.length > 0
    ? `The share arrived with nothing in it (${seen.join(', ')}). Try sharing again.`
    : 'The share arrived with nothing in it.';
}

