const SHARE_CACHE = 'remix-studio-share-v1';
const META_KEY = '/__share-cache/meta.json';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request));
  }
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const text = String(formData.get('text') || '');
    const title = String(formData.get('title') || '');
    const sharedUrl = String(formData.get('url') || '');
    const files = formData.getAll('files');

    const cache = await caches.open(SHARE_CACHE);

    // Clear any stale entries from a prior share
    const existing = await cache.keys();
    await Promise.all(existing.map((req) => cache.delete(req)));

    const fileMeta = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file || typeof file === 'string' || !file.size) continue;
      const key = `share-file-${Date.now()}-${i}`;
      const cacheUrl = `/__share-cache/${key}`;
      const response = new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
      });
      await cache.put(cacheUrl, response);
      fileMeta.push({
        key,
        name: file.name || '',
        type: file.type || 'application/octet-stream',
      });
    }

    const meta = {
      text,
      title,
      url: sharedUrl,
      files: fileMeta,
      receivedAt: Date.now(),
    };

    await cache.put(
      META_KEY,
      new Response(JSON.stringify(meta), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    return Response.redirect(new URL('/share', self.location.origin).href, 303);
  } catch (e) {
    const message = encodeURIComponent(String(e && e.message ? e.message : e));
    return Response.redirect(new URL(`/share?error=${message}`, self.location.origin).href, 303);
  }
}
