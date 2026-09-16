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
    // Not a form body after all — take the raw body as the shared text rather
    // than losing the share.
    let body = '';
    try {
      body = fallback ? await fallback.text() : '';
    } catch {
      body = '';
    }
    if (body) {
      try {
        entries = Array.from(new URLSearchParams(body).entries());
      } catch {
        entries = [['text', body]];
      }
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
  });
}

function buildMeta({ fields, fieldNames, files, unreadableFiles, contentType, method, parseError }) {
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
    });
    await writeShare(payload);
    return shareLanding();
  } catch (e) {
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return shareLanding(`?error=${message}`);
  }
}
