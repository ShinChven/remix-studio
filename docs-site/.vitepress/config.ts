import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Remix Studio',
  description:
    'Self-hosted AI assistant workspace for orchestration, batch content generation, and social campaign planning.',
  lang: 'en-US',
  // Served from a sub-path on GitHub Pages (e.g. /remix-studio/).
  // CI sets DOCS_BASE; local builds and root-domain hosts default to '/'.
  base: process.env.DOCS_BASE || '/',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  srcExclude: ['README.md'],

  head: [
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Remix Studio' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'A self-hosted AI workspace for batch content generation and social campaigns.',
      },
    ],
  ],

  themeConfig: {
    logo: undefined,

    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      {
        text: 'Concepts',
        link: '/concepts/workflows',
        activeMatch: '/concepts/',
      },
      {
        text: 'Integrations',
        link: '/integrations/mcp',
        activeMatch: '/integrations/',
      },
      {
        text: 'Operations',
        link: '/operations/backup-and-restore',
        activeMatch: '/operations/',
      },
      {
        text: 'Links',
        items: [
          {
            text: 'GitHub',
            link: 'https://github.com/ShinChven/remix-studio',
          },
          {
            text: 'Releases',
            link: 'https://github.com/ShinChven/remix-studio/releases',
          },
          {
            text: 'Docker Image',
            link: 'https://github.com/ShinChven/remix-studio/pkgs/container/remix-studio',
          },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          collapsed: false,
          items: [
            { text: 'What Is Remix Studio', link: '/guide/introduction' },
            { text: 'Why It Feels Different', link: '/guide/why-different' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Local Development', link: '/guide/local-development' },
            { text: 'Docker Deployment', link: '/guide/docker-deployment' },
            { text: 'Configuration Reference', link: '/guide/configuration' },
            { text: 'Storage Providers', link: '/guide/storage-providers' },
            {
              text: 'Accounts & Security',
              link: '/guide/account-and-security',
            },
            { text: 'Install as an App (PWA)', link: '/guide/install-pwa' },
          ],
        },
      ],
      '/concepts/': [
        {
          text: 'Core Concepts',
          collapsed: false,
          items: [
            { text: 'Workflows & Combinations', link: '/concepts/workflows' },
            { text: 'Libraries & Prompts', link: '/concepts/libraries' },
            { text: 'Projects & Albums', link: '/concepts/projects' },
            { text: 'The Assistant', link: '/concepts/assistant' },
            { text: 'Campaigns', link: '/concepts/campaigns' },
          ],
        },
        {
          text: 'Execution & Output',
          collapsed: false,
          items: [
            { text: 'Providers & Models', link: '/concepts/providers' },
            { text: 'Queue & Concurrency', link: '/concepts/queue' },
            { text: 'Exports & Delivery', link: '/concepts/exports' },
            { text: 'Storage', link: '/concepts/storage' },
            { text: 'Recycle Bin (Trash)', link: '/concepts/trash' },
            { text: 'Selling Exports', link: '/concepts/selling-exports' },
          ],
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            {
              text: 'Supported Workflows',
              link: '/concepts/supported-workflows',
            },
            { text: 'Model Profiles', link: '/concepts/models' },
          ],
        },
      ],
      '/integrations/': [
        {
          text: 'Integrations',
          collapsed: false,
          items: [
            { text: 'MCP Support', link: '/integrations/mcp' },
            {
              text: 'Browser Extension',
              link: '/integrations/chrome-extension',
            },
            {
              text: 'Mobile Share (PWA)',
              link: '/integrations/mobile-share',
            },
          ],
        },
        {
          text: 'Social Channels',
          collapsed: false,
          items: [
            { text: 'X (Twitter) Setup', link: '/integrations/x-platform' },
            { text: 'Threads Setup', link: '/integrations/threads-platform' },
          ],
        },
      ],
      '/operations/': [
        {
          text: 'Operations',
          collapsed: false,
          items: [
            {
              text: 'Backup & Restore',
              link: '/operations/backup-and-restore',
            },
            { text: 'Memory Monitoring', link: '/operations/memory-monitoring' },
            { text: 'Upgrading', link: '/operations/upgrading' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ShinChven/remix-studio' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern:
        'https://github.com/ShinChven/remix-studio/edit/main/docs-site/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 ShinChven',
    },
  },
})
