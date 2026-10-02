import crypto from 'crypto';
import type { PrismaClient, StagedUpload } from '@prisma/client';
import type { S3Storage } from '../storage/s3-storage';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import { checkStorageLimit } from '../utils/storage-check';
import {
  detectMediaType,
  estimateStoredBytes,
  ingestMedia,
  MEDIA_SIZE_LIMIT_BYTES,
  MEDIA_SNIFF_BYTES,
  mediaExtension,
  mediaKindForMimeType,
  normalizeMimeType,
  type MediaKind,
} from './media-ingest';

/**
 * Staged uploads let an MCP client get file bytes into storage without
 * sending them through a tool call. create_upload makes a row holding a
 * single-use token; the client PUTs the raw bytes to the upload URL; the
 * attach tools then copy the staged files into a library, project workflow or
 * campaign. Staged files are deleted once the row expires.
 */

/** How long the upload URL accepts its one PUT. */
export const STAGED_UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
/** How long a staged file stays available to attach. */
export const STAGED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FILENAME_LENGTH = 200;
const CLEANUP_BATCH_SIZE = 100;

export type StagedUploadStatus = 'awaiting_upload' | 'processing' | 'ready' | 'failed';

export interface StagedUploadDependencies {
  prisma: PrismaClient;
  storage: S3Storage;
  exportStorage: S3Storage;
  repository: IRepository;
  userRepository: UserRepository;
}

/** A failure the caller can act on, with the HTTP status the upload route returns. */
export class StagedUploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 = 400,
  ) {
    super(message);
    this.name = 'StagedUploadError';
  }
}

function hashUploadToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Keep only the last path segment and printable characters of a client filename. */
export function cleanUploadFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const printable = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return printable.slice(0, MAX_FILENAME_LENGTH) || 'upload';
}

/** Storage prefix every key of one staged upload starts with. */
function stagedKeyPrefix(userId: string, uploadId: string): string {
  return `staging/${userId}/${uploadId}.`;
}

async function deleteStagedObjects(storage: S3Storage, userId: string, uploadId: string): Promise<void> {
  const keys = await storage.listObjects(stagedKeyPrefix(userId, uploadId));
  await Promise.all(keys.map((key) => storage.delete(key)));
}

/** The supported types, listed for error messages. */
function supportedTypesText(): string {
  return 'images (PNG, JPEG, WebP, GIF), videos (MP4, MOV, WebM, MKV) and audio (MP3, AAC, M4A, WAV, OGG, WebM)';
}

/**
 * Validate one declared file and reserve a slot for it. Returns the new row and
 * the plaintext token, which is never stored and cannot be recovered later.
 */
export async function createStagedUpload(
  deps: StagedUploadDependencies,
  userId: string,
  file: { filename: string; mimeType: string; size: number },
): Promise<{ upload: StagedUpload; token: string }> {
  const declaredMimeType = normalizeMimeType(file.mimeType);
  const kind = mediaKindForMimeType(declaredMimeType);
  if (!declaredMimeType || !kind) {
    throw new StagedUploadError(`Unsupported file type "${file.mimeType}". Supported: ${supportedTypesText()}.`, 415);
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new StagedUploadError('size must be the file length in bytes, greater than 0.');
  }
  const limit = MEDIA_SIZE_LIMIT_BYTES[kind];
  if (file.size > limit) {
    throw new StagedUploadError(`${kind} files are limited to ${formatMegabytes(limit)}; this one is ${formatMegabytes(file.size)}.`, 413);
  }

  const estimated = estimateStoredBytes(kind, file.size);
  const { allowed, currentUsage, limit: quota } = await checkStorageLimit(
    userId,
    estimated,
    deps.userRepository,
    deps.storage,
    deps.exportStorage,
    deps.repository,
  );
  if (!allowed) {
    throw new StagedUploadError(
      `Storage limit exceeded. Remaining: ${formatMegabytes(Math.max(0, quota - currentUsage))}. Required: ~${formatMegabytes(estimated)}.`,
      403,
    );
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const upload = await deps.prisma.stagedUpload.create({
    data: {
      userId,
      filename: cleanUploadFilename(file.filename),
      declaredMimeType,
      declaredSize: BigInt(file.size),
      tokenHash: hashUploadToken(token),
      tokenExpiresAt: new Date(now + STAGED_UPLOAD_TOKEN_TTL_MS),
      expiresAt: new Date(now + STAGED_UPLOAD_TTL_MS),
    },
  });
  return { upload, token };
}

/**
 * Read a request body into memory, stopping as soon as it passes `maxBytes` so
 * an oversized upload cannot fill the server's memory first.
 */
async function readBodyWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) throw new StagedUploadError('The request has no body. Send the raw file bytes, for example with curl -T.');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new StagedUploadError(`The upload is larger than the ${maxBytes} bytes declared to create_upload.`, 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * Accept the one PUT an upload token allows: spend the token, check the bytes
 * are the media type that was declared, and write the staged file set.
 */
export async function receiveStagedUpload(
  deps: StagedUploadDependencies,
  uploadId: string,
  token: string | undefined,
  body: ReadableStream<Uint8Array> | null,
  contentLength?: number,
): Promise<StagedUpload> {
  if (!token) throw new StagedUploadError('The upload URL is missing its token.', 401);
  const tokenHash = hashUploadToken(token);

  const upload = await deps.prisma.stagedUpload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.tokenHash !== tokenHash) {
    throw new StagedUploadError('Upload not found, or the token does not match it.', 404);
  }
  if (upload.status !== 'awaiting_upload') {
    throw new StagedUploadError('This upload URL was already used. Call create_upload for a new one.', 409);
  }
  if (!upload.tokenExpiresAt || upload.tokenExpiresAt.getTime() < Date.now()) {
    throw new StagedUploadError('This upload URL has expired. Call create_upload for a new one.', 410);
  }

  const declaredSize = Number(upload.declaredSize);
  if (contentLength !== undefined && contentLength > declaredSize) {
    throw new StagedUploadError(`The upload is ${contentLength} bytes but create_upload declared ${declaredSize}.`, 413);
  }

  // Spend the token before reading the body, so two PUTs racing on one URL
  // cannot both be processed. The hash stays on the row so a repeated PUT
  // with the same URL is told it was used rather than that it never existed.
  const claimed = await deps.prisma.stagedUpload.updateMany({
    where: { id: uploadId, tokenHash, status: 'awaiting_upload' },
    data: { status: 'processing' },
  });
  if (claimed.count !== 1) {
    throw new StagedUploadError('This upload URL was already used. Call create_upload for a new one.', 409);
  }

  try {
    const buffer = await readBodyWithLimit(body, declaredSize);
    if (buffer.length !== declaredSize) {
      throw new StagedUploadError(`Received ${buffer.length} bytes but create_upload declared ${declaredSize}. Check the size and upload again with a new create_upload.`);
    }

    const declaredKind = mediaKindForMimeType(upload.declaredMimeType) as MediaKind;
    const detected = detectMediaType(buffer.subarray(0, MEDIA_SNIFF_BYTES), upload.declaredMimeType);
    if (!detected) {
      throw new StagedUploadError(`The file's contents are not a supported format. Supported: ${supportedTypesText()}.`, 415);
    }
    if (detected.kind !== declaredKind) {
      throw new StagedUploadError(`The file was declared as ${declaredKind} (${upload.declaredMimeType}) but its contents are ${detected.kind} (${detected.mimeType}).`, 415);
    }

    const ext = mediaExtension(detected.kind, detected.mimeType);
    let ingested;
    try {
      ingested = await ingestMedia(deps.storage, {
        kind: detected.kind,
        key: `${stagedKeyPrefix(upload.userId, upload.id)}${ext}`,
        ext,
        mimeType: detected.mimeType,
        buffer,
      });
    } catch (error: any) {
      throw new StagedUploadError(`The file could not be processed: ${error?.message || 'unreadable media'}.`, 415);
    }

    return await deps.prisma.stagedUpload.update({
      where: { id: upload.id },
      data: {
        status: 'ready',
        kind: detected.kind,
        mimeType: detected.mimeType,
        size: BigInt(ingested.size),
        storedSize: BigInt(ingested.storedSize),
        storageKey: ingested.key,
        thumbnailKey: ingested.thumbnailKey ?? null,
        optimizedKey: ingested.optimizedKey ?? null,
        error: null,
      },
    });
  } catch (error: any) {
    const message = error instanceof StagedUploadError ? error.message : 'The upload failed while being processed.';
    await deps.prisma.stagedUpload
      .update({ where: { id: upload.id }, data: { status: 'failed', error: message } })
      .catch(() => {});
    await deleteStagedObjects(deps.storage, upload.userId, upload.id).catch(() => {});
    throw error;
  }
}

/** JSON-safe view of an upload for tool results and the upload route. */
export function describeStagedUpload(upload: StagedUpload) {
  return {
    uploadId: upload.id,
    status: upload.status as StagedUploadStatus,
    filename: upload.filename,
    kind: upload.kind ?? mediaKindForMimeType(upload.declaredMimeType),
    mimeType: upload.mimeType ?? upload.declaredMimeType,
    size: upload.size != null ? Number(upload.size) : Number(upload.declaredSize),
    uploadUrlExpiresAt: upload.status === 'awaiting_upload' ? upload.tokenExpiresAt?.toISOString() ?? null : null,
    expiresAt: upload.expiresAt.toISOString(),
    error: upload.error ?? null,
  };
}

export type ReadyStagedUpload = StagedUpload & {
  kind: MediaKind;
  mimeType: string;
  size: bigint;
  storedSize: bigint;
  storageKey: string;
};

/**
 * Load uploads the caller wants to attach, in the order given. Every id must
 * belong to the user and be ready; otherwise nothing is returned and the error
 * names each problem so the caller can fix them all at once.
 */
export async function resolveReadyStagedUploads(
  prisma: PrismaClient,
  userId: string,
  uploadIds: string[],
): Promise<ReadyStagedUpload[]> {
  const unique = [...new Set(uploadIds)];
  const rows = await prisma.stagedUpload.findMany({ where: { userId, id: { in: unique } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = Date.now();
  const problems: string[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) problems.push(`${id}: not found`);
    else if (row.status === 'awaiting_upload') problems.push(`${id}: the file has not been uploaded to its upload URL yet`);
    else if (row.status === 'processing') problems.push(`${id}: still processing — call get_upload and retry when it is ready`);
    else if (row.status === 'failed') problems.push(`${id}: the upload failed (${row.error ?? 'unknown error'})`);
    else if (row.expiresAt.getTime() < now || !row.storageKey) problems.push(`${id}: expired — upload the file again`);
  }
  if (problems.length > 0) {
    throw new StagedUploadError(`Some uploads cannot be attached: ${problems.join('; ')}.`);
  }

  return uploadIds.map((id) => byId.get(id) as ReadyStagedUpload);
}

/**
 * Copy a staged file set to a new base key (a key without extension). The
 * original and its variants keep their suffixes, so `${base}.png`,
 * `${base}.thumb.png` and `${base}.opt.png` come back.
 */
export async function copyStagedFiles(
  storage: S3Storage,
  upload: ReadyStagedUpload,
  destinationBase: string,
): Promise<{ key: string; thumbnailKey?: string; optimizedKey?: string }> {
  const stagedBase = stagedKeyPrefix(upload.userId, upload.id).slice(0, -1);
  const destinationFor = (key: string) => `${destinationBase}${key.slice(stagedBase.length)}`;

  const key = destinationFor(upload.storageKey);
  const thumbnailKey = upload.thumbnailKey ? destinationFor(upload.thumbnailKey) : undefined;
  const optimizedKey = upload.optimizedKey ? destinationFor(upload.optimizedKey) : undefined;

  await Promise.all([
    storage.copy(upload.storageKey, key),
    upload.thumbnailKey && thumbnailKey ? storage.copy(upload.thumbnailKey, thumbnailKey) : undefined,
    upload.optimizedKey && optimizedKey ? storage.copy(upload.optimizedKey, optimizedKey) : undefined,
  ]);
  return { key, thumbnailKey, optimizedKey };
}

/** A fresh base key in the same `{timestamp}_{random}` form the upload routes use. */
export function newMediaBaseKey(userId: string, scopeId: string): string {
  const safeScopeId = scopeId.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${userId}/${safeScopeId}/${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

/**
 * Delete staged uploads whose time is up: expired rows, and rows whose upload
 * URL lapsed without being used. Returns how many rows were removed.
 */
export async function cleanupExpiredStagedUploads(prisma: PrismaClient, storage: S3Storage): Promise<number> {
  let removed = 0;
  for (;;) {
    const now = new Date();
    const expired = await prisma.stagedUpload.findMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { status: 'awaiting_upload', tokenExpiresAt: { lt: now } },
        ],
      },
      select: { id: true, userId: true, status: true },
      take: CLEANUP_BATCH_SIZE,
    });
    if (expired.length === 0) break;

    let removedThisBatch = 0;
    for (const upload of expired) {
      try {
        if (upload.status !== 'awaiting_upload') {
          await deleteStagedObjects(storage, upload.userId, upload.id);
        }
        await prisma.stagedUpload.delete({ where: { id: upload.id } });
        removedThisBatch += 1;
      } catch (error) {
        console.error(`[StagedUploads] Failed to clean up upload ${upload.id}:`, error);
      }
    }
    removed += removedThisBatch;
    // Stop when the batch was the last one, or when nothing in it could be
    // removed — the same rows would only come back on the next query.
    if (expired.length < CLEANUP_BATCH_SIZE || removedThisBatch === 0) break;
  }
  return removed;
}
