// Builds TV mode (src/tv) into dist/tv as one classic script and one
// stylesheet. TV browsers lag desktop ones by years (webOS 4 ships
// Chromium 53), so the bundle is an IIFE lowered to that engine instead of
// the ES modules the main app ships.
import { build } from 'esbuild';

export const TV_BUILD_OPTIONS = {
  entryPoints: { tv: 'src/tv/main.ts' },
  bundle: true,
  format: 'iife',
  target: ['chrome53'],
  charset: 'utf8',
  legalComments: 'none',
  loader: { '.css': 'css' },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await build({ ...TV_BUILD_OPTIONS, outdir: 'dist/tv', minify: true, sourcemap: false, logLevel: 'info' });
}
