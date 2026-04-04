import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { DynamoDBRepository } from './server/db/dynamodb-repository';
import { ensureTable } from './server/db/init-table';
import { S3Storage } from './server/storage/s3-storage';
import crypto from 'crypto';
import { UserRepository } from './server/auth/user-repository';
import { authMiddleware, adminOnly, hashPassword, verifyPassword, signToken, JwtPayload } from './server/auth/auth';
import type { UserRole, WorkflowItem, Job } from './src/types';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ========== Production secret guard ==========
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:18000';

// ========== Simple in-memory rate limiter for login ==========
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

const VALID_ROLES: UserRole[] = ['admin', 'user'];

async function startServer() {
  // Initialize DynamoDB
  const dynamoClient = new DynamoDBClient({
    endpoint: DYNAMODB_ENDPOINT,
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
    },
  });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  await ensureTable(dynamoClient);

  const repository = new DynamoDBRepository(docClient);
  await repository.autoImportJson(DATA_DIR);

  const userRepository = new UserRepository(docClient);

  // Auto-provision default admin user if configured
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  if (defaultAdminEmail && defaultAdminPassword) {
    const existingAdmin = await userRepository.findByEmail(defaultAdminEmail);
    if (!existingAdmin) {
      const passwordHash = await hashPassword(defaultAdminPassword);
      const userId = crypto.randomUUID();
      await userRepository.createUser({
        pk: 'USER',
        sk: userId,
        email: defaultAdminEmail,
        passwordHash,
        role: 'admin',
        createdAt: Date.now(),
      });
      console.log(`Auto-provisioned default admin user: ${defaultAdminEmail}`);
    }
  }

  // Initialize S3 storage
  const storage = new S3Storage({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:19000',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'remix-studio',
  });
  await storage.ensureBucket();

  type Variables = {
    user: JwtPayload;
  };
  // Hono app
  const app = new Hono<{ Variables: Variables }>();
  const PORT = 3000;

  // ========== Auth API ==========

  app.post('/api/auth/login', async (c) => {
    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
      if (!checkRateLimit(ip)) {
        return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
      }

      const body = await c.req.json();
      const email = typeof body?.email === 'string' ? body.email.trim() : null;
      const password = typeof body?.password === 'string' ? body.password : null;

      if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

      const user = await userRepository.findByEmail(email);
      if (!user) return c.json({ error: 'Invalid credentials' }, 401);

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

      const token = signToken({ userId: user.sk, email: user.email, role: user.role });
      return c.json({ token, user: { id: user.sk, email: user.email, role: user.role } });
    } catch (e) {
      console.error('[POST /api/auth/login]', e);
      return c.json({ error: 'Login failed' }, 500);
    }
  });

  app.get('/api/auth/me', authMiddleware, async (c) => {
    const payload = c.get('user') as JwtPayload;
    return c.json({ user: { id: payload.userId, email: payload.email, role: payload.role } });
  });

  // ========== Admin Routes ==========

  app.get('/api/admin/users', authMiddleware, adminOnly, async (c) => {
    try {
      const users = await userRepository.listUsers();
      return c.json(users.map(u => ({ id: u.sk, email: u.email, role: u.role, createdAt: u.createdAt })));
    } catch (e) {
      console.error('[GET /api/admin/users]', e);
      return c.json({ error: 'Failed to list users' }, 500);
    }
  });

  app.put('/api/admin/users/:id/role', authMiddleware, adminOnly, async (c) => {
    try {
      const userId = c.req.param('id');
      const body = await c.req.json();
      const role = body?.role;

      if (!VALID_ROLES.includes(role)) {
        return c.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, 400);
      }

      await userRepository.updateRole(userId, role as UserRole);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/admin/users/:id/role]', e);
      return c.json({ error: 'Failed to update role' }, 500);
    }
  });

  // ========== Legacy bulk data (kept for backward compat during migration) ==========

  app.get('/api/data', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const data = await repository.getUserData(user.userId);
      return c.json(data);
    } catch (e) {
      console.error('[GET /api/data]', e);
      return c.json({ error: 'Failed to read data' }, 500);
    }
  });

  // ========== Library CRUD ==========

  app.get('/api/libraries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const libraries = await repository.getUserLibraries(user.userId);
      return c.json(libraries);
    } catch (e) {
      console.error('[GET /api/libraries]', e);
      return c.json({ error: 'Failed to list libraries' }, 500);
    }
  });

  app.get('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const library = await repository.getLibrary(user.userId, c.req.param('id'));
      if (!library) return c.json({ error: 'Not found' }, 404);
      return c.json(library);
    } catch (e) {
      console.error('[GET /api/libraries/:id]', e);
      return c.json({ error: 'Failed to get library' }, 500);
    }
  });

  app.post('/api/libraries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const id = typeof body?.id === 'string' ? body.id.trim() : null;
      const name = typeof body?.name === 'string' ? body.name.trim() : null;
      const type = typeof body?.type === 'string' ? body.type.trim() : null;

      if (!id || !name || !type) return c.json({ error: 'id, name, and type are required' }, 400);
      if (id.length > 128 || name.length > 256) return c.json({ error: 'Field too long' }, 400);

      await repository.createLibrary(user.userId, { id, name, type });
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries]', e);
      return c.json({ error: 'Failed to create library' }, 500);
    }
  });

  app.put('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const updates: { name?: string; type?: string } = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (typeof body?.type === 'string') updates.type = body.type.trim();

      await repository.updateLibrary(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/libraries/:id]', e);
      return c.json({ error: 'Failed to update library' }, 500);
    }
  });

  app.delete('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibrary(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/libraries/:id]', e);
      return c.json({ error: 'Failed to delete library' }, 500);
    }
  });

  // ========== Library Item CRUD ==========

  app.get('/api/libraries/:libId/items', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const items = await repository.getLibraryItems(user.userId, c.req.param('libId'));
      return c.json(items);
    } catch (e) {
      console.error('[GET /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to list items' }, 500);
    }
  });

  app.post('/api/libraries/:libId/items', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const item = await c.req.json();
      await repository.createLibraryItem(user.userId, c.req.param('libId'), item);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/libraries/:libId/items]', e);
      return c.json({ error: 'Failed to create item' }, 500);
    }
  });

  app.put('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const updates: { content?: string; title?: string } = {};
      if (typeof body?.content === 'string') updates.content = body.content;
      if (typeof body?.title === 'string') updates.title = body.title;

      await repository.updateLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/libraries/:libId/items/:itemId]', e);
      return c.json({ error: 'Failed to update item' }, 500);
    }
  });

  app.delete('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/libraries/:libId/items/:itemId]', e);
      return c.json({ error: 'Failed to delete item' }, 500);
    }
  });

  // ========== Project CRUD ==========

  app.get('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const projects = await repository.getUserProjects(user.userId);
      return c.json(projects);
    } catch (e) {
      console.error('[GET /api/projects]', e);
      return c.json({ error: 'Failed to list projects' }, 500);
    }
  });

  app.get('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const project = await repository.getProject(user.userId, c.req.param('id'));
      if (!project) return c.json({ error: 'Not found' }, 404);
      return c.json(project);
    } catch (e) {
      console.error('[GET /api/projects/:id]', e);
      return c.json({ error: 'Failed to get project' }, 500);
    }
  });

  app.post('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const id = typeof body?.id === 'string' ? body.id.trim() : null;
      const name = typeof body?.name === 'string' ? body.name.trim() : null;

      if (!id || !name) return c.json({ error: 'id and name are required' }, 400);
      if (id.length > 128 || name.length > 256) return c.json({ error: 'Field too long' }, 400);

      const project = {
        id,
        name,
        createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
        workflow: Array.isArray(body.workflow) ? body.workflow : [],
        jobs: Array.isArray(body.jobs) ? body.jobs : [],
      };

      await repository.createProject(user.userId, project);
      return c.json({ success: true }, 201);
    } catch (e) {
      console.error('[POST /api/projects]', e);
      return c.json({ error: 'Failed to create project' }, 500);
    }
  });

  app.put('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const updates: { name?: string; workflow?: WorkflowItem[]; jobs?: Job[] } = {};
      if (typeof body?.name === 'string') updates.name = body.name.trim();
      if (Array.isArray(body?.workflow)) updates.workflow = body.workflow;
      if (Array.isArray(body?.jobs)) updates.jobs = body.jobs;

      await repository.updateProject(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      console.error('[PUT /api/projects/:id]', e);
      return c.json({ error: 'Failed to update project' }, 500);
    }
  });

  app.delete('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteProject(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      console.error('[DELETE /api/projects/:id]', e);
      return c.json({ error: 'Failed to delete project' }, 500);
    }
  });

  // ========== Project Rename (must be before generic :id routes to avoid shadowing) ==========

  app.post('/api/projects/rename', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const oldId = typeof body?.oldId === 'string' ? body.oldId : null;
      const newId = typeof body?.newId === 'string' ? body.newId : null;

      if (!oldId || !newId) return c.json({ error: 'Missing IDs' }, 400);

      const safeOldId = oldId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const safeNewId = newId.replace(/[^a-zA-Z0-9-_]/g, '_');

      await storage.rename(`${user.userId}/${safeOldId}/`, `${user.userId}/${safeNewId}/`);
      return c.json({ success: true });
    } catch (e) {
      console.error('[POST /api/projects/rename]', e);
      return c.json({ error: 'Failed to rename project folder' }, 500);
    }
  });

  // ========== Image Storage ==========

  const IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB base64 payload limit

  app.post('/api/images', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const { base64, projectId } = body;

      if (!base64 || typeof base64 !== 'string') return c.json({ error: 'No image data' }, 400);
      if (!projectId || typeof projectId !== 'string') return c.json({ error: 'projectId is required' }, 400);
      if (base64.length > IMAGE_SIZE_LIMIT_BYTES) return c.json({ error: 'Image too large (max 10 MB)' }, 413);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const url = await storage.save(key, buffer, 'image/png');
      return c.json({ url });
    } catch (e) {
      console.error('[POST /api/images]', e);
      return c.json({ error: 'Failed to save image' }, 500);
    }
  });

  app.get('/api/images/*', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const key = c.req.path.replace('/api/images/', '');

      // Block path traversal
      if (key.includes('..')) return c.json({ error: 'Invalid path' }, 400);

      // Enforce ownership: key must start with the authenticated userId
      if (!key.startsWith(`${user.userId}/`)) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      const data = await storage.read(key);
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': 'image/png' },
      });
    } catch (e) {
      console.error('[GET /api/images/*]', e);
      return c.notFound();
    }
  });

  // ========== Server Setup ==========

  const honoHandler = serve({ fetch: app.fetch, port: PORT });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    (honoHandler as http.Server).close();

    const server = http.createServer((req, res) => {
      const url = req.url || '';
      if (url.startsWith('/api/')) {
        Promise.resolve(
          app.fetch(
            new Request(`http://localhost:${PORT}${url}`, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: ['GET', 'HEAD'].includes(req.method || '')
                ? undefined
                : (req as unknown as ReadableStream),
              // @ts-expect-error Node.js stream as body
              duplex: 'half',
            })
          )
        ).then(async (response) => {
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          const body = await response.arrayBuffer();
          res.end(Buffer.from(body));
        }).catch(() => {
          res.writeHead(500);
          res.end('Internal Server Error');
        });
      } else {
        vite.middlewares(req, res);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    app.get('*', async (c) => {
      const filePath = path.join(distPath, c.req.path);
      if (c.req.path !== '/' && fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        return new Response(content);
      }
      const html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      return c.html(html);
    });

    console.log(`Server running on http://localhost:${PORT}`);
  }
}

startServer();
