import type { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../../utils/crypto';
import type { DriveProfile, DriveSession, DriveTokenSet } from './index';

/** A connection as exposed to the client — never carries secrets. */
export interface PublicDriveConnection {
  id: string;
  kind: 'drive';
  platform: string;
  accountId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  folderId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const PUBLIC_FIELDS = {
  id: true,
  provider: true,
  accountId: true,
  displayName: true,
  email: true,
  avatarUrl: true,
  folderId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PublicRow = {
  id: string;
  provider: string;
  accountId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  folderId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(row: PublicRow): PublicDriveConnection {
  const { provider, ...rest } = row;
  return { ...rest, kind: 'drive', platform: provider };
}

export async function listDriveConnections(
  prisma: PrismaClient,
  userId: string,
): Promise<PublicDriveConnection[]> {
  const rows = await prisma.driveConnection.findMany({
    where: { userId },
    select: PUBLIC_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toPublic);
}

/**
 * Store a freshly authorized drive. Reconnecting the same remote account
 * refreshes the existing row rather than piling up duplicates, and any
 * placeholder row left by the single-slot Google Drive migration is folded in.
 */
export async function upsertDriveConnection(
  prisma: PrismaClient,
  args: { userId: string; provider: string; tokens: DriveTokenSet; profile: DriveProfile },
): Promise<PublicDriveConnection> {
  const { userId, provider, tokens, profile } = args;

  await prisma.driveConnection.deleteMany({
    where: { userId, provider, accountId: { startsWith: 'legacy:' } },
  });

  const secrets = {
    accessToken: tokens.accessToken ? encrypt(tokens.accessToken) : null,
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    credentials: tokens.credentials ? encrypt(JSON.stringify(tokens.credentials)) : null,
    expiresAt: tokens.expiresAt ?? null,
    scopes: tokens.scopes ?? undefined,
  };

  const row = await prisma.driveConnection.upsert({
    where: { userId_provider_accountId: { userId, provider, accountId: profile.accountId } },
    update: {
      ...secrets,
      status: 'active',
      displayName: profile.displayName ?? null,
      email: profile.email ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    },
    create: {
      userId,
      provider,
      accountId: profile.accountId,
      ...secrets,
      status: 'active',
      displayName: profile.displayName ?? null,
      email: profile.email ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    },
    select: PUBLIC_FIELDS,
  });

  return toPublic(row);
}

export interface LoadedDriveConnection {
  id: string;
  provider: string;
  displayName: string | null;
  session: DriveSession;
}

/** Load a connection and decrypt its secrets for use by a provider. */
export async function loadDriveConnection(
  prisma: PrismaClient,
  userId: string,
  connectionId: string,
): Promise<LoadedDriveConnection | null> {
  const row = await prisma.driveConnection.findFirst({ where: { id: connectionId, userId } });
  if (!row) return null;

  let credentials: Record<string, string> | undefined;
  if (row.credentials) {
    try {
      credentials = JSON.parse(decrypt(row.credentials));
    } catch {
      credentials = undefined;
    }
  }

  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    session: {
      accessToken: row.accessToken ? decrypt(row.accessToken) : undefined,
      refreshToken: row.refreshToken ? decrypt(row.refreshToken) : undefined,
      credentials,
      folderId: row.folderId,
    },
  };
}

/** Persist rotated secrets handed back by a provider mid-upload. */
export async function saveRefreshedTokens(
  prisma: PrismaClient,
  connectionId: string,
  tokens: DriveTokenSet,
): Promise<void> {
  await prisma.driveConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: tokens.accessToken ? encrypt(tokens.accessToken) : undefined,
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresAt ?? undefined,
      status: 'active',
    },
  });
}

export async function markDriveConnectionExpired(
  prisma: PrismaClient,
  connectionId: string,
): Promise<void> {
  await prisma.driveConnection
    .update({ where: { id: connectionId }, data: { status: 'expired' } })
    .catch(() => {});
}
