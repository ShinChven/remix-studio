const SHARE_CACHE = 'remix-studio-share-v1';
const SHARE_PREFIX = '/__share-cache/';
const META_KEY = `${SHARE_PREFIX}meta.json`;

// The manifest names these three fields, so they keep their meaning. Anything
// else a share posts is still kept: an Android WebAPK installed against an
// older manifest, or a sharing app that picks its own field name, would
// otherwise hand us a payload that silently reads as empty.
const NAMED_TEXT_FIELDS = ['text', 'title', 'url'];

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

// Reads whatever the platform posted without assuming the field names, and
// reports what it saw so the landing page can explain an empty share instead
// of rendering a blank preview.
async function readSharedPayload(request) {
  const contentType = request.headers.get('content-type') || '';
  const fields = {};
  const fieldNames = [];
  const files = [];
  let unreadableFiles = 0;

  let entries = [];
  try {
    const formData = await request.formData();
    entries = Array.from(formData.entries());
  } catch (e) {
    // Not a form body after all — take the raw body as the shared text rather
    // than losing the share.
    const body = await request.clone().text();
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

  return buildMeta({ fields, fieldNames, files, unreadableFiles, contentType });
}

function buildMeta({ fields, fieldNames, files, unreadableFiles, contentType }) {
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
      },
      receivedAt: Date.now(),
    },
    files,
  };
}

async function writeShare(payload) {
  const cache = await caches.open(SHARE_CACHE);

  // Clear the previous share only once this one has been parsed, so a failed
  // parse never destroys what is already there.
  const existing = await cache.keys();
  await Promise.all(existing.map((req) => cache.delete(req)));

  const fileMeta = [];
  for (let i = 0; i < payload.files.length; i++) {
    const { file } = payload.files[i];
    const key = `share-file-${Date.now()}-${i}`;
    const response = new Response(file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    await cache.put(`${SHARE_PREFIX}${key}`, response);
    fileMeta.push({
      key,
      name: file.name || '',
      type: file.type || 'application/octet-stream',
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

async function handleShare(request) {
  try {
    const payload = await readSharedPayload(request);
    await writeShare(payload);
    return Response.redirect(new URL('/share', self.location.origin).href, 303);
  } catch (e) {
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return Response.redirect(new URL(`/share?error=${message}`, self.location.origin).href, 303);
  }
}

async function handleShareGet(url) {
  try {
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
    });
    await writeShare(payload);
    return Response.redirect(new URL('/share', self.location.origin).href, 303);
  } catch (e) {
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return Response.redirect(new URL(`/share?error=${message}`, self.location.origin).href, 303);
  }
}
