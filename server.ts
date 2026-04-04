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

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:18000';

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
      const { email, password } = await c.req.json();
      const user = await userRepository.findByEmail(email);
      if (!user) return c.json({ error: 'Invalid credentials' }, 401);

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

      const token = signToken({ userId: user.sk, email: user.email, role: user.role });
      return c.json({ token, user: { id: user.sk, email: user.email, role: user.role } });
    } catch (e) {
      return c.json({ error: 'Login failed' }, 500);
    }
  });

  app.get('/api/auth/me', authMiddleware, async (c) => {
    const payload = c.get('user') as JwtPayload;
    return c.json({ user: { id: payload.userId, email: payload.email, role: payload.role } });
  });

  // ========== Admin Routes ==========

  app.get('/api/admin/users', authMiddleware, adminOnly, async (c) => {
    const users = await userRepository.listUsers();
    return c.json(users.map(u => ({ id: u.sk, email: u.email, role: u.role, createdAt: u.createdAt })));
  });

  app.put('/api/admin/users/:id/role', authMiddleware, adminOnly, async (c) => {
    try {
      const userId = c.req.param('id');
      const { role } = await c.req.json();
      await userRepository.updateRole(userId, role);
      return c.json({ success: true });
    } catch (e) {
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
      return c.json({ error: 'Failed to get library' }, 500);
    }
  });

  app.post('/api/libraries', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { id, name, type } = await c.req.json();
      await repository.createLibrary(user.userId, { id, name, type });
      return c.json({ success: true }, 201);
    } catch (e) {
      return c.json({ error: 'Failed to create library' }, 500);
    }
  });

  app.put('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const updates = await c.req.json();
      await repository.updateLibrary(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Failed to update library' }, 500);
    }
  });

  app.delete('/api/libraries/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibrary(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
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
      return c.json({ error: 'Failed to create item' }, 500);
    }
  });

  app.put('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const updates = await c.req.json();
      await repository.updateLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'), updates);
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Failed to update item' }, 500);
    }
  });

  app.delete('/api/libraries/:libId/items/:itemId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteLibraryItem(user.userId, c.req.param('libId'), c.req.param('itemId'));
      return c.json({ success: true });
    } catch (e) {
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
      return c.json({ error: 'Failed to get project' }, 500);
    }
  });

  app.post('/api/projects', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const project = await c.req.json();
      await repository.createProject(user.userId, project);
      return c.json({ success: true }, 201);
    } catch (e) {
      return c.json({ error: 'Failed to create project' }, 500);
    }
  });

  app.put('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const updates = await c.req.json();
      await repository.updateProject(user.userId, c.req.param('id'), updates);
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Failed to update project' }, 500);
    }
  });

  app.delete('/api/projects/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      await repository.deleteProject(user.userId, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Failed to delete project' }, 500);
    }
  });

  // ========== Image Storage ==========

  app.post('/api/images', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { base64, projectId } = await c.req.json();
      if (!base64) return c.json({ error: 'No image data' }, 400);

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const key = `${user.userId}/${safeProjectId}/${filename}`;

      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const url = await storage.save(key, buffer, 'image/png');
      return c.json({ url });
    } catch (e) {
      return c.json({ error: 'Failed to save image' }, 500);
    }
  });

  app.get('/api/images/*', async (c) => {
    try {
      const key = c.req.path.replace('/api/images/', '');
      const data = await storage.read(key);
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': 'image/png' },
      });
    } catch (e) {
      return c.notFound();
    }
  });

  app.post('/api/projects/rename', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const { oldId, newId } = await c.req.json();
      if (!oldId || !newId) return c.json({ error: 'Missing IDs' }, 400);

      const safeOldId = oldId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const safeNewId = newId.replace(/[^a-zA-Z0-9-_]/g, '_');

      await storage.rename(`${user.userId}/${safeOldId}/`, `${user.userId}/${safeNewId}/`);
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: 'Failed to rename project folder' }, 500);
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
