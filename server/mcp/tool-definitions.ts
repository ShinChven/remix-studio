import { z } from 'zod';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import type { ProviderRepository } from '../db/provider-repository';
import { PROVIDER_MODELS_MAP } from '../../src/types';

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
}

const MAX_CONTENT_PREVIEW_CHARS = 4096;

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

export function createAssistantToolDefinitions(deps: ToolDependencies): AssistantToolDefinition[] {
  const { repository, userRepository, prisma, providerRepository } = deps;

  const tools: AssistantToolDefinition[] = [];

  // ─── create_library ───
  tools.push({
    name: 'create_library',
    title: 'Create Library',
    description: 'Create a new text library.',
    inputSchema: {
      name: z.string().min(1).max(256).describe('Library name'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { name } = input as { name: string };
      const id = crypto.randomUUID();
      await repository.createLibrary(userId, { id, name, type: 'text' });
      return {
        text: JSON.stringify({ id, name, type: 'text', message: 'Library created successfully' }),
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
      const id = crypto.randomUUID();
      await repository.createLibraryItem(userId, library_id, { id, content, title, tags });
      return {
        text: JSON.stringify({ id, library_id, title, tags, message: 'Prompt created successfully' }),
      };
    },
  });

  // ─── batch_create_prompts ───
  tools.push({
    name: 'batch_create_prompts',
    title: 'Batch Create Prompts',
    description: 'Create multiple text prompts (items) in a library in a single batch. Each item requires content; title and tags are optional.',
    inputSchema: {
      library_id: z.string().describe('The library ID to add the prompts to'),
      items: z.array(z.object({
        content: z.string().min(1).describe('The prompt text content'),
        title: z.string().optional().describe('Optional title for the prompt'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      })).min(1).max(100).describe('Array of prompts to create (1–100 items)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, items } = input as {
        library_id: string;
        items: { content: string; title?: string; tags?: string[] }[];
      };
      const libraryItems = items.map((item) => ({
        id: crypto.randomUUID(),
        content: item.content,
        title: item.title,
        tags: item.tags,
      }));
      await repository.createLibraryItemsBatch(userId, library_id, libraryItems);
      return {
        text: JSON.stringify({
          library_id,
          created: libraryItems.map((item) => ({ id: item.id, title: item.title })),
          count: libraryItems.length,
          message: `${libraryItems.length} prompts created successfully`,
        }),
      };
    },
  });

  // ─── search_library_items ───
  tools.push({
    name: 'search_library_items',
    title: 'Search Library Items',
    description: 'Search text prompts across libraries by keyword (matches content and title) and/or tags. Returns matching items with their library context. Long content is truncated in the preview.',
    inputSchema: {
      query: z.string().describe('Search keyword to match against prompt content and title'),
      library_id: z.string().optional().describe('Optional: limit search to a specific library'),
      tags: z.array(z.string()).optional().describe('Optional: filter by tags (items must contain ALL specified tags)'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { query, library_id, tags, page, limit } = input as {
        query: string;
        library_id?: string;
        tags?: string[];
        page: number;
        limit: number;
      };
      const result = await repository.searchLibraryItems(userId, query, {
        libraryId: library_id,
        tags,
        page,
        limit,
      });
      return {
        text: JSON.stringify({
          items: result.items.map((item) => {
            const preview = truncateContent(item.content ?? '');
            return {
              id: item.id,
              libraryId: item.libraryId,
              libraryName: item.libraryName,
              content: preview.text,
              contentTruncated: preview.truncated,
              contentLength: preview.originalLength,
              title: item.title,
              tags: item.tags,
            };
          }),
          total: result.total,
          page: result.page,
          pages: result.pages,
          ...paginationHints(result.page, result.pages),
        }, null, 2),
      };
    },
  });

  // ─── get_storage_usage ───
  tools.push({
    name: 'get_storage_usage',
    title: 'Get Storage Usage',
    description: 'Get storage usage summary for the authenticated user. Returns total usage, storage limit, and breakdown by category (projects, libraries, archives, trash). Computed via SQL aggregates — cheap to call.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
      const [breakdown, userRecord] = await Promise.all([
        repository.getStorageUsageAggregate(userId),
        userRepository.findById(userId),
      ]);

      const storageLimit = userRecord?.storageLimit || 5 * 1024 * 1024 * 1024;
      const totalSize = breakdown.projects + breakdown.libraries + breakdown.archives + breakdown.trash;

      return {
        text: JSON.stringify({
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
          limit: storageLimit,
          limitFormatted: formatSize(storageLimit),
          usagePercent: Number(((totalSize / storageLimit) * 100).toFixed(1)),
          categories: {
            projects: { size: breakdown.projects, formatted: formatSize(breakdown.projects) },
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
    description: 'List project albums for the authenticated user, with album item count and total album size per project. Defaults to active projects only — pass status="archived" or "all" to include archived.',
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
          projectName: project.name,
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

  // ─── list_available_models ───
  tools.push({
    name: 'list_available_models',
    title: 'List Available Models',
    description: 'List AI models the user can actually invoke, as pre-joined (providerId, modelConfigId) tuples. Use the returned providerId + modelConfigId verbatim when calling create_project_with_workflow. A provider with no matching saved instance appears in unusableModels with a reason.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
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

      return {
        text: JSON.stringify({
          usableModels: usable,
          unusableModels: unusable,
          note: 'Pass providerId and modelConfigId from a usableModels entry directly to create_project_with_workflow.',
        }, null, 2),
      };
    },
  });

  // ─── list_all_libraries ───
  tools.push({
    name: 'list_all_libraries',
    title: 'List Libraries',
    description: 'List libraries (text, image, audio, video) for the authenticated user. Returns library id, name, type, and item count. Use the library id as libraryId when composing workflow items of type *_from_library or *_library.',
    inputSchema: {
      type: z.enum(['text', 'image', 'audio', 'video']).optional().describe('Optional: filter by library type'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Items per page (default 50)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { type, page, limit } = input as {
        type?: 'text' | 'image' | 'audio' | 'video';
        page: number;
        limit: number;
      };
      const result = await repository.getUserLibraries(userId, page, limit, undefined, false, type as any);
      const libraries = result.items.map((lib) => ({
        id: lib.id,
        name: lib.name,
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

Use this tool to find an item by name/title before composing a workflow. Combine with list_all_libraries to first discover the libraryId.`,
    inputSchema: {
      library_id: z.string().describe('The library ID to browse (from list_all_libraries)'),
      query: z.string().optional().describe('Optional: filter items by title/name (case-insensitive substring match)'),
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Items per page (default 25)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { library_id, query, page, limit } = input as {
        library_id: string;
        query?: string;
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

      const result = await repository.getLibraryItemsPaginated(userId, library_id, page, limit, query);
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

      return {
        text: JSON.stringify({
          libraryId: library_id,
          libraryName: library.name,
          libraryType: library.type,
          items,
          total: result.total,
          page: result.page,
          pages: result.pages,
          ...paginationHints(result.page, result.pages),
          hint: isText
            ? 'Use item.text as the "value" of a "text" workflow item.'
            : `Use item.storageKey as the "value" of an "${library.type}" workflow item to pin this specific file.`,
        }, null, 2),
      };
    },
  });

  // ─── create_project_with_workflow ───
  const WORKFLOW_ITEM_TYPES = [
    'text',
    'text_from_library', 'text_library',
    'image', 'image_from_library', 'image_library',
    'audio', 'audio_from_library', 'audio_library',
    'video', 'video_from_library', 'video_library',
  ] as const;

  tools.push({
    name: 'create_project_with_workflow',
    title: 'Create Project with Workflow',
    description: `Create a new project with a preset workflow.

Workflow item types:
- "text": static prompt text. Requires "value" with the text content. To use a specific item from a text library, first call get_library_items and pass the returned item.text as "value".
- "text_from_library" / "text_library": reference a text library (runtime picks random items). Requires "libraryId".
- "image": image context slot. Leave "value" empty for a blank placeholder, or set "value" to item.storageKey from get_library_items to pin a specific image file.
- "image_from_library" / "image_library": reference an image library (runtime picks randomly). Requires "libraryId".
- "audio": audio context slot. Leave "value" empty, or set "value" to item.storageKey from get_library_items to pin a specific audio file.
- "audio_from_library" / "audio_library": reference an audio library. Requires "libraryId".
- "video": video context slot. Leave "value" empty, or set "value" to item.storageKey from get_library_items to pin a specific video file.
- "video_from_library" / "video_library": reference a video library. Requires "libraryId".

Recommended workflow:
1. Call list_available_models → pick one usableModels entry (copy providerId + modelConfigId verbatim).
2. Call list_all_libraries → discover libraries.
3. Call get_library_items(libraryId) → find items by name.
4. Present the full plan to the user before creating the project.`,
    inputSchema: {
      name: z.string().min(1).max(256).describe('Project display name'),
      type: z.enum(['image', 'text', 'video', 'audio']).describe('Project generation type'),
      providerId: z.string().optional().describe('Saved provider ID (from list_available_models usableModels[].providerId)'),
      modelConfigId: z.string().optional().describe('Model config ID (from list_available_models usableModels[].modelConfigId)'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g. "16:9", "1:1") — available options depend on the selected model'),
      quality: z.string().optional().describe('Quality level — available options depend on the selected model'),
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
        libraryId: z.string().optional().describe('Library ID (required for *_from_library and *_library types)'),
        selectedTags: z.array(z.string()).optional().describe('Optional tag filter applied when picking items from the library'),
      })).min(1).max(200).describe('Ordered list of workflow items (1–200)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const {
        name, type, providerId, modelConfigId, aspectRatio, quality, shuffle, prefix,
        systemPrompt, temperature, maxTokens, duration, resolution, sound, workflowItems,
      } = input as {
        name: string;
        type: 'image' | 'text' | 'video' | 'audio';
        providerId?: string;
        modelConfigId?: string;
        aspectRatio?: string;
        quality?: string;
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
        const needsLibrary = item.itemType.endsWith('_from_library') || item.itemType.endsWith('_library');
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
          name,
          type,
          workflowItemCount: workflow.length,
          message: 'Project created successfully. Open it in Remix Studio to review the workflow and run generation.',
        }),
      };
    },
  });

  return tools;
}
