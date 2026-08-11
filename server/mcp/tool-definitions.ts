import { z } from 'zod';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import type { ProviderRepository } from '../db/provider-repository';
import type { S3Storage } from '../storage/s3-storage';
import type { QueueManager } from '../queue/queue-manager';
import type { ExportManager, ExportTask } from '../queue/export-manager';
import type { ProjectEventPublisher } from '../live/project-live-hub';
import { checkStorageLimit } from '../utils/storage-check';
import {
  ProjectExportError,
  startProjectAlbumExport,
  startProjectBundleExport,
  type StartedProjectExport,
} from '../services/project-export';
import { createAppUrlBuilder, type AppUrlBuilder } from './app-urls';
import { generateJobs } from '../../src/lib/remixEngine';
import {
  DEFAULT_AUDIO_PROJECT_CONFIG,
  parseAudioProjectConfig,
  PROVIDER_MODELS_MAP,
} from '../../src/types';
import type { Job, Library, ModelConfig, Project } from '../../src/types';

const MODEL_CATEGORY_VALUES = ['text', 'image', 'audio', 'video'] as const;
const PROVIDER_TYPE_VALUES = Object.keys(PROVIDER_MODELS_MAP) as [
  keyof typeof PROVIDER_MODELS_MAP,
  ...(keyof typeof PROVIDER_MODELS_MAP)[]
];
const WORKFLOW_ITEM_TYPES = [
  'text',
  'library',
  'text_from_library', 'text_library',
  'image', 'image_from_library', 'image_library',
  'audio', 'audio_from_library', 'audio_library',
  'video', 'video_from_library', 'video_library',
] as const;
const SOCIAL_ACCOUNT_STATUS_VALUES = ['active', 'disconnected', 'expired'] as const;
const CAMPAIGN_STATUS_VALUES = ['active', 'completed', 'archived'] as const;
const MCP_POST_STATUS_VALUES = ['draft', 'scheduled'] as const;
// Posts also reach 'completed'/'failed' through the publishing engine, so reads
// can filter on states the write tools are not allowed to set.
const POST_STATUS_FILTER_VALUES = ['draft', 'scheduled', 'completed', 'failed'] as const;
const POST_MEDIA_TYPE_VALUES = ['image', 'video', 'gif'] as const;
const SAFE_SOCIAL_ACCOUNT_SELECT = {
  id: true,
  platform: true,
  accountId: true,
  profileName: true,
  avatarUrl: true,
  scopes: true,
  expiresAt: true,
  status: true,
  rateLimitResetAt: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Shared tool registry for Remix Studio.
 *
 * Both `server/mcp/mcp-server.ts` (for external MCP clients over HTTP) and
 * `server/assistant/` (for the in-app assistant, invoked in-process) register
 * tools from this single source. Handlers are transport-agnostic and take a
 * resolved `userId` plus already-validated input.
 */

export interface ToolResult {
  /** Primary text payload fed back to the model. */
  text: string;
  /** Optional structured payload for clients that can render it. */
  structuredContent?: unknown;
  /** When true, signals the caller the tool failed. */
  isError?: boolean;
}

export type ToolCategory = 'read' | 'mutate' | 'destructive';

export interface AssistantToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  /**
   * Zod shape (record of field schemas) — compatible with MCP SDK's
   * `registerTool({ inputSchema })` and can be wrapped with `z.object(shape)`
   * for in-process validation by the assistant runner.
   */
  inputSchema: Shape;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  category: ToolCategory;
  /** Optional explicit override. When omitted, non-read tools are gated for
   *  confirmation by the assistant runner and external MCP transport. */
  requiresConfirmation?: boolean;
  handler: (userId: string, input: any) => Promise<ToolResult>;
}

export interface ToolDependencies {
  repository: IRepository;
  userRepository: UserRepository;
  prisma: PrismaClient;
  providerRepository: ProviderRepository;
  /** Media bucket, used to mint presigned download URLs for owned storage keys. */
  storage: S3Storage;
  /** Archive bucket: storage-quota checks, and where finished exports land. */
  exportStorage: S3Storage;
  /** Generation queue, used to enqueue jobs the tools move to 'pending'. */
  queueManager: QueueManager;
  /** Queue that builds export archives in the background. */
  exportManager: ExportManager;
  /** Optional live-update hub so open project views refresh after job changes. */
  projectEvents?: ProjectEventPublisher;
  /**
   * Public origin used to build browser links (library/project/campaign URLs)
   * returned by tools. Only consulted when `APP_URL` is not configured.
   */
  appBaseUrl?: string;
}

const MAX_CONTENT_PREVIEW_CHARS = 4096;
// A page of posts carries many bodies at once, so previews stay short — callers
// fetch the full copy with get_post_text once they know which post they want.
const MAX_POST_PREVIEW_CHARS = 280;
const MAX_DRAFT_JOBS_PER_CALL = 200;
const MAX_JOB_FILENAME_LENGTH = 200;
/** Same rough per-job reservation the REST job routes use for quota checks. */
const JOB_STORAGE_ESTIMATE_BYTES = 25 * 1024 * 1024;
/** Fallback quota for users created before a limit was stored on the record. */
const DEFAULT_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_SIGNED_KEYS_PER_CALL = 50;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const MAX_SIGNED_URL_TTL_SECONDS = 86400;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function paginationHints(page: number, pages: number) {
  const hasMore = page < pages;
  return { hasMore, nextPage: hasMore ? page + 1 : null };
}

function paginateItems<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    pages,
    ...paginationHints(page, pages),
  };
}

function matchesSearchQuery(fields: Array<string | undefined>, query?: string) {
  if (!query) return true;
  return fields.some((field) => field?.toLowerCase().includes(query));
}

function truncateContent(content: string, maxLen: number = MAX_CONTENT_PREVIEW_CHARS): {
  text: string;
  truncated: boolean;
  originalLength: number;
} {
  if (content.length <= maxLen) {
    return { text: content, truncated: false, originalLength: content.length };
  }
  return {
    text: content.slice(0, maxLen),
    truncated: true,
    originalLength: content.length,
  };
}

function parseScheduledAt(value: string | undefined, fieldName = 'scheduledAt'): Date | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date string`);
  }
  if (date.getTime() < Date.now()) {
    throw new Error(`${fieldName} must not be in the past`);
  }
  return date;
}

async function resolveOwnedSocialAccountIds(
  prisma: PrismaClient,
  userId: string,
  socialAccountIds: string[] | undefined,
) {
  if (socialAccountIds === undefined) return undefined;

  const uniqueIds = [...new Set(socialAccountIds)];
  if (uniqueIds.length === 0) return [];

  const owned = await prisma.socialAccount.findMany({
    where: { userId, id: { in: uniqueIds } },
    select: { id: true },
  });
  if (owned.length !== uniqueIds.length) {
    throw new Error('One or more social accounts were not found');
  }
  return uniqueIds;
}

async function assertCampaignHasActiveSocialAccount(prisma: PrismaClient, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      socialAccounts: {
        where: { status: 'active' },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!campaign || campaign.socialAccounts.length === 0) {
    throw new Error('Cannot schedule post: Campaign has no active linked social accounts.');
  }
}

async function assertPostMediaReady(prisma: PrismaClient, postId: string) {
  const notReady = await prisma.postMedia.count({
    where: {
      postId,
      status: { not: 'ready' },
    },
  });
  if (notReady > 0) {
    throw new Error('Cannot schedule post: Some media is still processing or failed.');
  }
}

function isInternalStorageValue(value: string) {
  return !/^https?:\/\//i.test(value) && !value.startsWith('data:') && !value.startsWith('/');
}

async function assertPostMediaSourceAllowed(
  prisma: PrismaClient,
  userId: string,
  campaignId: string,
  sourceUrl: string,
) {
  const source = sourceUrl.trim();
  if (!source || !isInternalStorageValue(source)) {
    throw new Error('sourceUrl must be an internal storage key owned by the authenticated user');
  }

  const existingCampaignMedia = source.startsWith(`campaigns/${campaignId}/`);
  if (existingCampaignMedia) return source;

  const [libraryMatch, albumMatch, postMediaMatch] = await Promise.all([
    prisma.libraryItem.findFirst({
      where: {
        library: {
          userId,
          type: { in: ['image', 'video'] },
        },
        OR: [
          { content: source },
          { thumbnailUrl: source },
          { optimizedUrl: source },
        ],
      },
      select: { id: true },
    }),
    prisma.albumItem.findFirst({
      where: {
        userId,
        project: {
          userId,
          type: { in: ['image', 'video'] },
        },
        OR: [
          { imageUrl: source },
          { thumbnailUrl: source },
          { optimizedUrl: source },
        ],
      },
      select: { id: true },
    }),
    prisma.postMedia.findFirst({
      where: {
        sourceUrl: source,
        post: { userId },
      },
      select: { id: true },
    }),
  ]);

  if (!libraryMatch && !albumMatch && !postMediaMatch) {
    throw new Error('sourceUrl does not reference media owned by the authenticated user');
  }
  return source;
}

/**
 * Batch ownership check for raw storage keys. A key is signable only when it is
 * still referenced by a record the authenticated user owns — library items,
 * album items, job outputs, or campaign post media. Returns the subset of
 * `keys` that passed, so callers can report the rest as denied.
 */
async function resolveOwnedStorageKeys(
  prisma: PrismaClient,
  userId: string,
  keys: string[],
): Promise<Set<string>> {
  const candidates = [...new Set(keys.map((key) => key.trim()).filter((key) => key && isInternalStorageValue(key)))];
  if (candidates.length === 0) return new Set();

  const inList = { in: candidates };
  const [libraryItems, albumItems, jobs, postMedia] = await Promise.all([
    prisma.libraryItem.findMany({
      where: {
        library: { userId },
        OR: [{ content: inList }, { thumbnailUrl: inList }, { optimizedUrl: inList }],
      },
      select: { content: true, thumbnailUrl: true, optimizedUrl: true },
    }),
    prisma.albumItem.findMany({
      where: {
        userId,
        OR: [{ imageUrl: inList }, { thumbnailUrl: inList }, { optimizedUrl: inList }],
      },
      select: { imageUrl: true, thumbnailUrl: true, optimizedUrl: true },
    }),
    prisma.job.findMany({
      where: {
        userId,
        OR: [{ imageUrl: inList }, { thumbnailUrl: inList }, { optimizedUrl: inList }],
      },
      select: { imageUrl: true, thumbnailUrl: true, optimizedUrl: true },
    }),
    prisma.postMedia.findMany({
      where: {
        post: { userId },
        OR: [{ sourceUrl: inList }, { processedUrl: inList }, { thumbnailUrl: inList }],
      },
      select: { sourceUrl: true, processedUrl: true, thumbnailUrl: true },
    }),
  ]);

  // A row can match on one column while its other columns hold keys the caller
  // never asked for, so every value is re-checked against the requested set.
  const requested = new Set(candidates);
  const owned = new Set<string>();
  const allow = (value?: string | null) => {
    if (value && requested.has(value)) owned.add(value);
  };
  for (const item of libraryItems) {
    allow(item.content);
    allow(item.thumbnailUrl);
    allow(item.optimizedUrl);
  }
  for (const item of albumItems) {
    allow(item.imageUrl);
    allow(item.thumbnailUrl);
    allow(item.optimizedUrl);
  }
  for (const job of jobs) {
    allow(job.imageUrl);
    allow(job.thumbnailUrl);
    allow(job.optimizedUrl);
  }
  for (const media of postMedia) {
    allow(media.sourceUrl);
    allow(media.processedUrl);
    allow(media.thumbnailUrl);
  }
  return owned;
}

function basenameForKey(key: string): string {
  const name = key.split('/').pop() || 'download';
  return name.replace(/["\\]/g, '');
}

/**
 * Mirror of the project viewer's job filename builder: a readable slug made of
 * the project prefix plus the tags/titles of the library items that composed
 * the prompt, suffixed with a short uuid so two identical combinations never
 * collide in storage.
 */
function buildJobFilename(filenameParts: string[], suffixId: string): string {
  const safeSuffixId = suffixId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const readableName = filenameParts
    .filter(Boolean)
    .join('_')
    .replace(/[^a-zA-Z0-9-_]/g, '_');
  const separator = readableName ? '_' : '';
  const maxReadableLength = Math.max(0, MAX_JOB_FILENAME_LENGTH - separator.length - safeSuffixId.length);

  return `${readableName.substring(0, maxReadableLength)}${separator}${safeSuffixId}`;
}

/**
 * Per-job generation settings, resolved from the project and — where the
 * project leaves a field unset — from the first option the model advertises.
 * Matches what the project viewer writes onto drafts it creates.
 */
function buildJobSettings(project: Project, model: ModelConfig | undefined): Partial<Job> {
  const type = project.type ?? 'image';

  if (type === 'text') return {};

  if (type === 'audio') {
    const audioConfig = project.systemPrompt
      ? parseAudioProjectConfig(project.systemPrompt)
      : DEFAULT_AUDIO_PROJECT_CONFIG;
    const isMusic = audioConfig.kind === 'remix-audio-music';
    return {
      quality: isMusic
        ? (audioConfig.mode === 'instrumental' ? 'instrumental' : 'with-lyrics')
        : audioConfig.speakers[0].voice,
      background: isMusic ? 'music' : audioConfig.mode,
      format: (project.format
        || model?.options.audioFormats?.[0]
        || (isMusic ? 'mp3' : 'wav')) as Job['format'],
    };
  }

  const common: Partial<Job> = {
    aspectRatio: project.aspectRatio || model?.options.aspectRatios?.[0] || '1024x1024',
    quality: project.quality || model?.options.qualities?.[0] || 'standard',
    background: project.background || model?.options.backgrounds?.[0],
  };

  if (type === 'video') {
    return {
      ...common,
      duration: project.duration || model?.options.durations?.[0] || 4,
      resolution: project.resolution || model?.options.resolutions?.[0] || '720p',
      sound: project.sound || 'on',
      format: 'mp4',
    };
  }

  return { ...common, format: (project.format || 'png') as Job['format'] };
}

const EXPORT_POLL_INTERVAL_MS = 2000;
const DEFAULT_EXPORT_WAIT_SECONDS = 120;
const MAX_EXPORT_WAIT_SECONDS = 600;

/**
 * Archives are built by a background worker, so a tool call waits on the task
 * rather than owning the work. Returns as soon as the task settles, or when the
 * caller's wait budget runs out — whichever comes first.
 */
async function waitForExportTask(
  exportManager: ExportManager,
  userId: string,
  taskId: string,
  waitSeconds: number,
): Promise<ExportTask | undefined> {
  const deadline = Date.now() + waitSeconds * 1000;
  let task = await exportManager.getTask(userId, taskId);

  while (task && (task.status === 'pending' || task.status === 'processing')) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(EXPORT_POLL_INTERVAL_MS, remaining)));
    task = await exportManager.getTask(userId, taskId);
  }

  return task;
}

function describeExportTask(task: ExportTask, toolName: string, appUrls: AppUrlBuilder) {
  const settled = task.status === 'completed' || task.status === 'failed';
  return {
    taskId: task.id,
    status: task.status,
    projectId: task.projectId ?? null,
    projectUrl: task.projectId ? appUrls.project(task.projectId) : null,
    projectName: task.projectName,
    packageName: task.packageName ?? null,
    filesArchived: task.current,
    filesTotal: task.total,
    size: task.size ?? null,
    sizeFormatted: task.size ? formatSize(task.size) : null,
    downloadUrl: task.downloadUrl ?? null,
    error: task.error ?? null,
    hint: task.status === 'completed'
      ? 'downloadUrl is a temporary link (valid ~24h). The archive also stays in the user\'s exports list.'
      : settled
        ? 'The export did not produce an archive. Read "error" before retrying.'
        : `Still building. Call ${toolName} again with task_id="${task.id}" to keep waiting — do not start a second export.`,
  };
}

function toToolWorkflowItem(item: {
  id?: string;
  type: string;
  value?: string;
  selectedTags?: string[];
  disabled?: boolean;
  thumbnailUrl?: string;
  optimizedUrl?: string;
}) {
  const isLibrary = item.type === 'library';
  return {
    id: item.id,
    itemType: isLibrary ? 'library' : item.type,
    value: isLibrary ? undefined : item.value ?? '',
    libraryId: isLibrary ? item.value ?? '' : undefined,
    selectedTags: item.selectedTags,
    disabled: item.disabled ?? false,
    thumbnailUrl: item.thumbnailUrl,
    optimizedUrl: item.optimizedUrl,
  };
}

export function createAssistantToolDefinitions(deps: ToolDependencies): AssistantToolDefinition[] {
  const { repository, userRepository, prisma, providerRepository, storage, exportStorage, exportManager, queueManager, projectEvents } = deps;
  const exportDeps = { repository, userRepository, storage, exportStorage, exportManager };
  const appUrls = createAppUrlBuilder(deps.appBaseUrl);

  const tools: AssistantToolDefinition[] = [];

  /** Draft / queue / done / album tallies for one project, shared by the job tools. */
  async function readProjectCounts(userId: string, projectId: string) {
    const [statusCounts, album] = await Promise.all([
      repository.countProjectJobsByStatus(userId, projectId),
      repository.getProjectAlbum(userId, projectId, { limit: 1 }),
    ]);

    return {
      drafts: statusCounts.draft,
      pending: statusCounts.pending,
      processing: statusCounts.processing,
      queued: statusCounts.pending + statusCounts.processing,
      completed: statusCounts.completed,
      failed: statusCounts.failed,
      totalJobs:
        statusCounts.draft + statusCounts.pending + statusCounts.processing
        + statusCounts.completed + statusCounts.failed,
      albumItems: album.total,
    };
  }

  /**
   * Reserve quota for jobs that are about to occupy storage, using the same
   * per-job estimate as the REST routes so both paths refuse at the same point.
   */
  async function assertStorageHeadroom(userId: string, jobCount: number): Promise<ToolResult | null> {
    if (jobCount <= 0) return null;

    const { allowed, currentUsage, limit } = await checkStorageLimit(
      userId,
      jobCount * JOB_STORAGE_ESTIMATE_BYTES,
      userRepository,
      storage,
      exportStorage,
      repository,
    );
    if (allowed) return null;

    return {
      text: JSON.stringify({
        error: 'Storage limit exceeded.',
        remainingBytes: Math.max(0, limit - currentUsage),
        requiredBytes: jobCount * JOB_STORAGE_ESTIMATE_BYTES,
        message: `Storage limit exceeded. Remaining: ${formatSize(Math.max(0, limit - currentUsage))}. Required for ${jobCount} job${jobCount === 1 ? '' : 's'}: ~${formatSize(jobCount * JOB_STORAGE_ESTIMATE_BYTES)}.`,
      }),
      isError: true,
    };
  }

  // ─── get_current_account ───
  tools.push({
    name: 'get_current_account',
    title: 'Get Current Account',
    description: 'Identify the Remix Studio account this session is acting as ("who am I?"). Returns the user id, email, role ("admin" or "user"), account status, storage limit, sign-in methods, and account timestamps. Every other tool operates on this account. Call it when the user asks who they are signed in as, when confirming that a token belongs to the expected account, or before an action whose availability depends on their role. For actual storage consumption, call get_storage_usage.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
      const user = await userRepository.findById(userId);
      if (!user) {
        return {
          text: JSON.stringify({ error: 'The authenticated account no longer exists.' }),
          isError: true,
        };
      }

      const storageLimit = user.storageLimit || DEFAULT_STORAGE_LIMIT_BYTES;
      const response = {
        id: user.sk,
        email: user.email,
        role: user.role,
        status: user.status,
        storageLimit,
        storageLimitFormatted: formatSize(storageLimit),
        hasPassword: Boolean(user.passwordHash),
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        createdAt: new Date(user.createdAt).toISOString(),
        updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
        lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── create_library ───
  tools.push({
    name: 'create_library',
    title: 'Create Library',
    description: 'Create a new library of a specific type (text, image, audio, video). Description is optional and should explain what the library contains or when to use it. Returns the library "url" — share it with the user so they can open the new library.',
    inputSchema: {
      name: z.string().min(1).max(256).describe('Library name'),
      description: z.string().max(2000).optional().describe('Optional library description explaining what it contains or how it should be used'),
      type: z.enum(['text', 'image', 'audio', 'video']).default('text').describe('Library type (default "text")'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { name, description, type } = input as { name: string; description?: string; type: 'text' | 'image' | 'audio' | 'video' };
      const id = crypto.randomUUID();
      const nextDescription = description?.trim() || undefined;
      await repository.createLibrary(userId, { id, name, description: nextDescription, type });
      return {
        text: JSON.stringify({ id, name, description: nextDescription ?? null, type, url: appUrls.library(id), message: 'Library created successfully' }),
      };
    },
  });

  // ─── update_library ───
  tools.push({
    name: 'update_library',
    title: 'Update Library',
    description: 'Update an existing library name and/or description. Only provided fields are changed. Returns the library "url" so it can be linked back to the user.',
    inputSchema: {
      library_id: z.string().describe('The library ID to update'),
      name: z.string().min(1).max(256).optional().describe('New library name'),
      description: z.string().max(2000).optional().describe('New library description. Pass an empty string to clear it.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, name, description } = input as { library_id: string; name?: string; description?: string };
      const nextName = name?.trim();
      const hasDescription = description !== undefined;

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }
      if (!nextName && !hasDescription) {
        return { text: JSON.stringify({ error: 'No fields to update. Provide name and/or description.' }), isError: true };
      }

      await repository.updateLibrary(userId, library_id, {
        ...(nextName ? { name: nextName } : {}),
        ...(hasDescription ? { description: description.trim() || null } : {}),
      });
      return {
        text: JSON.stringify({
          library_id,
          url: appUrls.library(library_id),
          name: nextName ?? library.name,
          description: hasDescription ? (description.trim() || null) : (library.description ?? null),
          previousName: library.name,
          previousDescription: library.description ?? null,
          message: 'Library updated successfully.',
        }),
      };
    },
  });

  // ─── create_prompt ───
  tools.push({
    name: 'create_prompt',
    title: 'Create Prompt',
    description: 'Create a text prompt (item) in a library. The content is the prompt text. Tags are optional.',
    inputSchema: {
      library_id: z.string().describe('The library ID to add the prompt to'),
      content: z.string().min(1).describe('The prompt text content'),
      title: z.string().optional().describe('Optional title for the prompt'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, content, title, tags } = input as {
        library_id: string;
        content: string;
        title?: string;
        tags?: string[];
      };
      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }
      const id = crypto.randomUUID();
      await repository.createLibraryItem(userId, library_id, { id, content, title, tags });
      return {
        text: JSON.stringify({ id, library_id, libraryUrl: appUrls.library(library_id), name: library.name, title, tags, message: 'Prompt created successfully' }),
      };
    },
  });

  // ─── batch_create_prompts ───
  tools.push({
    name: 'batch_create_prompts',
    title: 'Batch Create Prompts',
    description: 'Create multiple text prompts (library items) in a library in a single batch. Each item requires content; title and tags are optional. Batches of about 20-25 items work best: large enough to finish a big library quickly, small enough to stay inside the output token limit and keep each prompt well written. When the user asks for more items than one batch should carry, keep calling this tool in later turns until the full requested count exists — the result reports libraryTotal so you can check progress against the target. Never stop at the first batch and report the job done while items remain.',
    inputSchema: {
      library_id: z.string().describe('The library ID to add the prompts to'),
      items: z.array(z.object({
        content: z.string().min(1).describe('The prompt text content'),
        title: z.string().optional().describe('Optional title for the prompt'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      })).min(1).max(100).describe('Array of prompts to create (1-100 items). Prefer batches of about 20-25 items; for larger library builds, call this tool repeatedly until all items are created.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, items } = input as {
        library_id: string;
        items: { content: string; title?: string; tags?: string[] }[];
      };
      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }
      const libraryItems = items.map((item) => ({
        id: crypto.randomUUID(),
        content: item.content,
        title: item.title,
        tags: item.tags,
      }));
      await repository.createLibraryItemsBatch(userId, library_id, libraryItems);
      // libraryTotal lets the model compare progress against the requested
      // count and decide whether another batch is still owed.
      const libraryTotal = (library.items?.length ?? 0) + libraryItems.length;
      return {
        text: JSON.stringify({
          library_id,
          libraryUrl: appUrls.library(library_id),
          name: library.name,
          created: libraryItems.map((item) => ({ id: item.id, title: item.title })),
          count: libraryItems.length,
          libraryTotal,
          message: `${libraryItems.length} prompts created successfully. Library now holds ${libraryTotal} prompts — if the user asked for more than that, continue with another batch.`,
        }),
      };
    },
  });

  // ─── update_prompt ───
  tools.push({
    name: 'update_prompt',
    title: 'Update Prompt',
    description: 'Update a text prompt in a text library. Only the fields you provide will be changed. Use get_library_items or search_library_items first to find the prompt item id.',
    inputSchema: {
      library_id: z.string().describe('The text library ID that contains the prompt'),
      item_id: z.string().describe('The prompt item ID to update'),
      content: z.string().min(1).optional().describe('New prompt text content'),
      title: z.string().optional().describe('New prompt title (pass empty string to clear)'),
      tags: z.array(z.string()).optional().describe('Replacement tag list (pass [] to clear all tags)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, item_id, content, title, tags } = input as {
        library_id: string;
        item_id: string;
        content?: string;
        title?: string;
        tags?: string[];
      };

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }
      if (library.type !== 'text') {
        return { text: JSON.stringify({ error: `Library "${library.name}" is type "${library.type}", not a text prompt library.` }), isError: true };
      }

      const existingItem = library.items.find((item) => item.id === item_id);
      if (!existingItem) {
        return { text: JSON.stringify({ error: `Prompt "${item_id}" not found in library "${library.name}".` }), isError: true };
      }

      const updates: { content?: string; title?: string; tags?: string[] } = {};
      if (content !== undefined) updates.content = content;
      if (title !== undefined) updates.title = title;
      if (tags !== undefined) updates.tags = tags;

      if (Object.keys(updates).length === 0) {
        return { text: JSON.stringify({ error: 'No fields to update. Provide at least one of: content, title, tags.' }), isError: true };
      }

      try {
        await repository.updateLibraryItem(userId, library_id, item_id, updates);
        return {
          text: JSON.stringify({
            item_id,
            library_id,
            libraryUrl: appUrls.library(library_id),
            libraryName: library.name,
            title: title ?? existingItem.title ?? null,
            updatedFields: Object.keys(updates),
            message: 'Prompt updated successfully.',
          }),
        };
      } catch (err: any) {
        return { text: JSON.stringify({ error: err.message ?? 'Update failed.' }), isError: true };
      }
    },
  });

  // ─── delete_prompt ───
  tools.push({
    name: 'delete_prompt',
    title: 'Delete Prompt',
    description: 'Delete one text prompt from a text library. Use get_library_items or search_library_items first to find the prompt item id.',
    inputSchema: {
      library_id: z.string().describe('The text library ID that contains the prompt'),
      item_id: z.string().describe('The prompt item ID to delete'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    category: 'destructive',
    handler: async (userId, input) => {
      const { library_id, item_id } = input as {
        library_id: string;
        item_id: string;
      };

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }
      if (library.type !== 'text') {
        return { text: JSON.stringify({ error: `Library "${library.name}" is type "${library.type}", not a text prompt library.` }), isError: true };
      }

      const existingItem = library.items.find((item) => item.id === item_id);
      if (!existingItem) {
        return { text: JSON.stringify({ error: `Prompt "${item_id}" not found in library "${library.name}".` }), isError: true };
      }

      try {
        await repository.deleteLibraryItem(userId, library_id, item_id);
        return {
          text: JSON.stringify({
            item_id,
            library_id,
            libraryUrl: appUrls.library(library_id),
            libraryName: library.name,
            title: existingItem.title ?? null,
            message: 'Prompt deleted successfully.',
          }),
        };
      } catch (err: any) {
        return { text: JSON.stringify({ error: err.message ?? 'Delete failed.' }), isError: true };
      }
    },
  });

  // ─── search_library_items ───
  tools.push({
    name: 'search_library_items',
    title: 'Search Library Items',
    description: 'Search library items by keyword (matches content and title) and/or tags. Returns matching items with their library context, including the owning library\'s "libraryUrl" so results can be linked back to the app. Long content is truncated in the preview.',
    inputSchema: {
      query: z.string().optional().describe('Optional search keyword to match against item content and title'),
      library_id: z.string().optional().describe('Optional: limit search to a specific library'),
      tags: z.array(z.string()).optional().describe('Optional: filter by tags (items must contain ALL specified tags)'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { query, library_id, tags, page, limit } = input as {
        query?: string;
        library_id?: string;
        tags?: string[];
        page: number;
        limit: number;
      };
      const result = await repository.searchLibraryItems(userId, query?.trim(), {
        libraryId: library_id,
        tags,
        page,
        limit,
      });
      const items = result.items.map((item) => {
        const preview = truncateContent(item.content ?? '');
        return {
          id: item.id,
          libraryId: item.libraryId,
          libraryUrl: appUrls.library(item.libraryId),
          libraryName: item.libraryName,
          libraryDescription: item.libraryDescription ?? null,
          content: preview.text,
          contentTruncated: preview.truncated,
          contentLength: preview.originalLength,
          title: item.title,
          tags: item.tags,
        };
      });
      const response = {
        items,
        total: result.total,
        page: result.page,
        pages: result.pages,
        ...paginationHints(result.page, result.pages),
      };
      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── get_storage_usage ───
  tools.push({
    name: 'get_storage_usage',
    title: 'Get Storage Usage',
    description: 'Get storage usage summary for the authenticated user. Returns total usage, storage limit, and breakdown by category (projects, campaigns, libraries, archives, trash). Computed via SQL aggregates — cheap to call.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
      const [breakdown, userRecord] = await Promise.all([
        repository.getStorageUsageAggregate(userId),
        userRepository.findById(userId),
      ]);

      const storageLimit = userRecord?.storageLimit || DEFAULT_STORAGE_LIMIT_BYTES;
      const totalSize = breakdown.projects + breakdown.campaigns + breakdown.libraries + breakdown.archives + breakdown.trash;

      return {
        text: JSON.stringify({
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
          limit: storageLimit,
          limitFormatted: formatSize(storageLimit),
          usagePercent: Number(((totalSize / storageLimit) * 100).toFixed(1)),
          categories: {
            projects: { size: breakdown.projects, formatted: formatSize(breakdown.projects) },
            campaigns: { size: breakdown.campaigns, formatted: formatSize(breakdown.campaigns) },
            libraries: { size: breakdown.libraries, formatted: formatSize(breakdown.libraries) },
            archives: { size: breakdown.archives, formatted: formatSize(breakdown.archives) },
            trash: { size: breakdown.trash, formatted: formatSize(breakdown.trash) },
          },
        }, null, 2),
      };
    },
  });

  // ─── list_albums ───
  tools.push({
    name: 'list_albums',
    title: 'List Albums',
    description: 'List project albums for the authenticated user, with project descriptions, album item count, total album size, and the "projectUrl" that opens each project in Remix Studio. Defaults to active projects only — pass status="archived" or "all" to include archived.',
    inputSchema: {
      status: z.enum(['active', 'archived', 'all']).default('active').describe('Project status filter (default "active")'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { status, page, limit } = input as {
        status: 'active' | 'archived' | 'all';
        page: number;
        limit: number;
      };
      const projectsResult = await repository.getUserProjects(userId, page, limit, undefined, status);
      const projectIds = projectsResult.items.map((p) => p.id);
      const statsByProject = await repository.getAlbumStatsByProject(userId, projectIds);

      const albums = projectsResult.items.map((project) => {
        const stats = statsByProject[project.id] ?? { itemCount: 0, totalSize: 0 };
        return {
          projectId: project.id,
          projectUrl: appUrls.project(project.id),
          projectName: project.name,
          projectDescription: project.description ?? null,
          projectStatus: project.status,
          itemCount: stats.itemCount,
          totalSize: stats.totalSize,
          totalSizeFormatted: formatSize(stats.totalSize),
        };
      });

      return {
        text: JSON.stringify({
          albums,
          total: projectsResult.total,
          page: projectsResult.page,
          pages: projectsResult.pages,
          ...paginationHints(projectsResult.page, projectsResult.pages),
        }, null, 2),
      };
    },
  });

  // ─── get_album_items ───
  tools.push({
    name: 'get_album_items',
    title: 'Get Album Items',
    description: `Browse the generated items saved in one project's album. Returns each item's id, prompt, format, size, aspect ratio, and its storage keys (storageKey for the full-size file, plus thumbnail/optimized variants when present).

Storage keys are internal references, not fetchable URLs — pass them to get_file_urls to obtain a temporary download URL.`,
    inputSchema: {
      project_id: z.string().min(1).describe('The project ID whose album to browse (from list_albums)'),
      sort: z.enum(['newest', 'oldest']).default('newest').describe('Sort order by creation time (default "newest")'),
      aspect_ratios: z.array(z.string()).optional().describe('Optional: only return items matching these aspect ratios (e.g. ["1:1", "16:9"])'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Items per page (default 25)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { project_id, sort, aspect_ratios, page, limit } = input as {
        project_id: string;
        sort: 'newest' | 'oldest';
        aspect_ratios?: string[];
        page: number;
        limit: number;
      };

      const project = await repository.getProject(userId, project_id);
      if (!project) {
        return {
          text: JSON.stringify({ error: `Project "${project_id}" not found.` }),
          isError: true,
        };
      }

      const album = await repository.getProjectAlbum(userId, project_id, {
        page,
        limit,
        sort,
        aspectRatios: aspect_ratios,
      });

      const items = album.items.map((item) => {
        const preview = truncateContent(item.prompt ?? '');
        return {
          id: item.id,
          jobId: item.jobId ?? null,
          prompt: preview.text,
          promptTruncated: preview.truncated,
          storageKey: item.imageUrl || null,
          thumbnailKey: item.thumbnailUrl ?? null,
          optimizedKey: item.optimizedUrl ?? null,
          format: item.format ?? null,
          aspectRatio: item.aspectRatio ?? null,
          size: item.size ?? null,
          sizeFormatted: item.size ? formatSize(item.size) : null,
          createdAt: item.createdAt,
        };
      });

      const response = {
        projectId: project.id,
        projectUrl: appUrls.project(project.id),
        projectName: project.name,
        projectType: project.type,
        items,
        total: album.total,
        page: album.page,
        pages: album.pages,
        totalSize: album.totalSize,
        totalSizeFormatted: formatSize(album.totalSize),
        aspectRatioCounts: album.aspectRatioCounts,
        ...paginationHints(album.page, album.pages),
        hint: 'Pass storageKey / thumbnailKey / optimizedKey to get_file_urls to download or view a file.',
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── export_project ───
  tools.push({
    name: 'export_project',
    title: 'Export Project',
    description: `Package one whole project into a portable .zip bundle: its settings, workflow, album metadata, and every media file those reference. The bundle can be imported into another Remix Studio installation, so this is the tool for backing up or moving a project — not for handing the user plain image files (use export_project_album for that).

The archive is built in the background. The call waits up to wait_seconds for it to finish and returns a temporary download URL when it does; if it is still building, re-call with the returned task_id to keep waiting instead of starting a second export. Finished archives also appear in the user's exports list and count against their storage quota.`,
    inputSchema: {
      project_id: z.string().min(1).optional().describe('The project ID to export (from list_albums). Required unless task_id is given.'),
      package_name: z.string().min(1).max(200).optional().describe('Optional archive filename (default "<project name>_Project.zip")'),
      task_id: z.string().min(1).optional().describe('Resume waiting on an export already started by this tool. When set, no new export is started and project_id is ignored.'),
      wait_seconds: z
        .number()
        .int()
        .min(0)
        .max(MAX_EXPORT_WAIT_SECONDS)
        .default(DEFAULT_EXPORT_WAIT_SECONDS)
        .describe(`How long to wait for the archive before returning progress (default ${DEFAULT_EXPORT_WAIT_SECONDS}s, max ${MAX_EXPORT_WAIT_SECONDS}s)`),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { project_id, package_name, task_id, wait_seconds } = input as {
        project_id?: string;
        package_name?: string;
        task_id?: string;
        wait_seconds: number;
      };

      let taskId = task_id?.trim();
      if (!taskId) {
        if (!project_id?.trim()) {
          return { text: JSON.stringify({ error: 'project_id is required unless task_id is provided.' }), isError: true };
        }
        try {
          const started: StartedProjectExport = await startProjectBundleExport(exportDeps, userId, {
            projectId: project_id.trim(),
            packageName: package_name,
          });
          taskId = started.taskId;
        } catch (e) {
          if (e instanceof ProjectExportError) {
            return { text: JSON.stringify({ error: e.message }), isError: true };
          }
          throw e;
        }
      }

      const task = await waitForExportTask(exportManager, userId, taskId, wait_seconds);
      if (!task) {
        return { text: JSON.stringify({ error: `Export task "${taskId}" not found.` }), isError: true };
      }

      const response = describeExportTask(task, 'export_project', appUrls);
      return { text: JSON.stringify(response, null, 2), structuredContent: response };
    },
  });

  // ─── export_project_album ───
  tools.push({
    name: 'export_project_album',
    title: 'Export Project Album',
    description: `Package the media files saved in one project's album into a .zip the user can download. Exports the entire album by default — pass item_ids only when the user asked for a specific subset (ids come from get_album_items).

The archive is built in the background. The call waits up to wait_seconds for it to finish and returns a temporary download URL when it does; if it is still building, re-call with the returned task_id to keep waiting instead of starting a second export. Finished archives also appear in the user's exports list and count against their storage quota.

For a single file, get_file_urls is cheaper — it needs no archive. To move a project between installations, use export_project instead.`,
    inputSchema: {
      project_id: z.string().min(1).optional().describe('The project ID whose album to export (from list_albums). Required unless task_id is given.'),
      item_ids: z
        .array(z.string().min(1))
        .optional()
        .describe('Optional album item IDs to export. Omit to export the whole album (the default).'),
      export_version: z
        .enum(['raw', 'optimized'])
        .default('raw')
        .describe('Which asset variant to archive: "raw" originals (default) or "optimized" smaller variants where available'),
      package_name: z.string().min(1).max(200).optional().describe('Optional archive filename (default "<project name>_Album.zip")'),
      task_id: z.string().min(1).optional().describe('Resume waiting on an export already started by this tool. When set, no new export is started and the other inputs are ignored.'),
      wait_seconds: z
        .number()
        .int()
        .min(0)
        .max(MAX_EXPORT_WAIT_SECONDS)
        .default(DEFAULT_EXPORT_WAIT_SECONDS)
        .describe(`How long to wait for the archive before returning progress (default ${DEFAULT_EXPORT_WAIT_SECONDS}s, max ${MAX_EXPORT_WAIT_SECONDS}s)`),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { project_id, item_ids, export_version, package_name, task_id, wait_seconds } = input as {
        project_id?: string;
        item_ids?: string[];
        export_version: 'raw' | 'optimized';
        package_name?: string;
        task_id?: string;
        wait_seconds: number;
      };

      let taskId = task_id?.trim();
      if (!taskId) {
        if (!project_id?.trim()) {
          return { text: JSON.stringify({ error: 'project_id is required unless task_id is provided.' }), isError: true };
        }
        try {
          const started: StartedProjectExport = await startProjectAlbumExport(exportDeps, userId, {
            projectId: project_id.trim(),
            itemIds: item_ids?.length ? item_ids : undefined,
            packageName: package_name,
            exportVersion: export_version,
          });
          taskId = started.taskId;
        } catch (e) {
          if (e instanceof ProjectExportError) {
            return { text: JSON.stringify({ error: e.message }), isError: true };
          }
          throw e;
        }
      }

      const task = await waitForExportTask(exportManager, userId, taskId, wait_seconds);
      if (!task) {
        return { text: JSON.stringify({ error: `Export task "${taskId}" not found.` }), isError: true };
      }

      const response = describeExportTask(task, 'export_project_album', appUrls);
      return { text: JSON.stringify(response, null, 2), structuredContent: response };
    },
  });

  // ─── get_file_urls ───
  tools.push({
    name: 'get_file_urls',
    title: 'Get File URLs',
    description: `Mint temporary, presigned HTTPS URLs for stored files so they can be fetched, viewed, or downloaded. Input is one or more internal storage keys — the values returned as storageKey/thumbnailKey/optimizedKey by get_album_items and get_library_items, or sourceUrl/processedUrl/thumbnailUrl on campaign post media from get_post.

Only keys still referenced by the authenticated user's own library items, album items, job outputs, or campaign post media can be signed; anything else comes back under "denied" instead of "urls". Full public URLs (http://, https://, data:) are rejected — they need no signing.

Set download=true to get a URL that saves as a file (Content-Disposition: attachment) instead of rendering inline. URLs expire after expires_in seconds (default 1 hour, max 24 hours); mint fresh ones rather than storing them. When the deployment serves media from a public custom domain, the returned URL is a direct public URL rather than a signed one.`,
    inputSchema: {
      keys: z
        .array(z.string().min(1))
        .min(1)
        .max(MAX_SIGNED_KEYS_PER_CALL)
        .describe(`Internal storage keys to sign (max ${MAX_SIGNED_KEYS_PER_CALL} per call)`),
      expires_in: z
        .number()
        .int()
        .min(60)
        .max(MAX_SIGNED_URL_TTL_SECONDS)
        .default(DEFAULT_SIGNED_URL_TTL_SECONDS)
        .describe(`URL lifetime in seconds (default ${DEFAULT_SIGNED_URL_TTL_SECONDS}, max ${MAX_SIGNED_URL_TTL_SECONDS})`),
      download: z
        .boolean()
        .default(false)
        .describe('When true, the URL forces a file download (attachment) instead of inline display'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { keys, expires_in, download } = input as {
        keys: string[];
        expires_in: number;
        download: boolean;
      };

      const requested = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
      const external = requested.filter((key) => !isInternalStorageValue(key));
      const internal = requested.filter((key) => isInternalStorageValue(key));
      const owned = await resolveOwnedStorageKeys(prisma, userId, internal);

      const denied = [
        ...external.map((key) => ({
          key,
          reason: 'Not an internal storage key — already a fetchable URL, no signing needed.',
        })),
        ...internal
          .filter((key) => !owned.has(key))
          .map((key) => ({
            key,
            reason: 'Not found among media owned by the authenticated user (library items, album items, job outputs, or campaign post media).',
          })),
      ];

      const signable = internal.filter((key) => owned.has(key));
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
      const urls = await Promise.all(
        signable.map(async (key) => ({
          key,
          url: await storage.getPresignedUrl(
            key,
            expires_in,
            download ? { responseContentDisposition: `attachment; filename="${basenameForKey(key)}"` } : undefined,
          ),
          filename: basenameForKey(key),
        })),
      );

      const response = {
        urls,
        denied,
        expiresIn: expires_in,
        expiresAt,
        download,
        hint: 'These URLs are temporary. Fetch or hand them to the user promptly, and re-call get_file_urls instead of reusing an expired URL.',
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── list_available_models ───
  tools.push({
    name: 'list_available_models',
    title: 'List Available Models',
    description: 'List AI models the user can actually invoke, as pre-joined (providerId, modelConfigId) tuples. Supports search, filtering, and pagination to keep responses bounded. Use the returned providerId + modelConfigId verbatim when calling create_project_with_workflow.',
    inputSchema: {
      query: z.string().min(1).optional().describe('Optional text search across provider name/type, model name/id, category, and config id'),
      providerType: z.enum(PROVIDER_TYPE_VALUES).optional().describe('Optional exact provider type filter'),
      providerId: z.string().optional().describe('Optional exact saved provider ID filter'),
      category: z.enum(MODEL_CATEGORY_VALUES).optional().describe('Optional exact model category filter'),
      modelConfigId: z.string().optional().describe('Optional exact model config ID filter'),
      includeUnusable: z.boolean().default(false).describe('Include models that have no saved provider configured. Disabled by default to keep responses smaller.'),
      page: z.number().int().min(1).default(1).describe('Page number for paginated results (default 1)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Maximum results per page for each result bucket (default 25)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const {
        query,
        providerType: providerTypeFilter,
        providerId: providerIdFilter,
        category: categoryFilter,
        modelConfigId: modelConfigIdFilter,
        includeUnusable,
        page,
        limit,
      } = input as {
        query?: string;
        providerType?: (typeof PROVIDER_TYPE_VALUES)[number];
        providerId?: string;
        category?: (typeof MODEL_CATEGORY_VALUES)[number];
        modelConfigId?: string;
        includeUnusable: boolean;
        page: number;
        limit: number;
      };
      const normalizedQuery = query?.trim().toLowerCase();
      const savedProviders = await providerRepository.listProviders(userId);

      const providersByType = new Map<string, typeof savedProviders>();
      for (const p of savedProviders) {
        const arr = providersByType.get(p.type) ?? [];
        arr.push(p);
        providersByType.set(p.type, arr);
      }

      const usable: Array<{
        providerId: string;
        providerName: string;
        providerType: string;
        modelConfigId: string;
        modelName: string;
        modelId: string;
        category: string;
        promptLimit?: unknown;
        options?: unknown;
      }> = [];
      const unusable: Array<{
        providerType: string;
        modelConfigId: string;
        modelName: string;
        category: string;
        reason: string;
      }> = [];

      for (const [providerType, models] of Object.entries(PROVIDER_MODELS_MAP)) {
        const instances = providersByType.get(providerType) ?? [];
        for (const m of models) {
          if (instances.length === 0) {
            unusable.push({
              providerType,
              modelConfigId: m.id,
              modelName: m.name,
              category: m.category,
              reason: `No saved ${providerType} provider. Add one under Settings before using this model.`,
            });
            continue;
          }
          for (const instance of instances) {
            usable.push({
              providerId: instance.id,
              providerName: instance.name,
              providerType,
              modelConfigId: m.id,
              modelName: m.name,
              modelId: m.modelId,
              category: m.category,
              promptLimit: m.promptLimit,
              options: m.options,
            });
          }
        }
      }

      const filteredUsable = usable.filter((model) =>
        (!providerTypeFilter || model.providerType === providerTypeFilter) &&
        (!providerIdFilter || model.providerId === providerIdFilter) &&
        (!categoryFilter || model.category === categoryFilter) &&
        (!modelConfigIdFilter || model.modelConfigId === modelConfigIdFilter) &&
        matchesSearchQuery(
          [
            model.providerId,
            model.providerName,
            model.providerType,
            model.modelConfigId,
            model.modelName,
            model.modelId,
            model.category,
          ],
          normalizedQuery,
        )
      );

      const filteredUnusable = includeUnusable
        ? unusable.filter((model) =>
            (!providerTypeFilter || model.providerType === providerTypeFilter) &&
            (!providerIdFilter) &&
            (!categoryFilter || model.category === categoryFilter) &&
            (!modelConfigIdFilter || model.modelConfigId === modelConfigIdFilter) &&
            matchesSearchQuery(
              [
                model.providerType,
                model.modelConfigId,
                model.modelName,
                model.category,
                model.reason,
              ],
              normalizedQuery,
            )
          )
        : [];

      const usablePage = paginateItems(filteredUsable, page, limit);
      const unusablePage = paginateItems(filteredUnusable, page, limit);

      return {
        text: JSON.stringify({
          usableModels: usablePage.items,
          unusableModels: unusablePage.items,
          page,
          limit,
          usableTotal: usablePage.total,
          unusableTotal: unusablePage.total,
          usablePages: usablePage.pages,
          unusablePages: unusablePage.pages,
          usableHasMore: usablePage.hasMore,
          unusableHasMore: includeUnusable ? unusablePage.hasMore : false,
          nextUsablePage: usablePage.nextPage,
          nextUnusablePage: includeUnusable ? unusablePage.nextPage : null,
          appliedFilters: {
            query: query?.trim() || null,
            providerType: providerTypeFilter ?? null,
            providerId: providerIdFilter ?? null,
            category: categoryFilter ?? null,
            modelConfigId: modelConfigIdFilter ?? null,
            includeUnusable,
          },
          note: 'Pass providerId and modelConfigId from a usableModels entry directly to create_project_with_workflow.',
        }, null, 2),
      };
    },
  });

  // ─── list_libraries ───
  tools.push({
    name: 'list_libraries',
    title: 'List Libraries',
    description: 'List libraries (text, image, audio, video) for the authenticated user. Returns library id, name, description, type, item count, and a "url" that opens the library in Remix Studio — show that url when presenting a library to the user. Use the library id as libraryId when composing workflow items of type *_from_library or *_library.',
    inputSchema: {
      query: z.string().optional().describe('Optional: search libraries by name (case-insensitive)'),
      type: z.enum(['text', 'image', 'audio', 'video']).optional().describe('Optional: filter by library type'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Items per page (default 50)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { query, type, page, limit } = input as {
        query?: string;
        type?: 'text' | 'image' | 'audio' | 'video';
        page: number;
        limit: number;
      };
      const result = await repository.getUserLibraries(userId, page, limit, query, false, type as any);
      const libraries = result.items.map((lib) => ({
        id: lib.id,
        url: appUrls.library(lib.id),
        name: lib.name,
        description: lib.description ?? null,
        type: lib.type,
        itemCount: lib.itemCount ?? 0,
      }));
      return {
        text: JSON.stringify({
          libraries,
          total: result.total,
          page: result.page,
          pages: result.pages,
          ...paginationHints(result.page, result.pages),
        }, null, 2),
      };
    },
  });

  // ─── get_library_items ───
  tools.push({
    name: 'get_library_items',
    title: 'Get Library Items',
    description: `Browse items inside a specific library (any type: text, image, audio, video). Returns each item's id, title, tags, and either "text" (for text libraries) or "storageKey" (for image/audio/video libraries). Long text is truncated; full length is reported.

Field semantics:
- Text libraries: use item.text as the "value" of a "text" workflow item.
- Image/audio/video libraries: use item.storageKey as the "value" of the matching workflow item type to pin a specific file.

Use this tool to find an item by name/title before composing a workflow. Combine with list_libraries to first discover the libraryId. The response also carries "libraryUrl", the link that opens this library in Remix Studio — surface it when telling the user about the library.`,
    inputSchema: {
      library_id: z.string().describe('The library ID to browse (from list_libraries)'),
      query: z.string().optional().describe('Optional: filter items by title/name (case-insensitive substring match)'),
      tags: z.array(z.string()).optional().describe('Optional: filter by tags (items must contain ALL specified tags)'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Items per page (default 25)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { library_id, query, tags, page, limit } = input as {
        library_id: string;
        query?: string;
        tags?: string[];
        page: number;
        limit: number;
      };
      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return {
          text: JSON.stringify({ error: 'Library not found' }),
          isError: true,
        };
      }

      const result = await repository.getLibraryItemsPaginated(userId, library_id, page, limit, query, tags);
      const isText = library.type === 'text';
      const items = result.items.map((item) => {
        const rawContent = item.content ?? '';
        if (isText) {
          const preview = truncateContent(rawContent);
          return {
            id: item.id,
            title: item.title ?? null,
            text: preview.text,
            textTruncated: preview.truncated,
            textLength: preview.originalLength,
            tags: item.tags ?? [],
            thumbnailUrl: item.thumbnailUrl ?? null,
          };
        }
        return {
          id: item.id,
          title: item.title ?? null,
          storageKey: rawContent,
          tags: item.tags ?? [],
          thumbnailUrl: item.thumbnailUrl ?? null,
        };
      });

      const response = {
        libraryId: library_id,
        libraryUrl: appUrls.library(library_id),
        libraryName: library.name,
        libraryDescription: library.description ?? null,
        libraryType: library.type,
        items,
        total: result.total,
        page: result.page,
        pages: result.pages,
        ...paginationHints(result.page, result.pages),
        hint: isText
          ? 'Use item.text as the "value" of a "text" workflow item.'
          : `Use item.storageKey as the "value" of an "${library.type}" workflow item to pin this specific file.`,
      };
      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── get_project ───
  tools.push({
    name: 'get_project',
    title: 'Get Project',
    description: 'Read one project, including its current workflow and the "url" that opens it in Remix Studio (show that url when presenting the project). Always call this to fetch the latest workflow immediately before update_project when changing workflowItems — even if you read the project earlier in the conversation — so unchanged workflow items can be carried forward from the current state and not from a stale copy.',
    inputSchema: {
      projectId: z.string().describe('The project ID to inspect'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { projectId } = input as { projectId: string };
      const project = await repository.getProject(userId, projectId);
      if (!project) {
        return {
          text: JSON.stringify({ error: `Project "${projectId}" not found.` }),
          isError: true,
        };
      }

      const [workflow, jobs, albumPage] = await Promise.all([
        repository.getProjectWorkflow(userId, projectId),
        repository.getProjectJobs(userId, projectId),
        repository.getProjectAlbum(userId, projectId, { limit: 1 }),
      ]);
      const workflowItems = workflow.map(toToolWorkflowItem);
      const response = {
        projectId: project.id,
        url: appUrls.project(project.id),
        name: project.name,
        description: project.description ?? null,
        type: project.type,
        status: project.status,
        providerId: project.providerId ?? null,
        modelConfigId: project.modelConfigId ?? null,
        aspectRatio: project.aspectRatio ?? null,
        quality: project.quality ?? null,
        format: project.format ?? null,
        shuffle: project.shuffle ?? null,
        prefix: project.prefix ?? null,
        systemPrompt: project.systemPrompt ?? null,
        temperature: project.temperature ?? null,
        maxTokens: project.maxTokens ?? null,
        duration: project.duration ?? null,
        resolution: project.resolution ?? null,
        sound: project.sound ?? null,
        workflowItemCount: workflowItems.length,
        workflowItems,
        workflowUpdateWarning:
          'update_project replaces the whole workflow when workflowItems is provided. Build the replacement list from THESE freshly fetched workflowItems (not an earlier copy), include every existing item you want to keep, in order, and omit only items the user explicitly asked to remove.',
        counts: {
          jobs: jobs.length,
          album: albumPage.total,
        },
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── create_project_with_workflow ───

  tools.push({
    name: 'create_project_with_workflow',
    title: 'Create Project with Workflow',
    description: `Create a new project with a preset workflow. The result carries the project "url" — show it to the user so they can open the new project.

Workflow item types:
- "text": static prompt text. Requires "value" with the text content. To use a specific item from a text library, first call get_library_items and pass the returned item.text as "value".
- "library": generic library reference (runtime uses the referenced library's type). Requires "libraryId".
- "text_from_library" / "text_library": reference a text library (runtime picks random items). Requires "libraryId".
- "image": image context slot. Leave "value" empty for a blank placeholder, or set "value" to item.storageKey from get_library_items to pin a specific image file.
- "image_from_library" / "image_library": reference an image library (runtime picks randomly). Requires "libraryId".
- "audio": audio context slot. Leave "value" empty, or set "value" to item.storageKey from get_library_items to pin a specific audio file.
- "audio_from_library" / "audio_library": reference an audio library. Requires "libraryId".
- "video": video context slot. Leave "value" empty, or set "value" to item.storageKey from get_library_items to pin a specific video file.
- "video_from_library" / "video_library": reference a video library. Requires "libraryId".

Recommended workflow:
1. Call list_available_models → pick one usableModels entry (copy providerId + modelConfigId verbatim).
2. Call list_libraries → discover libraries.
3. Call get_library_items(libraryId) → find items by name.
4. Present the full plan to the user before creating the project.`,
    inputSchema: {
      name: z.string().min(1).max(256).describe('Project display name'),
      description: z.string().max(2000).optional().describe('Optional project description explaining what it does, generates, or how it should be used'),
      type: z.enum(['image', 'text', 'video', 'audio']).describe('Project generation type'),
      providerId: z.string().optional().describe('Saved provider ID (from list_available_models usableModels[].providerId)'),
      modelConfigId: z.string().optional().describe('Model config ID (from list_available_models usableModels[].modelConfigId)'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g. "16:9", "1:1") — available options depend on the selected model'),
      quality: z.string().optional().describe('Quality level — available options depend on the selected model'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Output image format (png, jpeg, webp)'),
      shuffle: z.boolean().optional().describe('Shuffle workflow text items on each generation run'),
      prefix: z.string().optional().describe('Text prefix prepended to every generated prompt'),
      systemPrompt: z.string().optional().describe('System prompt for text projects'),
      temperature: z.number().min(0).max(2).optional().describe('Generation temperature (0–2; Claude max is 1.0)'),
      maxTokens: z.number().int().optional().describe('Max output tokens for text projects'),
      duration: z.number().int().optional().describe('Video duration in seconds'),
      resolution: z.string().optional().describe('Video resolution (e.g. "720p", "1080p")'),
      sound: z.enum(['on', 'off']).optional().describe('Sound for video generation'),
      workflowItems: z.array(z.object({
        itemType: z.enum(WORKFLOW_ITEM_TYPES).describe('Workflow item type'),
        value: z.string().optional().describe('For "text": the prompt text. For "image"/"audio"/"video": leave empty for a blank slot, or set to item.storageKey from get_library_items to pin a specific file.'),
        libraryId: z.string().optional().describe('Library ID (required for "library", *_from_library, and *_library types)'),
        selectedTags: z.array(z.string()).optional().describe('Optional tag filter applied when picking items from the library'),
      })).min(1).max(200).describe('Ordered list of workflow items (1–200)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const {
        name, description, type, providerId, modelConfigId, aspectRatio, quality, format, shuffle, prefix,
        systemPrompt, temperature, maxTokens, duration, resolution, sound, workflowItems,
      } = input as {
        name: string;
        description?: string;
        type: 'image' | 'text' | 'video' | 'audio';
        providerId?: string;
        modelConfigId?: string;
        aspectRatio?: string;
        quality?: string;
        format?: 'png' | 'jpeg' | 'webp';
        shuffle?: boolean;
        prefix?: string;
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
        duration?: number;
        resolution?: string;
        sound?: 'on' | 'off';
        workflowItems: {
          itemType: (typeof WORKFLOW_ITEM_TYPES)[number];
          value?: string;
          libraryId?: string;
          selectedTags?: string[];
        }[];
      };

      // ─── Validate provider/model pairing ───
      let providerRecord: Awaited<ReturnType<ProviderRepository['getPublicProvider']>> | null = null;
      if (providerId) {
        providerRecord = await providerRepository.getPublicProvider(userId, providerId);
        if (!providerRecord) {
          return {
            text: JSON.stringify({ error: `providerId "${providerId}" not found for this user.` }),
            isError: true,
          };
        }
      }

      let modelMeta: { id: string; name: string; category: string; providerType: string } | null = null;
      if (modelConfigId) {
        for (const [providerType, models] of Object.entries(PROVIDER_MODELS_MAP)) {
          const match = models.find((m) => m.id === modelConfigId);
          if (match) {
            modelMeta = { id: match.id, name: match.name, category: match.category, providerType };
            break;
          }
        }
        if (!modelMeta) {
          return {
            text: JSON.stringify({ error: `modelConfigId "${modelConfigId}" not found in the catalog. Call list_available_models to see valid IDs.` }),
            isError: true,
          };
        }
      }

      if (providerRecord && modelMeta && providerRecord.type !== modelMeta.providerType) {
        return {
          text: JSON.stringify({
            error: `Provider/model mismatch: provider "${providerRecord.name}" is type "${providerRecord.type}" but model "${modelMeta.name}" requires a "${modelMeta.providerType}" provider. Call list_available_models for valid pairings.`,
          }),
          isError: true,
        };
      }

      if (modelMeta && modelMeta.category !== type) {
        return {
          text: JSON.stringify({
            error: `Project type "${type}" does not match model category "${modelMeta.category}". Pick a model whose category equals the project type.`,
          }),
          isError: true,
        };
      }

      // ─── Validate *_library items supply a libraryId ───
      for (let i = 0; i < workflowItems.length; i++) {
        const item = workflowItems[i];
        const needsLibrary = item.itemType === 'library' || item.itemType.endsWith('_from_library') || item.itemType.endsWith('_library');
        if (needsLibrary && !item.libraryId) {
          return {
            text: JSON.stringify({ error: `workflowItems[${i}] has itemType "${item.itemType}" but no libraryId.` }),
            isError: true,
          };
        }
      }

      // ─── Normalize workflow ───
      const workflow = workflowItems.map((item, idx) => {
        let internalType: 'text' | 'library' | 'image' | 'video' | 'audio';
        let internalValue: string;

        switch (item.itemType) {
          case 'text':
            internalType = 'text';
            internalValue = item.value || '';
            break;
          case 'library':
          case 'text_from_library':
          case 'text_library':
            internalType = 'library';
            internalValue = item.libraryId || '';
            break;
          case 'image':
            internalType = 'image';
            internalValue = item.value || '';
            break;
          case 'image_from_library':
          case 'image_library':
            internalType = 'library';
            internalValue = item.libraryId || '';
            break;
          case 'audio':
            internalType = 'audio';
            internalValue = item.value || '';
            break;
          case 'audio_from_library':
          case 'audio_library':
            internalType = 'library';
            internalValue = item.libraryId || '';
            break;
          case 'video':
            internalType = 'video';
            internalValue = item.value || '';
            break;
          case 'video_from_library':
          case 'video_library':
            internalType = 'library';
            internalValue = item.libraryId || '';
            break;
          default: {
            const exhaustive: never = item.itemType;
            throw new Error(`Unknown workflow itemType: ${exhaustive as string}`);
          }
        }

        return {
          id: crypto.randomUUID(),
          type: internalType,
          value: internalValue,
          order: idx,
          selectedTags: item.selectedTags,
        };
      });

      // ─── Create ───
      const projectId = crypto.randomUUID();
      const project = {
        id: projectId,
        name,
        description: description?.trim() || undefined,
        type,
        status: 'active' as const,
        createdAt: Date.now(),
        workflow,
        jobs: [],
        album: [],
        providerId: providerId || undefined,
        modelConfigId: modelConfigId || undefined,
        aspectRatio: aspectRatio || undefined,
        quality: quality || undefined,
        format: format || undefined,
        shuffle: shuffle ?? undefined,
        prefix: prefix?.trim() || undefined,
        systemPrompt: systemPrompt || undefined,
        temperature: temperature ?? undefined,
        maxTokens: maxTokens ?? undefined,
        duration: duration ?? undefined,
        resolution: resolution || undefined,
        sound: sound || undefined,
      };

      await repository.createProject(userId, project);

      return {
        text: JSON.stringify({
          projectId,
          url: appUrls.project(projectId),
          name,
          description: description?.trim() || null,
          type,
          workflowItemCount: workflow.length,
          message: 'Project created successfully. Share the url so the user can open it in Remix Studio to review the workflow and run generation.',
        }),
      };
    },
  });

  // ─── update_project ───
  tools.push({
    name: 'update_project',
    title: 'Update Project',
    description: `Update an existing project's metadata, settings, or workflow. Only provided non-workflow fields will be updated. The result carries the project "url" so the change can be linked back to the user.

Important workflow behavior:
- If workflowItems is omitted, the existing workflow is unchanged.
- If workflowItems is provided, it completely replaces the existing workflow.
- ALWAYS call get_project to fetch the latest workflow immediately before this update, even if you already read the project earlier in the conversation — the project may have changed since, and a stale copy will silently drop or revert workflow items. Start from the freshly returned workflowItems and carry forward every existing item the user did not explicitly ask to remove.`,
    inputSchema: {
      projectId: z.string().describe('The ID of the project to update'),
      name: z.string().min(1).max(256).optional().describe('New project display name'),
      description: z.string().max(2000).optional().describe('New project description. Pass an empty string to clear it.'),
      status: z.enum(['active', 'archived']).optional().describe('Update project status'),
      type: z.enum(['image', 'text', 'video', 'audio']).optional().describe('Update project generation type'),
      providerId: z.string().optional().describe('Update saved provider ID'),
      modelConfigId: z.string().optional().describe('Update model config ID'),
      aspectRatio: z.string().optional().describe('Update aspect ratio'),
      quality: z.string().optional().describe('Update quality level'),
      format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Update output image format'),
      shuffle: z.boolean().optional().describe('Update shuffle setting'),
      prefix: z.string().optional().describe('Update text prefix'),
      systemPrompt: z.string().optional().describe('Update system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Update generation temperature'),
      maxTokens: z.number().int().optional().describe('Update max output tokens'),
      duration: z.number().int().optional().describe('Update video duration'),
      resolution: z.string().optional().describe('Update video resolution'),
      sound: z.enum(['on', 'off']).optional().describe('Update video sound setting'),
      workflowItems: z.array(z.object({
        itemType: z.enum(WORKFLOW_ITEM_TYPES).describe('Workflow item type'),
        value: z.string().optional().describe('For "text": the prompt text. For "image"/"audio"/"video": file storage key to pin a file.'),
        libraryId: z.string().optional().describe('Library ID (required for "library" and *_from_library types)'),
        selectedTags: z.array(z.string()).optional().describe('Optional tag filter for library items'),
        id: z.string().optional().describe('Existing workflow item ID. Preserve this when carrying forward an item from get_project.'),
        disabled: z.boolean().optional().describe('Whether this workflow item is disabled. Preserve this when carrying forward an item from get_project.'),
        thumbnailUrl: z.string().optional().describe('Existing media thumbnail key/URL. Preserve this when carrying forward an item from get_project.'),
        optimizedUrl: z.string().optional().describe('Existing optimized media key/URL. Preserve this when carrying forward an item from get_project.'),
      })).optional().describe('Replacement ordered workflow list. If provided, include every existing workflow item to keep; omitted existing items are removed. Always call get_project first to fetch the latest workflow, even if you read the project earlier — never build this list from a stale copy.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const {
        projectId, name, description, status, type, providerId, modelConfigId, aspectRatio, quality, format,
        shuffle, prefix, systemPrompt, temperature, maxTokens, duration, resolution, sound, workflowItems,
      } = input as {
        projectId: string;
        name?: string;
        description?: string;
        status?: 'active' | 'archived';
        type?: 'image' | 'text' | 'video' | 'audio';
        providerId?: string;
        modelConfigId?: string;
        aspectRatio?: string;
        quality?: string;
        format?: 'png' | 'jpeg' | 'webp';
        shuffle?: boolean;
        prefix?: string;
        systemPrompt?: string;
        temperature?: number;
        maxTokens?: number;
        duration?: number;
        resolution?: string;
        sound?: 'on' | 'off';
        workflowItems?: {
          id?: string;
          itemType: (typeof WORKFLOW_ITEM_TYPES)[number];
          value?: string;
          libraryId?: string;
          selectedTags?: string[];
          disabled?: boolean;
          thumbnailUrl?: string;
          optimizedUrl?: string;
        }[];
      };

      const existingProject = await repository.getProject(userId, projectId);
      if (!existingProject) {
        return {
          text: JSON.stringify({ error: `Project "${projectId}" not found.` }),
          isError: true,
        };
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description.trim() || null;
      if (status !== undefined) updates.status = status;
      if (type !== undefined) updates.type = type;
      if (providerId !== undefined) updates.providerId = providerId;
      if (modelConfigId !== undefined) updates.modelConfigId = modelConfigId;
      if (aspectRatio !== undefined) updates.aspectRatio = aspectRatio;
      if (quality !== undefined) updates.quality = quality;
      if (format !== undefined) updates.format = format;
      if (shuffle !== undefined) updates.shuffle = shuffle;
      if (prefix !== undefined) updates.prefix = prefix.trim() || null;
      if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
      if (temperature !== undefined) updates.temperature = temperature;
      if (maxTokens !== undefined) updates.maxTokens = maxTokens;
      if (duration !== undefined) updates.duration = duration;
      if (resolution !== undefined) updates.resolution = resolution;
      if (sound !== undefined) updates.sound = sound;

      // Validate provider/model if changed
      const effectiveProviderId = providerId ?? existingProject.providerId;
      const effectiveModelConfigId = modelConfigId ?? existingProject.modelConfigId;
      const effectiveType = type ?? existingProject.type;

      if (providerId || modelConfigId || type) {
        let providerRecord = null;
        if (effectiveProviderId) {
          providerRecord = await providerRepository.getPublicProvider(userId, effectiveProviderId);
          if (!providerRecord) {
            return {
              text: JSON.stringify({ error: `providerId "${effectiveProviderId}" not found.` }),
              isError: true,
            };
          }
        }

        let modelMeta: { id: string; name: string; category: string; providerType: string } | null = null;
        if (effectiveModelConfigId) {
          for (const [providerType, models] of Object.entries(PROVIDER_MODELS_MAP)) {
            const match = models.find((m) => m.id === effectiveModelConfigId);
            if (match) {
              modelMeta = { id: match.id, name: match.name, category: match.category, providerType };
              break;
            }
          }
          if (!modelMeta) {
            return {
              text: JSON.stringify({ error: `modelConfigId "${effectiveModelConfigId}" not found.` }),
              isError: true,
            };
          }
        }

        if (providerRecord && modelMeta && providerRecord.type !== modelMeta.providerType) {
          return {
            text: JSON.stringify({
              error: `Provider/model mismatch: provider "${providerRecord.name}" (${providerRecord.type}) vs model "${modelMeta.name}" (${modelMeta.providerType}).`,
            }),
            isError: true,
          };
        }

        if (modelMeta && effectiveType && modelMeta.category !== effectiveType) {
          return {
            text: JSON.stringify({
              error: `Project type "${effectiveType}" does not match model category "${modelMeta.category}".`,
            }),
            isError: true,
          };
        }
      }

      if (workflowItems) {
        for (let i = 0; i < workflowItems.length; i++) {
          const item = workflowItems[i];
          const needsLibrary = item.itemType === 'library' || item.itemType.endsWith('_from_library') || item.itemType.endsWith('_library');
          if (needsLibrary && !item.libraryId) {
            return {
              text: JSON.stringify({ error: `workflowItems[${i}] has itemType "${item.itemType}" but no libraryId.` }),
              isError: true,
            };
          }
        }

        updates.workflow = workflowItems.map((item, idx) => {
          let internalType: 'text' | 'library' | 'image' | 'video' | 'audio';
          let internalValue: string;

          switch (item.itemType) {
            case 'text':
              internalType = 'text';
              internalValue = item.value || '';
              break;
            case 'library':
            case 'text_from_library':
            case 'text_library':
              internalType = 'library';
              internalValue = item.libraryId || '';
              break;
            case 'image':
              internalType = 'image';
              internalValue = item.value || '';
              break;
            case 'image_from_library':
            case 'image_library':
              internalType = 'library';
              internalValue = item.libraryId || '';
              break;
            case 'audio':
              internalType = 'audio';
              internalValue = item.value || '';
              break;
            case 'audio_from_library':
            case 'audio_library':
              internalType = 'library';
              internalValue = item.libraryId || '';
              break;
            case 'video':
              internalType = 'video';
              internalValue = item.value || '';
              break;
            case 'video_from_library':
            case 'video_library':
              internalType = 'library';
              internalValue = item.libraryId || '';
              break;
            default:
              throw new Error(`Unknown workflow itemType: ${item.itemType}`);
          }

          return {
            id: item.id || crypto.randomUUID(),
            type: internalType,
            value: internalValue,
            order: idx,
            selectedTags: item.selectedTags,
            disabled: item.disabled,
            thumbnailUrl: item.thumbnailUrl,
            optimizedUrl: item.optimizedUrl,
          };
        });
      }

      await repository.updateProject(userId, projectId, updates);
      const updatedName = name ?? existingProject.name;

      return {
        text: JSON.stringify({
          projectId,
          url: appUrls.project(projectId),
          name: updatedName,
          description: description !== undefined ? (description.trim() || null) : (existingProject.description ?? null),
          updatedFields: Object.keys(updates),
          message: 'Project updated successfully.',
        }),
      };
    },
  });

  // ─── get_project_job_counts ───
  tools.push({
    name: 'get_project_job_counts',
    title: 'Get Project Job Counts',
    description: `Count a project's jobs by stage, plus how many results have landed in its album.

Returned fields:
- "drafts": jobs staged but not started — what draft_jobs creates and start_jobs consumes.
- "pending" / "processing" / "queued": waiting to run, running now, and the sum of the two ("the queue").
- "completed" / "failed": finished runs, successful and not.
- "albumItems": results saved to the project album (a completed job leaves one behind, and album items also survive job cleanup, so this is usually the higher number).

Also returns the project's "url" — show it when reporting progress so the user can open the queue.`,
    inputSchema: {
      projectId: z.string().describe('The project ID to count jobs for'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { projectId } = input as { projectId: string };

      const project = await repository.getProject(userId, projectId);
      if (!project) {
        return {
          text: JSON.stringify({ error: `Project "${projectId}" not found.` }),
          isError: true,
        };
      }

      const counts = await readProjectCounts(userId, projectId);
      const response = {
        projectId,
        name: project.name,
        url: appUrls.project(projectId),
        type: project.type ?? 'image',
        ...counts,
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── get_queue_status ───
  tools.push({
    name: 'get_queue_status',
    title: 'Get Queue Status',
    description: `Counts for the queue monitor page (/projects/queues) across every project and provider — numbers only, never the job list.

"totals" mirrors the page header:
- "projects": projects with at least one job in the queue right now (not the total project count).
- "providers": configured providers.
- "running": jobs executing now, including the "detached" ones handed to the provider as a task and still being polled.
- "queued" / "pending": jobs waiting for a free slot. Same set counted two ways, so they normally match.
- "failed": failed jobs still sitting in the queue, waiting to be cleared.
- "activeSlots" / "concurrency" / "availableSlots": provider slots in use, the combined limit, and what is left.

Set "breakdown" for per-row counts (no job details in any mode):
- "providers" mirrors the page's provider tab — every configured provider with its slots in use, concurrency limit, queue depth, and failures, busiest first.
- "projects" mirrors the project tab — one row per project holding jobs, busiest first.
- "none" (default) returns just the totals.

Use get_project_job_counts instead when the question is about one project, since that one also covers drafts, completed runs, and album items.

Returns "url" — the queue monitor page — so the user can open it.`,
    inputSchema: {
      breakdown: z.enum(['none', 'projects', 'providers']).default('none')
        .describe('Per-row counts to include besides the totals (default "none")'),
      limit: z.number().int().min(1).max(200).default(25)
        .describe('Maximum breakdown rows to return, most active first (default 25). Ignored when breakdown="none".'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { breakdown, limit } = input as {
        breakdown: 'none' | 'projects' | 'providers';
        limit: number;
      };

      const status = await queueManager.getMonitorStatus(
        userId,
        breakdown === 'providers' ? 'providers' : 'projects',
      );
      const { totals } = status;

      const response: Record<string, unknown> = {
        url: appUrls.queue(breakdown === 'providers' ? 'providers' : undefined),
        updatedAt: new Date(status.updatedAt).toISOString(),
        breakdown,
        totals: {
          projects: totals.projects,
          providers: totals.providers,
          running: totals.runningJobs + totals.detachedJobs,
          detached: totals.detachedJobs,
          queued: totals.queuedJobs + totals.waitingJobs,
          pending: totals.pendingJobs,
          failed: totals.failedJobs,
          activeSlots: totals.activeSlots,
          concurrency: totals.concurrency,
          availableSlots: Math.max(0, totals.concurrency - totals.activeSlots),
        },
      };

      if (breakdown === 'projects') {
        const rows = status.projects || [];
        response.projects = rows.slice(0, limit).map((project) => ({
          id: project.id,
          name: project.name,
          type: project.type,
          status: project.status,
          providerName: project.providerName,
          running: project.runningJobs + project.detachedJobs,
          detached: project.detachedJobs,
          queued: project.queuedJobs + project.waitingJobs,
          failed: project.failedJobs,
          latestJobAt: project.latestJobAt ? new Date(project.latestJobAt).toISOString() : undefined,
          projectUrl: appUrls.project(project.id),
        }));
        response.totalRows = rows.length;
        response.hasMore = rows.length > limit;
      }

      if (breakdown === 'providers') {
        const rows = status.providers || [];
        response.providers = rows.slice(0, limit).map((provider) => ({
          id: provider.id,
          name: provider.name,
          type: provider.type,
          activeSlots: provider.activeSlots,
          concurrency: provider.concurrency,
          availableSlots: provider.availableSlots,
          running: provider.runningJobs + provider.detachedJobs,
          detached: provider.detachedJobs,
          queued: provider.queuedJobs + provider.waitingJobs,
          failed: provider.failedJobs,
          providerUrl: appUrls.provider(provider.id),
        }));
        response.totalRows = rows.length;
        response.hasMore = rows.length > limit;
      }

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── draft_jobs ───
  tools.push({
    name: 'draft_jobs',
    title: 'Draft Jobs',
    description: `Stage draft jobs on a project by running its workflow, exactly like the "add to queue" button in the project viewer. Drafts do not run and cost nothing until start_jobs moves them into the queue.

Each draft gets one prompt combination built from the project's enabled workflow items: static text is used as-is and every library reference contributes one of its items. With shuffle on, each draft picks randomly; with shuffle off, drafts walk the combinations in order and wrap around once they are exhausted.

The project supplies the provider, model, and generation settings (aspect ratio, quality, format, duration, resolution, sound) — set them with update_project first if they are missing. Call get_project to review the workflow, and get_project_job_counts to see what is already staged.

Returns the project's "url" — share it so the user can review the drafts before starting them.`,
    inputSchema: {
      projectId: z.string().describe('The project to stage drafts on'),
      count: z.number().int().min(1).max(MAX_DRAFT_JOBS_PER_CALL)
        .describe(`How many drafts to create (1–${MAX_DRAFT_JOBS_PER_CALL}). Call again for larger batches.`),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { projectId, count } = input as { projectId: string; count: number };

      const project = await repository.getProject(userId, projectId);
      if (!project) {
        return {
          text: JSON.stringify({ error: `Project "${projectId}" not found.` }),
          isError: true,
        };
      }

      if (!project.providerId || !project.modelConfigId) {
        return {
          text: JSON.stringify({
            error: `Project "${project.name}" has no provider/model configured. Pick a pair with list_available_models and set it with update_project before drafting jobs.`,
          }),
          isError: true,
        };
      }

      const workflow = await repository.getProjectWorkflow(userId, projectId);
      const enabledItems = workflow.filter((item) => !item.disabled);
      if (enabledItems.length === 0) {
        return {
          text: JSON.stringify({
            error: `Project "${project.name}" has no enabled workflow items. Add some with update_project before drafting jobs.`,
          }),
          isError: true,
        };
      }

      const emptyItems = enabledItems.filter((item) => !item.value?.trim());
      if (emptyItems.length > 0) {
        return {
          text: JSON.stringify({
            error: `${emptyItems.length} enabled workflow item${emptyItems.length === 1 ? ' is' : 's are'} empty. Fill or disable them with update_project before drafting jobs.`,
          }),
          isError: true,
        };
      }

      // Library-backed workflow items are stored as a library ID; the remix
      // engine needs the items themselves to build combinations.
      const libraryIds = Array.from(new Set(
        enabledItems.filter((item) => item.type === 'library').map((item) => item.value),
      ));
      const libraries: Library[] = [];
      for (const libraryId of libraryIds) {
        const library = await repository.getLibrary(userId, libraryId);
        if (!library) {
          return {
            text: JSON.stringify({
              error: `Workflow references library "${libraryId}", which no longer exists. Fix the workflow with update_project before drafting jobs.`,
            }),
            isError: true,
          };
        }
        libraries.push(library);
      }

      const combinations = generateJobs(workflow, libraries, count, !!project.shuffle);
      if (combinations.length === 0) {
        return {
          text: JSON.stringify({
            error: `Project "${project.name}" workflow produced no prompt combinations. Its libraries may be empty or filtered down to nothing by their selected tags.`,
          }),
          isError: true,
        };
      }

      const storageError = await assertStorageHeadroom(userId, combinations.length);
      if (storageError) return storageError;

      const provider = await providerRepository.getPublicProvider(userId, project.providerId);
      const model = provider?.models.find((m) => m.id === project.modelConfigId);
      const settings = buildJobSettings(project, model);

      const drafts: Job[] = combinations.map((combo) => ({
        id: crypto.randomUUID(),
        prompt: combo.prompt,
        imageContexts: combo.imageContexts,
        videoContexts: combo.videoContexts,
        audioContexts: combo.audioContexts,
        status: 'draft' as const,
        providerId: project.providerId,
        modelConfigId: project.modelConfigId,
        ...settings,
        filename: buildJobFilename(
          [project.prefix ?? '', ...combo.filenameParts],
          crypto.randomUUID().slice(0, 8),
        ),
        workflowSnapshot: workflow,
      }));

      const created = await repository.createProjectJobs(userId, projectId, drafts);
      projectEvents?.notifyProjectChanged({ userId, projectId, reason: 'jobs.changed' });

      const counts = await readProjectCounts(userId, projectId);
      const response = {
        projectId,
        name: project.name,
        url: appUrls.project(projectId),
        drafted: created,
        promptPreviews: drafts.slice(0, 3).map((job) => job.prompt.slice(0, 200)),
        counts,
        message: `Staged ${created} draft${created === 1 ? '' : 's'}. They stay idle until start_jobs queues them.`,
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── start_jobs ───
  tools.push({
    name: 'start_jobs',
    title: 'Start Jobs',
    description: `Move a project's draft jobs into the generation queue and start running them. Drafts are taken oldest first.

Omit "count" to start every draft, or pass a number to start only that many — useful for trying a handful before committing a large batch. This spends provider credits, so confirm the count with the user first. Use get_project_job_counts to see what is staged and how the queue is draining.

Returns the project's "url" — share it so the user can watch generation run.`,
    inputSchema: {
      projectId: z.string().describe('The project whose drafts should start'),
      count: z.number().int().min(1).optional()
        .describe('How many drafts to start, oldest first. Omit to start every draft.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { projectId, count } = input as { projectId: string; count?: number };

      const project = await repository.getProject(userId, projectId);
      if (!project) {
        return {
          text: JSON.stringify({ error: `Project "${projectId}" not found.` }),
          isError: true,
        };
      }

      const drafts = await repository.findProjectJobsForStart(userId, projectId, { mode: 'allDrafts' });
      const targets = count == null ? drafts : drafts.slice(0, count);

      if (targets.length === 0) {
        const counts = await readProjectCounts(userId, projectId);
        const response = {
          projectId,
          name: project.name,
          url: appUrls.project(projectId),
          started: 0,
          counts,
          message: 'No draft jobs to start. Stage some with draft_jobs first.',
        };
        return {
          text: JSON.stringify(response, null, 2),
          structuredContent: response,
        };
      }

      // Quota covers everything that will be waiting to run, not just this
      // batch — jobs already pending have not written their output yet.
      const pendingCount = await repository.countPendingProjectJobs(userId, projectId);
      const storageError = await assertStorageHeadroom(userId, pendingCount + targets.length);
      if (storageError) return storageError;

      const jobIds = targets.map((job) => job.id);
      const started = await repository.startProjectJobs(userId, projectId, jobIds);
      projectEvents?.notifyProjectChanged({ userId, projectId, reason: 'jobs.changed' });

      await queueManager.enqueueProjectJobs(userId, projectId, jobIds);

      const counts = await readProjectCounts(userId, projectId);
      const response = {
        projectId,
        name: project.name,
        url: appUrls.project(projectId),
        started,
        remainingDrafts: counts.drafts,
        counts,
        message: `Queued ${started} job${started === 1 ? '' : 's'}. Generation runs in the background — poll get_project_job_counts to follow progress.`,
      };

      return {
        text: JSON.stringify(response, null, 2),
        structuredContent: response,
      };
    },
  });

  // ─── update_library_item ───
  tools.push({
    name: 'update_library_item',
    title: 'Update Library Item',
    description: 'Update the title, tags, and/or text content of a single library item. Only the fields you provide will be changed. Use get_library_items or search_library_items first to find the item id.',
    inputSchema: {
      library_id: z.string().describe('The library ID that contains the item'),
      item_id: z.string().describe('The ID of the library item to update'),
      title: z.string().optional().describe('New title for the item (pass empty string to clear)'),
      tags: z.array(z.string()).optional().describe('Replacement tag list (replaces existing tags; pass [] to clear all tags)'),
      content: z.string().optional().describe('New text content (text libraries only; leave unset to keep existing)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, item_id, title, tags, content } = input as {
        library_id: string;
        item_id: string;
        title?: string;
        tags?: string[];
        content?: string;
      };

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }

      const updates: { title?: string; tags?: string[]; content?: string } = {};
      if (title !== undefined) updates.title = title;
      if (tags !== undefined) updates.tags = tags;
      if (content !== undefined) updates.content = content;

      if (Object.keys(updates).length === 0) {
        return { text: JSON.stringify({ error: 'No fields to update. Provide at least one of: title, tags, content.' }), isError: true };
      }

      try {
        await repository.updateLibraryItem(userId, library_id, item_id, updates);
        return {
          text: JSON.stringify({
            item_id,
            library_id,
            libraryUrl: appUrls.library(library_id),
            updatedFields: Object.keys(updates),
            message: 'Library item updated successfully.',
          }),
        };
      } catch (err: any) {
        return { text: JSON.stringify({ error: err.message ?? 'Update failed.' }), isError: true };
      }
    },
  });

  // ─── batch_update_library_items ───
  tools.push({
    name: 'batch_update_library_items',
    title: 'Batch Update Library Items',
    description: 'Update the title, tags, and/or text content of multiple items in a library in a single batch (up to 100 items). Each entry may change a different set of fields. Prefer this over repeated update_library_item calls whenever more than one item is being changed — including rewriting or expanding the content of many prompts at once.',
    inputSchema: {
      library_id: z.string().describe('The library ID that contains the items'),
      updates: z.array(z.object({
        item_id: z.string().describe('ID of the item to update'),
        title: z.string().optional().describe('New title (omit to keep existing; pass empty string to clear)'),
        tags: z.array(z.string()).optional().describe('Replacement tags (omit to keep existing; pass [] to clear all)'),
        content: z.string().optional().describe('New text content (text libraries only; omit to keep existing)'),
      })).min(1).max(100).describe('List of items to update (1–100)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, updates } = input as {
        library_id: string;
        updates: { item_id: string; title?: string; tags?: string[]; content?: string }[];
      };

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }

      const results: { item_id: string; status: 'updated' | 'error'; error?: string }[] = [];

      for (const upd of updates) {
        const itemUpdates: { title?: string; tags?: string[]; content?: string } = {};
        if (upd.title !== undefined) itemUpdates.title = upd.title;
        if (upd.tags !== undefined) itemUpdates.tags = upd.tags;
        if (upd.content !== undefined) itemUpdates.content = upd.content;

        if (Object.keys(itemUpdates).length === 0) {
          results.push({ item_id: upd.item_id, status: 'error', error: 'No fields to update.' });
          continue;
        }

        try {
          await repository.updateLibraryItem(userId, library_id, upd.item_id, itemUpdates);
          results.push({ item_id: upd.item_id, status: 'updated' });
        } catch (err: any) {
          results.push({ item_id: upd.item_id, status: 'error', error: err.message ?? 'Update failed.' });
        }
      }

      const successCount = results.filter((r) => r.status === 'updated').length;
      const errorCount = results.filter((r) => r.status === 'error').length;

      return {
        text: JSON.stringify({
          library_id,
          libraryUrl: appUrls.library(library_id),
          libraryName: library.name,
          results,
          successCount,
          errorCount,
          message: `${successCount} item(s) updated, ${errorCount} error(s).`,
        }),
      };
    },
  });

  // ============================================================================
  // SOCIAL MEDIA CAMPAIGN TOOLS
  // ============================================================================
  
  tools.push({
    name: 'list_social_accounts',
    title: 'List Social Accounts',
    description: 'Returns the social accounts connected by the user.',
    inputSchema: {
      status: z.enum(SOCIAL_ACCOUNT_STATUS_VALUES).optional().describe('Filter by status'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { status }) => {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId, ...(status ? { status } : {}) },
        select: SAFE_SOCIAL_ACCOUNT_SELECT,
      });
      return { text: JSON.stringify(accounts) };
    }
  });

  tools.push({
    name: 'create_campaign',
    title: 'Create Campaign',
    description: 'Creates a new social media campaign. Returns the campaign "url" — show it so the user can open the new campaign.',
    inputSchema: {
      name: z.string().min(1).max(200).describe('Name of the campaign'),
      description: z.string().max(5000).optional(),
      socialAccountIds: z.array(z.string().min(1)).max(100).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { name, description, socialAccountIds }) => {
      const ownedSocialAccountIds = await resolveOwnedSocialAccountIds(prisma, userId, socialAccountIds);
      const campaign = await prisma.campaign.create({
        data: {
          userId,
          name: name.trim(),
          description: description?.trim() || undefined,
          ...(ownedSocialAccountIds && ownedSocialAccountIds.length > 0 ? {
            socialAccounts: { connect: ownedSocialAccountIds.map((id: string) => ({ id })) }
          } : {})
        },
        include: { socialAccounts: { select: SAFE_SOCIAL_ACCOUNT_SELECT } }
      });
      const payload = { ...campaign, url: appUrls.campaign(campaign.id) };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'list_campaigns',
    title: 'List Campaigns',
    description: 'Returns the users social media campaigns, each with a "url" that opens it in Remix Studio — show that url when presenting a campaign to the user.',
    inputSchema: {
      status: z.enum(CAMPAIGN_STATUS_VALUES).optional().describe('Filter by status'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { status }) => {
      const rows = await prisma.campaign.findMany({
        where: { userId, ...(status ? { status } : {}) },
        include: { socialAccounts: { select: SAFE_SOCIAL_ACCOUNT_SELECT }, _count: { select: { posts: true } } }
      });
      const campaigns = rows.map((campaign) => ({ ...campaign, url: appUrls.campaign(campaign.id) }));
      return { text: JSON.stringify(campaigns), structuredContent: { campaigns } };
    }
  });

  tools.push({
    name: 'update_campaign',
    title: 'Update Campaign',
    description: 'Updates a social media campaign. Returns the campaign "url" so the change can be linked back to the user.',
    inputSchema: {
      campaignId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(CAMPAIGN_STATUS_VALUES).optional(),
      socialAccountIds: z.array(z.string().min(1)).max(100).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { campaignId, name, description, status, socialAccountIds }) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }});
      if (!campaign || campaign.userId !== userId) throw new Error("Campaign not found");
      const ownedSocialAccountIds = await resolveOwnedSocialAccountIds(prisma, userId, socialAccountIds);
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description.trim() || null }),
          ...(status && { status }),
          ...(ownedSocialAccountIds ? {
            socialAccounts: { set: ownedSocialAccountIds.map((id: string) => ({ id })) }
          } : {})
        },
        include: { socialAccounts: { select: SAFE_SOCIAL_ACCOUNT_SELECT } }
      });
      const payload = { ...updated, url: appUrls.campaign(updated.id) };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'create_post',
    title: 'Create Post',
    description: 'Creates a new post in a campaign. Returns the post "url" (and its "campaignUrl") — show the post url so the user can open it.',
    inputSchema: {
      campaignId: z.string().min(1),
      textContent: z.string().max(28000).optional(),
      scheduledAt: z.string().optional().describe('ISO date string (e.g. 2026-05-01T12:00:00Z)'),
      status: z.enum(MCP_POST_STATUS_VALUES).optional().describe('draft or scheduled'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { campaignId, textContent, scheduledAt, status }) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }});
      if (!campaign || campaign.userId !== userId) throw new Error("Campaign not found");
      const parsedScheduledAt = parseScheduledAt(scheduledAt);
      const nextStatus = status || (parsedScheduledAt ? 'scheduled' : 'draft');
      if (nextStatus === 'scheduled') {
        if (!parsedScheduledAt) throw new Error('scheduledAt is required when creating a scheduled post');
        await assertCampaignHasActiveSocialAccount(prisma, campaignId);
      }
      const post = await prisma.post.create({
        data: {
          userId,
          campaignId,
          textContent: textContent?.trim() || undefined,
          scheduledAt: parsedScheduledAt,
          status: nextStatus,
        }
      });
      const payload = {
        ...post,
        url: appUrls.campaignPost(post.campaignId, post.id),
        campaignUrl: appUrls.campaign(post.campaignId),
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'list_posts',
    title: 'List Posts',
    description: `List the posts inside one campaign, newest first. This is how you get a postId — list_campaigns only reports how many posts a campaign has, and every other post tool requires an id.

Each entry carries the post's "url", its status and schedule, a short "textPreview" (with "textLength" for the true size), and "mediaCount". When you need a post's full copy, call get_post_text with its postId; for its media and publishing history, call get_post.`,
    inputSchema: {
      campaignId: z.string().min(1).describe('The campaign to list posts for (from list_campaigns)'),
      status: z.enum(POST_STATUS_FILTER_VALUES).optional().describe('Optional: only return posts in this status'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Posts per page (default 25)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { campaignId, status, page, limit } = input as {
        campaignId: string;
        status?: string;
        page: number;
        limit: number;
      };
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: { id: true, name: true },
      });
      if (!campaign) throw new Error("Campaign not found");

      const where = { campaignId, userId, ...(status ? { status } : {}) };
      const total = await prisma.post.count({ where });
      const pages = Math.max(1, Math.ceil(total / limit));
      const rows = await prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          textContent: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { media: true } },
        },
      });

      const posts = rows.map((post) => {
        const preview = truncateContent(post.textContent ?? '', MAX_POST_PREVIEW_CHARS);
        return {
          postId: post.id,
          url: appUrls.campaignPost(campaignId, post.id),
          textPreview: preview.text,
          textTruncated: preview.truncated,
          textLength: preview.originalLength,
          status: post.status,
          scheduledAt: post.scheduledAt,
          mediaCount: post._count.media,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        };
      });

      const response = {
        campaignId,
        campaignUrl: appUrls.campaign(campaignId),
        campaignName: campaign.name,
        posts,
        total,
        page,
        pages,
        ...paginationHints(page, pages),
      };
      return { text: JSON.stringify(response, null, 2), structuredContent: response };
    }
  });

  tools.push({
    name: 'get_post',
    title: 'Get Post',
    description: 'Get details of a specific post, including the post "url" and its "campaignUrl" for linking back to Remix Studio.',
    inputSchema: {
      postId: z.string().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { postId }) => {
      const post = await prisma.post.findFirst({
        where: { id: postId, userId },
        include: { media: { orderBy: { position: 'asc' } }, executions: true }
      });
      if (!post) throw new Error("Post not found");
      const payload = {
        ...post,
        url: appUrls.campaignPost(post.campaignId, post.id),
        campaignUrl: appUrls.campaign(post.campaignId),
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'get_post_text',
    title: 'Get Post Text',
    description: 'Read only the text content and basic status metadata for a specific campaign post. Use this before update_post_text when revising post copy.',
    inputSchema: {
      postId: z.string().min(1),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, { postId }) => {
      const post = await prisma.post.findFirst({
        where: { id: postId, userId },
        select: {
          id: true,
          campaignId: true,
          textContent: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
          campaign: { select: { id: true, name: true } },
        },
      });
      if (!post) throw new Error("Post not found");
      const payload = {
        postId: post.id,
        url: appUrls.campaignPost(post.campaignId, post.id),
        campaignId: post.campaignId,
        campaignUrl: appUrls.campaign(post.campaignId),
        campaignName: post.campaign?.name ?? null,
        textContent: post.textContent ?? '',
        textLength: (post.textContent ?? '').length,
        status: post.status,
        scheduledAt: post.scheduledAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'update_post',
    title: 'Update Post',
    description: 'Update a post in a campaign.',
    inputSchema: {
      postId: z.string().min(1),
      textContent: z.string().max(28000).optional(),
      scheduledAt: z.string().optional().describe('ISO date string; pass an empty string to unset'),
      status: z.enum(MCP_POST_STATUS_VALUES).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, textContent, scheduledAt, status }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const hasScheduledAtUpdate = scheduledAt !== undefined;
      const parsedScheduledAt = parseScheduledAt(scheduledAt);
      const nextScheduledAt = hasScheduledAtUpdate ? (parsedScheduledAt ?? null) : post.scheduledAt;
      const nextStatus = status ?? post.status;
      if (nextStatus === 'scheduled') {
        if (!nextScheduledAt) throw new Error('scheduledAt is required when setting status to scheduled');
        await assertCampaignHasActiveSocialAccount(prisma, post.campaignId);
        await assertPostMediaReady(prisma, postId);
      }
      const updated = await prisma.post.update({
        where: { id: postId },
        data: {
          ...(textContent !== undefined && { textContent: textContent.trim() || null }),
          ...(hasScheduledAtUpdate && { scheduledAt: nextScheduledAt }),
          ...(status !== undefined && { status })
        }
      });
      const payload = {
        ...updated,
        url: appUrls.campaignPost(updated.campaignId, updated.id),
        campaignUrl: appUrls.campaign(updated.campaignId),
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'update_post_text',
    title: 'Update Post Text',
    description: 'Update only the text content for a campaign post. Use get_post_text first when editing existing copy so the assistant can preserve unchanged text intentionally.',
    inputSchema: {
      postId: z.string().min(1),
      textContent: z.string().max(28000).describe('Replacement post text. Pass an empty string to clear the post text.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, textContent }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const nextTextContent = textContent.trim() || null;
      const updated = await prisma.post.update({
        where: { id: postId },
        data: { textContent: nextTextContent },
        select: {
          id: true,
          campaignId: true,
          textContent: true,
          status: true,
          scheduledAt: true,
          updatedAt: true,
          campaign: { select: { id: true, name: true } },
        },
      });
      const payload = {
        postId: updated.id,
        url: appUrls.campaignPost(updated.campaignId, updated.id),
        campaignId: updated.campaignId,
        campaignUrl: appUrls.campaign(updated.campaignId),
        campaignName: updated.campaign?.name ?? null,
        textContent: updated.textContent ?? '',
        textLength: (updated.textContent ?? '').length,
        status: updated.status,
        scheduledAt: updated.scheduledAt,
        updatedAt: updated.updatedAt,
        previousTextLength: (post.textContent ?? '').length,
        message: 'Post text updated successfully.',
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'add_media_to_post',
    title: 'Add Media to Post',
    description: 'Add a media item (like an image from the library/album) to a post.',
    inputSchema: {
      postId: z.string().min(1),
      sourceUrl: z.string().min(1).describe('Internal S3 key for media owned by the authenticated user'),
      type: z.enum(POST_MEDIA_TYPE_VALUES).describe('image, video, or gif'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, sourceUrl, type }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const safeSourceUrl = await assertPostMediaSourceAllowed(prisma, userId, post.campaignId, sourceUrl);
      const max = await prisma.postMedia.aggregate({
        where: { postId },
        _max: { position: true },
      });
      const nextPosition = (max._max.position ?? -1) + 1;
      const media = await prisma.postMedia.create({
        data: {
          postId,
          sourceUrl: safeSourceUrl,
          type,
          position: nextPosition,
          status: 'pending'
        }
      });
      const payload = {
        ...media,
        campaignId: post.campaignId,
        postUrl: appUrls.campaignPost(post.campaignId, post.id),
        campaignUrl: appUrls.campaign(post.campaignId),
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  tools.push({
    name: 'schedule_post',
    title: 'Schedule Post',
    description: 'Update a post status to "scheduled" and set the scheduled time.',
    inputSchema: {
      postId: z.string().min(1),
      scheduledAt: z.string().describe('ISO date string (e.g. 2026-05-01T12:00:00Z)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, scheduledAt }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const parsedScheduledAt = parseScheduledAt(scheduledAt);
      if (!parsedScheduledAt) throw new Error('scheduledAt is required');
      await assertCampaignHasActiveSocialAccount(prisma, post.campaignId);
      await assertPostMediaReady(prisma, postId);

      const updated = await prisma.post.update({
        where: { id: postId },
        data: {
          scheduledAt: parsedScheduledAt,
          status: 'scheduled'
        }
      });
      const payload = {
        ...updated,
        url: appUrls.campaignPost(updated.campaignId, updated.id),
        campaignUrl: appUrls.campaign(updated.campaignId),
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    }
  });

  return tools;
}
