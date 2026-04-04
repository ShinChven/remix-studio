import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { DynamoDBRepository } from './server/db/dynamodb-repository';
import { ensureTable } from './server/db/init-table';
import { S3Storage } from './server/storage/s3-storage';
import { UserRepository } from './server/auth/user-repository';
import { hashPassword, JwtPayload } from './server/auth/auth';
import { createAuthRouter } from './server/routes/auth';
import { createLibraryRouter } from './server/routes/libraries';
import { createProjectRouter } from './server/routes/projects';
import { createImageRouter } from './server/routes/images';
import { createProviderRouter } from './server/routes/providers';
import { createGenerateRouter } from './server/routes/generate';
import { ProviderRepository } from './server/db/provider-repository';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ========== Production secret guard ==========
if (process.env.NODE_ENV === 'production') {
  const required = ['JWT_SECRET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  }
}

async function startServer() {
  // === DynamoDB ===
  const dynamoClient = new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:18000',
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
  const providerRepository = new ProviderRepository(docClient);

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

  // === S3 / MinIO ===
  const storage = new S3Storage({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:19000',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'remix-studio',
  });
  await storage.ensureBucket();

  // === Hono app ===
  type Variables = { user: JwtPayload };
  const app = new Hono<{ Variables: Variables }>();
  const PORT = 3000;

  // Legacy bulk data endpoint
  app.get('/api/data', async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const data = await repository.getUserData(user.userId);
      return c.json(data);
    } catch (e) {
      console.error('[GET /api/data]', e);
      return c.json({ error: 'Failed to read data' }, 500);
    }
  });

  // Mount routers
  app.route('/', createAuthRouter(userRepository));
  app.route('/', createLibraryRouter(repository));
  app.route('/', createProjectRouter(repository, storage));
  app.route('/', createImageRouter(storage));
  app.route('/', createProviderRouter(providerRepository));
  app.route('/', createGenerateRouter(providerRepository));

  // === Server setup ===
  const PORT_NUM = PORT;
  const honoHandler = serve({ fetch: app.fetch, port: PORT_NUM });

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
            new Request(`http://localhost:${PORT_NUM}${url}`, {
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

    server.listen(PORT_NUM, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT_NUM}`);
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

    console.log(`Server running on http://localhost:${PORT_NUM}`);
  }
}

startServer();
