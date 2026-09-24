const SHARE_CACHE = 'remix-studio-share-v1';
const SHARE_PREFIX = '/__share-cache/';
const META_KEY = `${SHARE_PREFIX}meta.json`;

// The manifest names these three fields, so they keep their meaning. Anything
// else a share posts is still kept: an Android WebAPK installed against an
// older manifest, or a sharing app that picks its own field name, would
// otherwise hand us a payload that silently reads as empty.
const NAMED_TEXT_FIELDS = ['text', 'title', 'url'];

// How long a stored share counts as belonging to the launch in progress. The
// repeat passes of one share land within seconds of each other; anything older
// is a previous share and must not be resurrected in place of an empty one.
const SAME_LAUNCH_WINDOW_MS = 2 * 60 * 1000;

const IMAGE_TYPE_BY_EXTENSION = {
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

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname !== '/share-target') return;
  if (event.request.method === 'POST') {
    event.respondWith(handleShare(event.request));
  } else if (event.request.method === 'GET') {
    // A share target declared as GET (or a WebAPK still holding an older
    // manifest) arrives with the payload in the query string.
    event.respondWith(handleShareGet(url));
  }
});

function isFileLike(value) {
  return value && typeof value !== 'string' && typeof value.arrayBuffer === 'function';
}

// Android hands over gallery photos with an empty or generic MIME type often
// enough that the preview and everything downstream has to guess from the
// name; a blob typed application/octet-stream will not render in an <img>.
function resolveFileType(file) {
  const declared = (file.type || '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const match = /\.([a-z0-9]+)$/i.exec(file.name || '');
  const guessed = match ? IMAGE_TYPE_BY_EXTENSION[match[1].toLowerCase()] : '';
  return guessed || declared || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Manual multipart parsing
//
// Chrome on Android can hand the worker a share whose body is a well-formed
// multipart POST — the right content type, Blink's own boundary — that
// request.formData() then resolves to a FormData with no entries at all. No
// error is raised; the parse simply yields nothing, and the share reads as
// empty when the image is sitting right there in the body.
//
// So when the platform parser comes back with nothing, the bytes are parsed
// here instead. This is the only path that touches the raw body, and it only
// runs on that failure, so the usual share still costs one parse.
// ---------------------------------------------------------------------------

function boundaryOf(contentType) {
  const match = /;\s*boundary=(?:"([^"]*)"|([^;]*))/i.exec(contentType || '');
  if (!match) return '';
  return (match[1] || match[2] || '').trim();
}

function indexOfBytes(haystack, needle, from) {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function encodeAscii(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

// name="x"; filename="y" — quoted, with backslash escapes, or bare.
function dispositionValue(disposition, key) {
  const quoted = new RegExp(`;\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(disposition);
  if (quoted) return quoted[1].replace(/\\(.)/g, '$1');
  const bare = new RegExp(`;\\s*${key}\\s*=\\s*([^;]*)`, 'i').exec(disposition);
  return bare ? bare[1].trim() : null;
}

function parseMultipart(bytes, contentType) {
  const boundary = boundaryOf(contentType);
  if (!boundary || !bytes.length) return [];

  const delimiter = encodeAscii(`--${boundary}`);
  const entries = [];
  const decoder = new TextDecoder();

  let cursor = indexOfBytes(bytes, delimiter, 0);
  if (cursor < 0) return [];
  cursor += delimiter.length;

  while (cursor < bytes.length) {
    // "--" straight after a delimiter closes the body.
    if (bytes[cursor] === 0x2d && bytes[cursor + 1] === 0x2d) break;
    if (bytes[cursor] === 0x0d && bytes[cursor + 1] === 0x0a) cursor += 2;

    const next = indexOfBytes(bytes, delimiter, cursor);
    const partEnd = next < 0 ? bytes.length : next;

    const headerEnd = indexOfBytes(bytes.subarray(0, partEnd), encodeAscii('\r\n\r\n'), cursor);
    if (headerEnd < 0) break;

    const headers = decoder.decode(bytes.subarray(cursor, headerEnd));
    // The part's own trailing CRLF belongs to the delimiter, not the content.
    let contentEnd = partEnd;
    if (next >= 0 && contentEnd >= 2 && bytes[contentEnd - 2] === 0x0d && bytes[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    }
    const content = bytes.slice(headerEnd + 4, contentEnd);

    const disposition = /^content-disposition:\s*(.*)$/im.exec(headers);
    const partType = /^content-type:\s*(.*)$/im.exec(headers);
    if (disposition) {
      const name = dispositionValue(disposition[1], 'name');
      const filename = dispositionValue(disposition[1], 'filename');
      if (name !== null) {
        if (filename !== null) {
          const type = partType ? partType[1].trim() : '';
          entries.push([name, new File([content], filename, { type })]);
        } else {
          entries.push([name, decoder.decode(content)]);
        }
      }
    }

    if (next < 0) break;
    cursor = next + delimiter.length;
  }

  return entries;
}

// Reads whatever the platform posted without assuming the field names, and
// reports what it saw so the landing page can explain an empty share instead
// of rendering a blank preview.
async function readSharedPayload(request) {
  const contentType = request.headers.get('content-type') || '';
  const fields = {};
  const fieldNames = [];
  const files = [];
  let unreadableFiles = 0;
  let parseError = '';
  let bodyBytes = -1;
  let recoveredBy = '';

  // Cloned before the body is touched: once formData() has started reading,
  // the body is disturbed and clone() throws, which used to turn a recoverable
  // parse failure into a lost share.
  let fallback = null;
  try {
    fallback = request.clone();
  } catch {
    fallback = null;
  }

  let entries = [];
  try {
    const formData = await request.formData();
    entries = Array.from(formData.entries());
  } catch (e) {
    parseError = String((e && e.message) || e || 'form parse failed');
  }

  // The platform parser found nothing, either by failing or by resolving empty.
  // The body itself is the authority on whether the share carried anything, so
  // it is read and parsed here before the share is written off as empty.
  if (entries.length === 0 && fallback) {
    try {
      const raw = new Uint8Array(await fallback.arrayBuffer());
      bodyBytes = raw.length;
      if (raw.length > 0) {
        if (/multipart\/form-data/i.test(contentType)) {
          entries = parseMultipart(raw, contentType);
          if (entries.length > 0) recoveredBy = 'multipart';
        } else {
          const body = new TextDecoder().decode(raw);
          try {
            entries = Array.from(new URLSearchParams(body).entries());
          } catch {
            entries = [['text', body]];
          }
          if (entries.length > 0) recoveredBy = 'raw-body';
        }
      }
    } catch (e) {
      if (!parseError) parseError = String((e && e.message) || e || 'body read failed');
    }
  }

  for (const [name, value] of entries) {
    fieldNames.push(name);
    if (isFileLike(value)) {
      if (value.size > 0) {
        files.push({ field: name, file: value });
      } else if (value.name) {
        // The sharing app handed over a file the browser could not read.
        unreadableFiles += 1;
      }
      continue;
    }
    const text = String(value == null ? '' : value).trim();
    if (text && !fields[name]) fields[name] = text;
  }

  return buildMeta({
    fields,
    fieldNames,
    files,
    unreadableFiles,
    contentType,
    method: request.method,
    parseError,
    bodyBytes,
    recoveredBy,
  });
}

function buildMeta({ fields, fieldNames, files, unreadableFiles, contentType, method, parseError, bodyBytes, recoveredBy }) {
  const text = fields.text || '';
  const title = fields.title || '';
  const url = fields.url || '';

  // Anything posted under a name the manifest does not list still carries the
  // shared content when the sender disagrees with us about field names.
  const extras = Object.keys(fields)
    .filter((name) => !NAMED_TEXT_FIELDS.includes(name))
    .map((name) => fields[name]);

  return {
    meta: {
      text: text || (title || url ? '' : extras.join('\n')),
      title,
      url,
      extras,
      files: [],
      diagnostics: {
        fieldNames,
        fileCount: files.length,
        unreadableFiles,
        contentType,
        method: method || '',
        parseError: parseError || '',
        bodyBytes: typeof bodyBytes === 'number' ? bodyBytes : -1,
        recoveredBy: recoveredBy || '',
      },
      receivedAt: Date.now(),
    },
    files,
  };
}

function payloadHasContent(payload) {
  if (!payload) return false;
  if (payload.files.length > 0) return true;
  const { text, title, url, extras } = payload.meta;
  return Boolean(text || title || url || (extras && extras.length > 0));
}

function metaHasContent(meta) {
  if (!meta) return false;
  if (Array.isArray(meta.files) && meta.files.length > 0) return true;
  return Boolean(meta.text || meta.title || meta.url || (meta.extras && meta.extras.length > 0));
}

function isFromSameLaunch(meta) {
  if (!meta || !meta.receivedAt) return false;
  return Date.now() - meta.receivedAt < SAME_LAUNCH_WINDOW_MS;
}

async function readStoredMeta(cache) {
  try {
    const res = await cache.match(META_KEY);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let writeQueue = Promise.resolve();

/**
 * Stores a share, but never lets an empty one destroy a good one.
 *
 * A single Android share can reach the worker more than once: the navigation
 * is restarted when a new worker takes over mid-flight, the worker is killed
 * while a multi-megabyte photo is still being parsed, or the launch arrives as
 * a payload-less GET. The repeat carries no body, parses to nothing, and used
 * to wipe the cache and write an empty record over the image that the first
 * pass had just stored — which is what the landing page then reported as a
 * share with nothing in it.
 *
 * Those passes can also overlap, and the write is not atomic: it clears the
 * cache, puts the files, then puts the meta. Interleaved, one pass deletes the
 * files the other has just stored, so writes are serialized and each one sees
 * a settled cache.
 */
function writeShare(payload) {
  const run = writeQueue.then(() => writeShareNow(payload), () => writeShareNow(payload));
  writeQueue = run.catch(() => {});
  return run;
}

async function writeShareNow(payload) {
  const cache = await caches.open(SHARE_CACHE);

  if (!payloadHasContent(payload)) {
    const stored = await readStoredMeta(cache);
    // Keep a usable share from this same launch rather than replacing it with
    // this blank one. An older share is not protected: it is stale, and the
    // landing page should report the empty arrival instead of showing it.
    if (metaHasContent(stored) && isFromSameLaunch(stored)) return;
  }

  // Clear the previous share only once this one has been parsed, so a failed
  // parse never destroys what is already there.
  const existing = await cache.keys();
  await Promise.all(existing.map((req) => cache.delete(req)));

  const fileMeta = [];
  for (let i = 0; i < payload.files.length; i++) {
    const { file } = payload.files[i];
    const key = `share-file-${Date.now()}-${i}`;
    const type = resolveFileType(file);
    const response = new Response(file, {
      headers: { 'Content-Type': type },
    });
    await cache.put(`${SHARE_PREFIX}${key}`, response);
    fileMeta.push({
      key,
      name: file.name || '',
      type,
      size: file.size,
    });
  }

  const meta = { ...payload.meta, files: fileMeta };
  await cache.put(
    META_KEY,
    new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function shareLanding(query) {
  return Response.redirect(new URL(`/share${query || ''}`, self.location.origin).href, 303);
}

async function handleShare(request) {
  try {
    const payload = await readSharedPayload(request);
    await writeShare(payload);
    return shareLanding();
  } catch (e) {
    // A share already stored by an earlier pass of this same launch is worth
    // more than the error from this one.
    try {
      const cache = await caches.open(SHARE_CACHE);
      const stored = await readStoredMeta(cache);
      if (metaHasContent(stored) && isFromSameLaunch(stored)) return shareLanding();
    } catch {
      // Fall through to the error landing.
    }
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return shareLanding(`?error=${message}`);
  }
}

async function handleShareGet(url) {
  try {
    // A GET with nothing in the query is not a share: it is the launch being
    // replayed, reloaded or restored. Sending it through the writer would
    // overwrite the payload the POST just stored.
    if (Array.from(url.searchParams.keys()).length === 0) return shareLanding();

    const fields = {};
    const fieldNames = [];
    for (const [name, value] of url.searchParams.entries()) {
      fieldNames.push(name);
      const text = String(value || '').trim();
      if (text && !fields[name]) fields[name] = text;
    }
    const payload = buildMeta({
      fields,
      fieldNames,
      files: [],
      unreadableFiles: 0,
      contentType: 'query-string',
      method: 'GET',
      parseError: '',
      bodyBytes: -1,
      recoveredBy: '',
    });
    await writeShare(payload);
    return shareLanding();
  } catch (e) {
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return shareLanding(`?error=${message}`);
  }
}

// ---------------------------------------------------------------------------
// Web Push
//
// The server sends { title, body, url, tag }. Clicking focuses a tab already
// open in the app (navigating it to the url) or opens a new one.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Remix Studio';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/android-chrome-192x192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Only ever navigate within this app.
  if (target.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOrigin = windows.filter((client) => new URL(client.url).origin === self.location.origin);
    const exact = sameOrigin.find((client) => client.url === target.href);
    if (exact) return exact.focus();
    const existing = sameOrigin[0];
    if (existing) {
      try {
        await existing.focus();
        if ('navigate' in existing) return await existing.navigate(target.href);
      } catch {
        // Fall through to opening a new window.
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
