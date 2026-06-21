# Local Development

Run Remix Studio on your own machine with `npm run dev`, backed by local PostgreSQL and MinIO from Docker Compose.

## Requirements

- **Node.js 20+**
- **Docker** with Docker Compose, for running local PostgreSQL and MinIO
- At least one **provider API key**

## 1. Clone the Repository

```bash
git clone https://github.com/ShinChven/remix-studio.git
cd remix-studio
```

## 2. Start Local Services

```bash
docker compose up -d postgres minio
```

This starts PostgreSQL on `5432` and MinIO on `9000` with the console on `9001`.

## 3. Install Dependencies

```bash
npm install
```

## 4. Configure Environment Variables

```bash
cp .env.example .env
```

`.env.example` is for host-based local development, where the app runs with `npm run dev` on your machine instead of inside Docker Compose.

If you run `npm run dev` on your host machine, point storage at the host-published MinIO port:

```ini
S3_ENDPOINT=http://localhost:9000
```

::: warning
Use `http://minio:9000` only when the app itself is running inside Docker Compose on the same Docker network.
:::

You should set at least these variables (see the full [Configuration Reference](/guide/configuration)):

- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_EXPORT_BUCKET`
- `AWS_REGION`
- `PROVIDER_ENCRYPTION_KEY`
- `JWT_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

::: danger PROVIDER_ENCRYPTION_KEY must be stable
`PROVIDER_ENCRYPTION_KEY` must be a 64-character hex string. **Do not change it after providers have been created** unless you are also re-encrypting the stored provider credentials — existing provider API keys are encrypted with this value, and changing it later can make saved credentials unreadable.

If you previously ran an older version with a longer key value, the app may have been using only the first 64 hex characters. Keep that same effective 64-character value when upgrading.
:::

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Run Database Migrations

For a brand new local development database, run:

```bash
npx prisma migrate dev
```

If the database already exists and you only want to apply committed migrations safely, run:

```bash
npx prisma migrate deploy
```

Use `migrate deploy` when pulling new changes into an existing environment. `migrate dev` is intended for development workflows that create or reconcile migrations and may prompt for a reset when the database history has drifted.

## 6. Start the App

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## NPM Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Start the development server |
| `npm run build` | Build frontend and server bundles |
| `npm run start` | Run the production server from the built output |
| `npm run lint` | Run TypeScript type checking |
| `npm run i18n:check` | Compare translation completeness across locales |
| `npm run mcp:inspect` | Launch the MCP inspector against `http://localhost:3000/mcp` |

## Next Steps

- Deploying to a server? See [Docker Deployment](/guide/docker-deployment).
- Need every environment variable explained? See the [Configuration Reference](/guide/configuration).
