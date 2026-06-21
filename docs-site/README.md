# Remix Studio Documentation Site

A [VitePress](https://vitepress.dev) documentation site for Remix Studio.

This site has its own `package.json` and dependencies (VitePress is **not**
installed in the main app, so it never bloats the application's Docker image).

## Local Development

From the repository root:

```bash
npm run docs:install  # one-time: install docs dependencies (in docs-site/)
npm run docs:dev      # start dev server (http://localhost:5173)
npm run docs:build    # build static site to docs-site/.vitepress/dist
npm run docs:preview  # preview the production build
```

Or run the equivalent `npm install` / `npm run dev` directly inside `docs-site/`.

## Structure

```
docs-site/
├── .vitepress/config.ts   # site config, nav, sidebar
├── public/                # static assets (screenshot, etc.)
├── index.md               # home page
├── guide/                 # introduction, getting started, configuration
├── concepts/              # workflows, libraries, projects, execution, output
├── integrations/          # MCP, browser extension, social channels
└── operations/            # backup/restore, memory, upgrading
```

## Deploying

`docs:build` produces a static site in `docs-site/.vitepress/dist`. Deploy that directory
to any static host (GitHub Pages, Cloudflare Pages, Vercel, Netlify) or serve it from
the Remix Studio server.
