import 'dotenv/config';
import { Hono } from 'hono';
import { serve, getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createServer as createViteServer } from 'vite';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { PrismaRepository } from './server/db/prisma-repository';
import { S3Storage } from './server/storage/s3-storage';
import { UserRepository } from './server/auth/user-repository';
import { hashPassword, JwtPayload, authMiddleware } from './server/auth/auth';
import { createAuthRouter } from './server/routes/auth';
import { createLibraryRouter } from './server/routes/libraries';
import { createProjectRouter } from './server/routes/projects';
import { createImageRouter } from './server/routes/images';
import { createProviderRouter } from './server/routes/providers';
import { createGenerateRouter } from './server/routes/generate';
import { createTrashRouter } from './server/routes/trash';
import { ProviderRepository } from './server/db/provider-repository';
import { ProjectRepository } from './server/db/project-repository';
import { createStorageRouter } from './server/routes/storage-router';
import { QueueManager } from './server/queue/queue-manager';
import { ExportManager } from './server/queue/export-manager';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ========== Production secret guard ==========
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'DATABASE_URL'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // === PostgreSQL via Prisma ===
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  console.log('Connected to PostgreSQL via Prisma');

  const repository = new PrismaRepository(prisma);
  await repository.autoImportJson(DATA_DIR);

  const userRepository = new UserRepository(prisma);
  const providerRepository = new ProviderRepository(prisma);
  const projectRepository = new ProjectRepository(prisma);

  const storage = new S3Storage({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:19000',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'remix-studio',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
  });
  await storage.ensureBucket();

  const exportStorage = new S3Storage({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:19000',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_EXPORT_BUCKET || `${process.env.MINIO_BUCKET || 'remix-studio'}-exports`,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
  });
  await exportStorage.ensureBucket();

  const queueManager = new QueueManager(prisma, providerRepository, projectRepository, storage, userRepository, exportStorage);
  // Important: Recover tasks before starting the server to resume background work
  await queueManager.recoverTasks();

  const exportManager = new ExportManager(repository, storage, exportStorage, userRepository);

  // === Auto-provision default admin ===
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (defaultAdminEmail && defaultAdminPassword) {
    const existing = await userRepository.findByEmail(defaultAdminEmail);
    if (!existing) {
      const passwordHash = await hashPassword(defaultAdminPassword);
      await userRepository.createUser({
        pk: 'USER',
        sk: crypto.randomUUID(),
        email: defaultAdminEmail,
        passwordHash,
        role: 'admin',
        createdAt: Date.now(),
      });
      console.log(`Auto-provisioned default admin user: ${defaultAdminEmail}`);
    }
  }

  // === Hono app ===
  type Variables = { user: JwtPayload };
  const app = new Hono<{ Variables: Variables }>();
  const PORT_NUM = 3000;

  // Mount routers
  app.route('/', createAuthRouter(userRepository));
  app.route('/', createLibraryRouter(repository, storage, userRepository, exportStorage));
  app.route('/', createProjectRouter(repository, userRepository, storage, exportStorage, queueManager, exportManager));
  app.route('/', createImageRouter(storage, exportStorage, repository, userRepository));
  app.route('/', createProviderRouter(providerRepository));
  app.route('/', createGenerateRouter(providerRepository));
  app.route('/', createTrashRouter(repository, storage));
  app.route('/', createStorageRouter(repository, userRepository, storage, exportStorage));

  // Shared legacy path (can be refactored eventually)
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

  // === Server setup ===
  if (process.env.NODE_ENV !== 'production') {
    // Dev: Hono is the primary server, Vite is mounted as middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    const honoListener = getRequestListener(app.fetch);

    const server = http.createServer((req, res) => {
      const url = req.url || '';
      if (url.startsWith('/api/')) {
        honoListener(req, res);
      } else {
        vite.middlewares(req, res);
      }
    });

    // Increase the max body size to handle large image uploads (default is ~1MB)
    server.maxRequestsPerSocket = 0;
    (server as any).timeout = 120000; // 2 minute timeout for uploads

    server.listen(PORT_NUM, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT_NUM}`);
    });
  } else {
    // Production: Hono serves everything
    const distPath = path.join(process.cwd(), 'dist');

    // Serve static assets with correct MIME types
    app.use('*', serveStatic({ root: './dist' }));

    // SPA fallback: return index.html for all non-file routes
    app.get('*', async (c) => {
      const html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
      return c.html(html);
    });

    serve({ fetch: app.fetch, port: PORT_NUM }, () => {
      console.log(`Server running on http://localhost:${PORT_NUM}`);
    });
  }
}

startServer();
