import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import type { ProviderRepository } from '../db/provider-repository';
import { createAssistantToolDefinitions, AssistantToolDefinition } from './tool-definitions';
import { getTransportInputSchema, resolveExternalToolCall } from './tool-confirmation';

type Variables = { mcpUserId: string };

function isStructuredContent(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

  const oauthToken = await prisma.oAuthAccessToken.findUnique({ where: { token: tokenHash } });
  if (oauthToken && !oauthToken.revoked && oauthToken.expiresAt > new Date()) {
    return oauthToken.userId;
  }

  const pat = await prisma.personalAccessToken.findUnique({ where: { tokenHash } });
  if (pat && !pat.revoked && (!pat.expiresAt || pat.expiresAt > new Date())) {
    prisma.personalAccessToken.update({ where: { id: pat.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return pat.userId;
  }

  return null;
}

function registerToolOnServer(server: McpServer, tool: AssistantToolDefinition, userId: string) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: getTransportInputSchema(tool),
      annotations: {
        title: tool.title,
        readOnlyHint: tool.annotations.readOnlyHint,
        destructiveHint: tool.annotations.destructiveHint,
        idempotentHint: tool.annotations.idempotentHint,
        openWorldHint: tool.annotations.openWorldHint,
      },
    },
    async (input: unknown) => {
      const resolution = resolveExternalToolCall(tool, input);
      const result =
        resolution.kind === 'execute'
          ? await tool.handler(userId, resolution.input)
          : resolution.result;
      const structuredContent = isStructuredContent(result.structuredContent)
        ? result.structuredContent
        : undefined;
      return {
        content: [{ type: 'text' as const, text: result.text }],
        ...(structuredContent ? { structuredContent } : {}),
        ...(result.isError ? { isError: true } : {}),
      };
    },
  );
}

function createMcpServerInstance(
  repository: IRepository,
  userRepository: UserRepository,
  prisma: PrismaClient,
  providerRepository: ProviderRepository,
  userId: string,
) {
  const server = new McpServer({
    name: 'remix-studio',
    version: '1.0.0',
  });

  const tools = createAssistantToolDefinitions({ repository, userRepository, prisma, providerRepository });
  for (const tool of tools) {
    registerToolOnServer(server, tool, userId);
  }

  return server;
}

export function createMcpRouter(
  prisma: PrismaClient,
  repository: IRepository,
  userRepository: UserRepository,
  providerRepository: ProviderRepository,
) {
  const router = new Hono<{ Variables: Variables }>();

  const authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header('authorization');
    const userId = await resolveBearer(prisma, authHeader);
    if (!userId) {
      setOAuthChallengeHeader(c);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('mcpUserId', userId);
    return next();
  };

  router.use('/mcp/*', authMiddleware);
  router.use('/mcp', authMiddleware);

  router.all('/mcp', async (c) => {
    const userId = c.get('mcpUserId');
    const server = createMcpServerInstance(repository, userRepository, prisma, providerRepository, userId);

    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return router;
}
