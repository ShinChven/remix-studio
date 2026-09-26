import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Hono } from 'hono';

/**
 * Serves TV mode at /tv: a page apart from the main app, built by
 * scripts/build-tv.mjs into dist/tv as a classic script old TV browsers can
 * run. In development the bundle is built on request, so edits show on
 * reload.
 */

const DIST_DIR = path.join(process.cwd(), 'dist', 'tv');
const isProduction = process.env.NODE_ENV === 'production';

type Asset = { body: Uint8Array<ArrayBuffer>; hash: string };

function hashOf(body: Uint8Array): string {
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
}

async function buildInMemory(): Promise<Record<string, Asset>> {
  // Resolved at runtime so the server bundle never pulls esbuild in.
  const { build } = await import('esbuild');
  const { TV_BUILD_OPTIONS } = await import(pathToFileURL(path.join(process.cwd(), 'scripts', 'build-tv.mjs')).href);
  const result = await build({ ...TV_BUILD_OPTIONS, outdir: 'dist/tv', write: false, sourcemap: 'inline', logLevel: 'warning' });
  const assets: Record<string, Asset> = {};
  for (const file of result.outputFiles) {
    assets[path.basename(file.path)] = { body: new Uint8Array(file.contents), hash: hashOf(file.contents) };
  }
  return assets;
}

let productionAssets: Record<string, Asset> | null = null;

function readProductionAssets(): Record<string, Asset> {
  if (productionAssets) return productionAssets;
  const assets: Record<string, Asset> = {};
  for (const name of ['tv.js', 'tv.css']) {
    const file = path.join(DIST_DIR, name);
    if (fs.existsSync(file)) {
      const body = new Uint8Array(fs.readFileSync(file));
      assets[name] = { body, hash: hashOf(body) };
    }
  }
  productionAssets = assets;
  return assets;
}

async function loadAssets(): Promise<Record<string, Asset>> {
  return isProduction ? readProductionAssets() : buildInMemory();
}

function page(assets: Record<string, Asset>): string {
  const css = assets['tv.css'] ? `<link rel="stylesheet" href="/tv/tv.css?v=${assets['tv.css'].hash}">` : '';
  const js = assets['tv.js'] ? `<script src="/tv/tv.js?v=${assets['tv.js'].hash}" defer></script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#09090b">
<title>Remix Studio TV</title>
<link rel="icon" type="image/png" href="/icons/favicon-32x32.png">
${css}
</head>
<body>
<div id="app"><div class="tv-boot">Remix Studio</div></div>
<noscript>TV mode needs JavaScript.</noscript>
${js}
</body>
</html>`;
}

export function createTvAppRouter() {
  const router = new Hono();

  const servePage = async () => {
    const assets = await loadAssets();
    return new Response(page(assets), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  };
  router.get('/tv', servePage);
  router.get('/tv/', servePage);

  router.get('/tv/:file{tv\\.(?:js|css)}', async (c) => {
    const name = c.req.param('file');
    const asset = (await loadAssets())[name];
    if (!asset) return c.text('Not found', 404);
    return new Response(asset.body, {
      headers: {
        'Content-Type': name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
        // Links carry the content hash, so a year is safe.
        'Cache-Control': isProduction ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  });

  return router;
}
