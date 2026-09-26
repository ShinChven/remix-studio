// Prepares the LG webOS app for TV mode: a hosted app whose only job is to
// open <server>/tv full screen with a home-screen icon.
//
//   node scripts/package-webos.mjs --url https://remix.example.com
//   ares-package dist/webos-app            # from the webOS TV CLI
//   ares-install --device tv io.remixstudio.tv_1.0.0_all.ipk
//
// The TV must be in Developer Mode (LG "Developer Mode" app) to install it.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const raw = urlIndex >= 0 ? args[urlIndex + 1] : process.env.APP_URL;
if (!raw) {
  console.error('Usage: node scripts/package-webos.mjs --url https://your-remix-studio-server');
  process.exit(1);
}

let tvUrl;
try {
  const base = new URL(raw);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('not http(s)');
  tvUrl = new URL('/tv', base.origin).href;
} catch {
  console.error(`Not a server address: ${raw}`);
  process.exit(1);
}

const out = path.join('dist', 'webos-app');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

fs.copyFileSync(path.join('webos', 'appinfo.json'), path.join(out, 'appinfo.json'));
const html = fs.readFileSync(path.join('webos', 'index.html'), 'utf8').replace('__REMIX_STUDIO_TV_URL__', tvUrl);
fs.writeFileSync(path.join(out, 'index.html'), html);

// webOS wants an 80x80 icon and a 130x130 large icon.
const source = path.join('public', 'icons', 'android-chrome-512x512.png');
await sharp(source).resize(80, 80).png().toFile(path.join(out, 'icon.png'));
await sharp(source).resize(130, 130).png().toFile(path.join(out, 'largeIcon.png'));

console.log(`webOS app ready in ${out}, opening ${tvUrl}`);
console.log('Next: ares-package dist/webos-app && ares-install --device <tv> io.remixstudio.tv_1.0.0_all.ipk');
