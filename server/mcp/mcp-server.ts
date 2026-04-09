import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import type { IRepository } from '../db/repository';

type Variables = { mcpUserId: string };

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function createMcpServerInstance(repository: IRepository, userId: string) {
  const server = new McpServer({
    name: 'remix-studio',
    version: '1.0.0',
  });

  // ─── Tool: list_libraries ───
  server.tool(
    'list_libraries',
    'List all text libraries for the authenticated user. Returns library id, name, type, and item count.',
    {
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Items per page (default 50)'),
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
  server.tool(
    'create_library',
    'Create a new text library.',
    {
      name: z.string().min(1).max(256).describe('Library name'),
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
  server.tool(
    'create_prompt',
    'Create a text prompt (item) in a library. The content is the prompt text. Tags are optional.',
    {
      library_id: z.string().describe('The library ID to add the prompt to'),
      content: z.string().min(1).describe('The prompt text content'),
      title: z.string().optional().describe('Optional title for the prompt'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
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

  return server;
}

export function createMcpRouter(prisma: PrismaClient, repository: IRepository) {
  const router = new Hono<{ Variables: Variables }>();

  // Bearer token auth middleware for all MCP endpoints
  router.use('/mcp/*', async (c, next) => {
    const authHeader = c.req.header('authorization');
    const userId = await resolveBearer(prisma, authHeader);
    if (!userId) {
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
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('mcpUserId', userId);
    return next();
  });

  // ─── Streamable HTTP transport (Web Standard, works with Hono) ───
  router.all('/mcp', async (c) => {
    const userId = c.get('mcpUserId');
    const server = createMcpServerInstance(repository, userId);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return router;
}
