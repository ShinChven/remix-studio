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
import { hashPassword, JwtPayload, authMiddleware, configureAuth } from './server/auth/auth';
import { createAuthRouter } from './server/routes/auth';
import { createLibraryRouter } from './server/routes/libraries';
import { createProjectRouter } from './server/routes/projects';
import { createImageRouter } from './server/routes/images';
import { createVideoRouter } from './server/routes/videos';
import { createAudioRouter } from './server/routes/audios';
import { createProviderRouter } from './server/routes/providers';
import { createGenerateRouter } from './server/routes/generate';
import { createTrashRouter } from './server/routes/trash';
import { createCampaignsRouter } from './server/routes/campaigns';
import { createPostsRouter } from './server/routes/posts';
import { ProviderRepository } from './server/db/provider-repository';
import { ProjectRepository } from './server/db/project-repository';
import { createStorageRouter } from './server/routes/storage-router';
import { createOAuthRouter } from './server/routes/oauth';
import { createSocialRouter } from './server/routes/social';
import { createMcpRouter } from './server/mcp/mcp-server';
import { createAssistantRouter } from './server/routes/assistant';
import { AssistantRepository } from './server/db/assistant-repository';
import { AssistantRunner } from './server/assistant/assistant-runner';
import { QueueManager } from './server/queue/queue-manager';
import { ExportManager } from './server/queue/export-manager';
import { DeliveryManager } from './server/queue/delivery-manager';
import { PostManager } from './server/queue/post-manager';
import { MediaProcessingPoller } from './server/queue/media-processing-poller';
import { ImageProcessor } from './server/queue/image-processor';
import { TextProcessor } from './server/queue/text-processor';
import { VideoProcessor } from './server/queue/video-processor';
import { AudioProcessor } from './server/queue/audio-processor';
import { DetachedPoller } from './server/queue/detached-poller';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// ========== Production secret guard ==========
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'PROVIDER_ENCRYPTION_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}

async function startServer() {
  const autoCreateBuckets = parseBooleanEnv(process.env.S3_AUTO_CREATE_BUCKET, true);
  const port = Number(process.env.PORT || 3000);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

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
  configureAuth(userRepository);
  const providerRepository = new ProviderRepository(prisma);
  const projectRepository = new ProjectRepository(prisma);

  const storage = new S3Storage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET || 'remix-studio',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
  });
  await storage.ensureBucket(autoCreateBuckets);

  const exportStorage = new S3Storage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_EXPORT_BUCKET || `${process.env.S3_BUCKET || 'remix-studio'}-exports`,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
  });
  await exportStorage.ensureBucket(autoCreateBuckets);

  const imageProcessor = new ImageProcessor(projectRepository, storage, userRepository, exportStorage);
  const textProcessor = new TextProcessor(projectRepository);
  const videoProcessor = new VideoProcessor(projectRepository, storage, userRepository, exportStorage);
  const audioProcessor = new AudioProcessor(projectRepository, storage, userRepository, exportStorage);
  const detachedPoller = new DetachedPoller(prisma, providerRepository, projectRepository, imageProcessor, videoProcessor);
  const queueManager = new QueueManager(prisma, providerRepository, projectRepository, storage, imageProcessor, textProcessor, videoProcessor, audioProcessor, detachedPoller);
  // Release the QueueManager concurrency slot when DetachedPoller finalizes a job.
  // Without this, async providers (e.g. KlingAI) would hold their slots forever.
  detachedPoller.setOnJobFinalize((providerId, jobId) => queueManager.releaseSlot(providerId, jobId));
  // Reconcile in-memory slot tracking against the DB after each poll cycle so
  // out-of-band job deletions (workflow replace, project cascade) don't leak slots.
  detachedPoller.setOnPollCycleComplete(() => queueManager.reconcileSlots());
  // Important: Recover tasks before starting the server to resume background work
  await queueManager.recoverTasks();

  const exportManager = new ExportManager(repository, storage, exportStorage, userRepository);
  const deliveryManager = new DeliveryManager(repository, exportStorage, userRepository);
  const postManager = new PostManager(prisma, storage);
  const mediaProcessingPoller = new MediaProcessingPoller(prisma, storage);

  // Start background workers
  exportManager.startWorkerLoop();
  deliveryManager.startWorkerLoop();
  postManager.start();
  mediaProcessingPoller.start();

  // Purge expired refresh token sessions every hour
  const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const runSessionCleanup = async () => {
    try {
      const deleted = await userRepository.cleanExpiredSessions();
      if (deleted > 0) console.log(`[SessionCleanup] Removed ${deleted} expired session(s).`);
    } catch (e) {
      console.error('[SessionCleanup] Failed to clean expired sessions:', e);
    }
  };
  runSessionCleanup(); // run once immediately on startup
  setInterval(runSessionCleanup, SESSION_CLEANUP_INTERVAL_MS);

  // === Auto-provision default admin ===
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (defaultAdminEmail) {
    const existing = await userRepository.findByEmail(defaultAdminEmail);
    if (!existing) {
      const passwordHash = defaultAdminPassword ? await hashPassword(defaultAdminPassword) : null;
      await userRepository.createUser({
        pk: 'USER',
        sk: crypto.randomUUID(),
        email: defaultAdminEmail,
        passwordHash,
        role: 'admin',
        status: 'active',
        createdAt: Date.now(),
      });
      console.log(`Auto-provisioned default admin user: ${defaultAdminEmail}${defaultAdminPassword ? '' : ' (no password, use OAuth to sign in)'}`);
    }
  }

  // === Hono app ===
  type Variables = { user: JwtPayload };
  const app = new Hono<{ Variables: Variables }>();

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.get('/readyz', async (c) => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return c.json({ ok: true });
    } catch (error) {
      console.error('[GET /readyz]', error);
      return c.json({ ok: false }, 503);
    }
  });

  // Mount routers
  app.route('/', createAuthRouter(userRepository));
  app.route('/', createLibraryRouter(repository, storage, userRepository, exportStorage, exportManager));
  app.route('/', createProjectRouter(repository, userRepository, storage, exportStorage, queueManager, exportManager, deliveryManager));
  app.route('/', createImageRouter(storage, exportStorage, repository, userRepository));
  app.route('/', createVideoRouter(storage, exportStorage, repository, userRepository));
  app.route('/', createAudioRouter(storage, exportStorage, repository, userRepository));
  app.route('/', createProviderRouter(providerRepository));
  app.route('/', createGenerateRouter(providerRepository));
  app.route('/', createTrashRouter(repository, storage));
  app.route('/', createStorageRouter(repository, userRepository, storage, exportStorage));
  app.route('/', createCampaignsRouter(prisma));
  app.route('/', createPostsRouter(prisma, postManager, providerRepository));
  app.route('/', createOAuthRouter(prisma));
  app.route('/', createSocialRouter(prisma));
  app.route('/', createMcpRouter(prisma, repository, userRepository, providerRepository));

  // === Assistant chat runtime ===
  const assistantRepo = new AssistantRepository(prisma);
  const assistantRunner = new AssistantRunner(assistantRepo, providerRepository, {
    repository,
    userRepository,
    prisma,
    providerRepository,
  });
  app.route('/', createAssistantRouter(assistantRepo, assistantRunner, providerRepository));

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
      if (url.startsWith('/api/') || url.startsWith('/mcp') || url.startsWith('/authorize') || url.startsWith('/register') || url.startsWith('/token') || url.startsWith('/.well-known/') || url.startsWith('/healthz') || url.startsWith('/readyz') || url.startsWith('/api/assistant')) {
        honoListener(req, res);
      } else {
        vite.middlewares(req, res);
      }
    });

    // Increase the max body size to handle large image uploads (default is ~1MB)
    server.maxRequestsPerSocket = 0;
    (server as any).timeout = 120000; // 2 minute timeout for uploads

    server.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${port}`);
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

    serve({ fetch: app.fetch, port }, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }
}

startServer();
