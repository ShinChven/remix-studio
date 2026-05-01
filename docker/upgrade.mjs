import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

const AUTO_RESOLVE_MIGRATIONS = [
  '20260501120000_add_post_media_position',
];

async function migrationNeedsResolve(client, migrationName) {
  let result;
  try {
    result = await client.query(
      'SELECT "finished_at", "rolled_back_at" FROM "_prisma_migrations" WHERE "migration_name" = $1 ORDER BY "started_at" DESC LIMIT 1',
      [migrationName],
    );
  } catch (error) {
    if (error?.code === '42P01') return false;
    throw error;
  }

  if (result.rowCount === 0) return false;

  const row = result.rows[0];
  return !row.finished_at && !row.rolled_back_at;
}

async function autoResolveKnownMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const migrationName of AUTO_RESOLVE_MIGRATIONS) {
      if (!(await migrationNeedsResolve(client, migrationName))) continue;

      console.log(`[upgrade] Auto-resolving failed Prisma migration: ${migrationName}`);
      execFileSync(
        'npx',
        ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName],
        { stdio: 'inherit' },
      );
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('[upgrade] Checking Prisma migration state...');
  await autoResolveKnownMigrations();

  console.log('[upgrade] Running Prisma migrations...');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
  console.log('[upgrade] Prisma migrations completed.');
}

main().catch((error) => {
  console.error('[upgrade] Fatal upgrade error:', error);
  process.exit(1);
});
