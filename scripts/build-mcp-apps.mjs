// Builds the MCP Apps views (src/mcp-apps) into dist/mcp-apps as one
// self-contained HTML file each. Hosts load a view from a single `ui://`
// resource into a sandboxed iframe with no network access to this server, so
// every script and stylesheet is inlined. One build per view, since inlining
// needs a single entry. Served by server/mcp/apps/mcp-apps.ts.
import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export const MCP_APP_VIEWS = ['media-grid', 'queue-monitor', 'post-preview', 'project-preview'];

const root = path.resolve(import.meta.dirname, '../src/mcp-apps');
const outDir = path.resolve(import.meta.dirname, '../dist/mcp-apps');

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.rmSync(outDir, { recursive: true, force: true });
  for (const view of MCP_APP_VIEWS) {
    await build({
      configFile: false,
      root,
      logLevel: 'warn',
      plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir,
        emptyOutDir: false,
        sourcemap: false,
        rollupOptions: { input: path.join(root, `${view}.html`) },
      },
    });
    const size = fs.statSync(path.join(outDir, `${view}.html`)).size;
    console.log(`mcp-apps: ${view}.html ${(size / 1024).toFixed(1)} KB`);
  }
}
