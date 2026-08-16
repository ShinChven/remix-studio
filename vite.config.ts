import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// The commit is read from the environment first so that builds without a git
// checkout (the Docker image ignores .git) can still be stamped via a build arg.
const resolveGitCommit = (env: Record<string, string>) => {
  const fromEnv = env.VITE_GIT_COMMIT || env.GIT_COMMIT || env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
  } catch {
    return '';
  }
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(resolveGitCommit(env)),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/agent/**',
          '**/data/**',
          '**/docs/**',
          '**/dist/**',
          '**/dist-server/**',
          '**/scratch/**',
          '**/.claude/**',
          '*/**/tsconfig.json',
          '*/**/tsconfig.*.json'
        ],
      },
    },
  };
});
