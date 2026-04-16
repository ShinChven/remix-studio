import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';

type Variables = { mcpUserId: string };

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getBaseUrl(req: Request): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto.toLowerCase()}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}

function setOAuthChallengeHeader(c: any) {
  const baseUrl = getBaseUrl(c.req.raw);
  const resourceMetadata = `${baseUrl}/.well-known/oauth-protected-resource`;
  c.header(
    'WWW-Authenticate',
    `Bearer realm="remix-studio", scope="mcp:tools", resource_metadata="${resourceMetadata}"`,
  );
}

async function resolveBearer(prisma: PrismaClient, authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const rawToken = authHeader.slice(7);
  const tokenHash = sha256(rawToken);

  // Check OAuth access tokens
  const oauthToken = await prisma.oAuthAccessToken.findUnique({ where: { token: tokenHash } });
  if (oauthToken && !oauthToken.revoked && oauthToken.expiresAt > new Date()) {
    return oauthToken.userId;
  }

  // Check Personal Access Tokens (pat_...)
  const pat = await prisma.personalAccessToken.findUnique({ where: { tokenHash } });
  if (pat && !pat.revoked && (!pat.expiresAt || pat.expiresAt > new Date())) {
    // Touch lastUsedAt (fire-and-forget)
    prisma.personalAccessToken.update({ where: { id: pat.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return pat.userId;
  }

  return null;
}

function createMcpServerInstance(repository: IRepository, userRepository: UserRepository, prisma: PrismaClient, userId: string) {
  const server = new McpServer({
    name: 'remix-studio',
    version: '1.0.0',
  });

  // ─── Tool: list_libraries ───
  server.registerTool(
    'list_libraries',
    {
      description: 'List all text libraries for the authenticated user. Returns library id, name, type, and item count.',
      inputSchema: {
        page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
        limit: z.number().int().min(1).max(100).default(50).describe('Items per page (default 50)'),
      },
    },
    async ({ page, limit }) => {
      const result = await repository.getUserLibraries(userId, page, limit);
      const textLibraries = result.items
        .filter((lib) => lib.type === 'text')
        .map((lib) => ({
          id: lib.id,
          name: lib.name,
          type: lib.type,
          itemCount: lib.items.length,
        }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              libraries: textLibraries,
              total: textLibraries.length,
              page: result.page,
              pages: result.pages,
            }, null, 2),
          },
        ],
      };
    },
  );

  // ─── Tool: create_library ───
  server.registerTool(
    'create_library',
    {
      description: 'Create a new text library.',
      inputSchema: {
        name: z.string().min(1).max(256).describe('Library name'),
      },
    },
    async ({ name }) => {
      const id = crypto.randomUUID();
      await repository.createLibrary(userId, { id, name, type: 'text' });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ id, name, type: 'text', message: 'Library created successfully' }),
          },
        ],
      };
    },
  );

  // ─── Tool: create_prompt ───
  server.registerTool(
    'create_prompt',
    {
      description: 'Create a text prompt (item) in a library. The content is the prompt text. Tags are optional.',
      inputSchema: {
        library_id: z.string().describe('The library ID to add the prompt to'),
        content: z.string().min(1).describe('The prompt text content'),
        title: z.string().optional().describe('Optional title for the prompt'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      },
    },
    async ({ library_id, content, title, tags }) => {
      const id = crypto.randomUUID();
      await repository.createLibraryItem(userId, library_id, {
        id,
        content,
        title,
        tags,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ id, library_id, title, tags, message: 'Prompt created successfully' }),
          },
        ],
      };
    },
  );

  // ─── Tool: search_library_items ───
  server.registerTool(
    'search_library_items',
    {
      description: 'Search text prompts across libraries by keyword (matches content and title) and/or tags. Returns matching items with their library context.',
      inputSchema: {
        query: z.string().describe('Search keyword to match against prompt content and title'),
        library_id: z.string().optional().describe('Optional: limit search to a specific library'),
        tags: z.array(z.string()).optional().describe('Optional: filter by tags (items must contain ALL specified tags)'),
        page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
        limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
      },
    },
    async ({ query, library_id, tags, page, limit }) => {
      const result = await repository.searchLibraryItems(userId, query, {
        libraryId: library_id,
        tags,
        page,
        limit,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              items: result.items.map((item) => ({
                id: item.id,
                libraryId: item.libraryId,
                libraryName: item.libraryName,
                content: item.content,
                title: item.title,
                tags: item.tags,
              })),
              total: result.total,
              page: result.page,
              pages: result.pages,
            }, null, 2),
          },
        ],
      };
    },
  );

  // ─── Tool: get_storage_usage ───
  server.registerTool(
    'get_storage_usage',
    {
      description: 'Get storage usage summary for the authenticated user. Returns total usage, storage limit, and breakdown by category (projects, libraries, archives, trash).',
    },
    async () => {
      const [allItems, trashItems, userRecord] = await Promise.all([
        repository.getAllUserItems(userId),
        repository.getTrashItems(userId),
        userRepository.findById(userId),
      ]);

      const storageLimit = userRecord?.storageLimit || 5 * 1024 * 1024 * 1024;

      let totalProjectsSize = 0;
      let totalLibrarySize = 0;
      let totalExportSize = 0;

      const totalTrashSize = trashItems.reduce((sum, item) => {
        return sum + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
      }, 0);

      for (const item of allItems) {
        const itemSize = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
        if (item._type === 'ALBUM' || item._type === 'WORKFLOW_ITEM') {
          totalProjectsSize += itemSize;
        } else if (item._type === 'LIBRARY_ITEM') {
          totalLibrarySize += itemSize;
        } else if (item._type === 'EXPORT' && item.status === 'completed') {
          totalExportSize += Number(item.fileSize || 0);
        }
      }

      const totalSize = totalProjectsSize + totalLibrarySize + totalExportSize + totalTrashSize;

      const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              totalSize,
              totalSizeFormatted: formatSize(totalSize),
              limit: storageLimit,
              limitFormatted: formatSize(storageLimit),
              usagePercent: Number(((totalSize / storageLimit) * 100).toFixed(1)),
              categories: {
                projects: { size: totalProjectsSize, formatted: formatSize(totalProjectsSize) },
                libraries: { size: totalLibrarySize, formatted: formatSize(totalLibrarySize) },
                archives: { size: totalExportSize, formatted: formatSize(totalExportSize) },
                trash: { size: totalTrashSize, formatted: formatSize(totalTrashSize) },
              },
            }, null, 2),
          },
        ],
      };
    },
  );

  // ─── Tool: list_albums ───
  server.registerTool(
    'list_albums',
    {
      description: 'List all project albums for the authenticated user. Returns each project with its album item count and total album size.',
      inputSchema: {
        page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
        limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
      },
    },
    async ({ page, limit }) => {
      const projectsResult = await repository.getUserProjects(userId, page, limit);

      // Fetch album stats for each project
      const albumStats = await Promise.all(
        projectsResult.items.map(async (project) => {
          const albumItems = await prisma.albumItem.findMany({
            where: { projectId: project.id, userId },
            select: { size: true, optimizedSize: true, thumbnailSize: true },
          });

          const totalSize = albumItems.reduce(
            (sum, item) => sum + Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0),
            0,
          );

          const formatSize = (bytes: number) => {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
          };

          return {
            projectId: project.id,
            projectName: project.name,
            itemCount: albumItems.length,
            totalSize,
            totalSizeFormatted: formatSize(totalSize),
          };
        }),
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              albums: albumStats,
              total: projectsResult.total,
              page: projectsResult.page,
              pages: projectsResult.pages,
            }, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

export function createMcpRouter(prisma: PrismaClient, repository: IRepository, userRepository: UserRepository) {
  const router = new Hono<{ Variables: Variables }>();

  // Bearer token auth middleware for all MCP endpoints
  router.use('/mcp/*', async (c, next) => {
    const authHeader = c.req.header('authorization');
    const userId = await resolveBearer(prisma, authHeader);
    if (!userId) {
      setOAuthChallengeHeader(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('mcpUserId', userId);
    return next();
  });

  // Also protect the root /mcp endpoint
  router.use('/mcp', async (c, next) => {
    const authHeader = c.req.header('authorization');
    const userId = await resolveBearer(prisma, authHeader);
    if (!userId) {
      setOAuthChallengeHeader(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('mcpUserId', userId);
    return next();
  });

  // ─── Streamable HTTP transport (Web Standard, works with Hono) ───
  router.all('/mcp', async (c) => {
    const userId = c.get('mcpUserId');
    const server = createMcpServerInstance(repository, userRepository, prisma, userId);

    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return router;
}
