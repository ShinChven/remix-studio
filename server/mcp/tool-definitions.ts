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
  /** When true, the assistant runner must obtain explicit user confirmation
   *  for the exact normalized args before invoking the handler. */
  requiresConfirmation?: boolean;
  handler: (userId: string, input: any) => Promise<ToolResult>;
}

export interface ToolDependencies {
  repository: IRepository;
  userRepository: UserRepository;
  prisma: PrismaClient;
  providerRepository: ProviderRepository;
}

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

export function createAssistantToolDefinitions(deps: ToolDependencies): AssistantToolDefinition[] {
  const { repository, userRepository, prisma, providerRepository } = deps;

  const tools: AssistantToolDefinition[] = [];

  // ─── list_libraries ───
  tools.push({
    name: 'list_libraries',
    title: 'List Libraries',
    description: 'List all text libraries for the authenticated user. Returns library id, name, type, and item count.',
    inputSchema: {
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Items per page (default 50)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { page, limit } = input as { page: number; limit: number };
      const result = await repository.getUserLibraries(userId, page, limit, undefined, false, 'text');
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
    description: 'Search text prompts across libraries by keyword (matches content and title) and/or tags. Returns matching items with their library context.',
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
          items: result.items.map((item) => ({
            id: item.id,
            libraryId: item.libraryId,
            libraryName: item.libraryName,
            content: item.content,
            title: item.title,
            tags: item.tags,
          })),
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
    description: 'Get storage usage summary for the authenticated user. Returns total usage, storage limit, and breakdown by category (projects, libraries, archives, trash).',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
      const [allItems, trashItems, userRecord] = await Promise.all([
        repository.getAllUserItems(userId),
        repository.getTrashItems(userId),
        userRepository.findById(userId),
      ]);

      const storageLimit = userRecord?.storageLimit || 5 * 1024 * 1024 * 1024;

      let totalProjectsSize = 0;
      let totalLibrarySize = 0;
      let totalExportSize = 0;

      const totalTrashSize = trashItems.reduce(
        (sum, item) => sum + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0),
        0,
      );

      for (const item of allItems) {
        const itemSize = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
        if (item._type === 'ALBUM' || item._type === 'WORKFLOW_ITEM') {
          totalProjectsSize += itemSize;
        } else if (item._type === 'LIBRARY_ITEM') {
          totalLibrarySize += itemSize;
        } else if (item._type === 'EXPORT' && item.status === 'completed') {
          totalExportSize += Number(item.fileSize || 0);
        }
      }

      const totalSize = totalProjectsSize + totalLibrarySize + totalExportSize + totalTrashSize;

      return {
        text: JSON.stringify({
          totalSize,
          totalSizeFormatted: formatSize(totalSize),
          limit: storageLimit,
          limitFormatted: formatSize(storageLimit),
          usagePercent: Number(((totalSize / storageLimit) * 100).toFixed(1)),
          categories: {
            projects: { size: totalProjectsSize, formatted: formatSize(totalProjectsSize) },
            libraries: { size: totalLibrarySize, formatted: formatSize(totalLibrarySize) },
            archives: { size: totalExportSize, formatted: formatSize(totalExportSize) },
            trash: { size: totalTrashSize, formatted: formatSize(totalTrashSize) },
          },
        }, null, 2),
      };
    },
  });

  // ─── list_albums ───
  tools.push({
    name: 'list_albums',
    title: 'List Albums',
    description: 'List all project albums for the authenticated user. Returns each project with its album item count and total album size.',
    inputSchema: {
      page: z.number().int().min(1).default(1).describe('Page number (default 1)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Items per page (default 20)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId, input) => {
      const { page, limit } = input as { page: number; limit: number };
      const projectsResult = await repository.getUserProjects(userId, page, limit);

      const albumStats = await Promise.all(
        projectsResult.items.map(async (project) => {
          const albumItems = await prisma.albumItem.findMany({
            where: { projectId: project.id, userId },
            select: { size: true, optimizedSize: true, thumbnailSize: true },
          });
          const totalSize = albumItems.reduce(
            (sum, item) => sum + Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0),
            0,
          );
          return {
            projectId: project.id,
            projectName: project.name,
            itemCount: albumItems.length,
            totalSize,
            totalSizeFormatted: formatSize(totalSize),
          };
        }),
      );

      return {
        text: JSON.stringify({
          albums: albumStats,
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
    description: 'List all available AI models grouped by provider type. Also returns the user\'s saved provider instances (with their IDs) so you know which providerId to use when creating a project. Use modelConfigId from the models list and providerId from the savedProviders list when calling create_project_with_workflow.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    handler: async (userId) => {
      const savedProviders = await providerRepository.listProviders(userId);

      const modelCatalog = Object.entries(PROVIDER_MODELS_MAP).map(([providerType, models]) => ({
        providerType,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          modelId: m.modelId,
          category: m.category,
          promptLimit: m.promptLimit,
          options: m.options,
        })),
      }));

      const providers = savedProviders.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        hasKey: p.hasKey,
        concurrency: p.concurrency,
      }));

      return {
        text: JSON.stringify({
          modelCatalog,
          savedProviders: providers,
          note: 'Use modelConfigId (from modelCatalog[].models[].id) and providerId (from savedProviders[].id, must match the correct providerType) when creating a project.',
        }, null, 2),
      };
    },
  });

  // ─── list_all_libraries ───
  tools.push({
    name: 'list_all_libraries',
    title: 'List All Libraries',
    description: 'List all libraries (text, image, audio, video) for the authenticated user. Returns library id, name, type, and item count. Use the library id as libraryId when composing workflow items of type *_from_library or *_library.',
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
    description: `Browse items inside a specific library (any type: text, image, audio, video). Returns each item's id, title (name), content, and tags.

For text libraries: "content" is the prompt text — use it directly as the "value" of a "text" workflow item.
For image/audio/video libraries: "content" is the S3 storage key — use it as the "value" of an "image"/"audio"/"video" workflow item to pin a specific file.

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
      const items = result.items.map((item) => ({
        id: item.id,
        title: item.title ?? null,
        content: item.content,
        tags: item.tags ?? [],
        thumbnailUrl: item.thumbnailUrl ?? null,
      }));

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
          hint: library.type === 'text'
            ? 'Use item.content as the "value" of a "text" workflow item.'
            : `Use item.content as the "value" of an "${library.type}" workflow item to pin this specific file.`,
        }, null, 2),
      };
    },
  });

  // ─── create_project_with_workflow ───
  tools.push({
    name: 'create_project_with_workflow',
    title: 'Create Project with Workflow',
    description: `Create a new project with a preset workflow. Supply the project type, provider/model configuration, generation options, and an ordered list of workflow items.

Workflow item types:
- "text": static prompt text. Requires "value" with the text content. To use a specific item from a text library, first call get_library_items and pass the returned item.content as "value".
- "text_from_library" / "text_library": reference a text library (runtime picks random items). Requires "libraryId".
- "image": image context slot. Leave "value" empty for a blank placeholder, or set "value" to item.content from get_library_items to pin a specific image file.
- "image_from_library" / "image_library": reference an image library (runtime picks randomly). Requires "libraryId".
- "audio": audio context slot. Leave "value" empty, or set "value" to item.content from get_library_items to pin a specific audio file.
- "audio_from_library" / "audio_library": reference an audio library. Requires "libraryId".
- "video": video context slot. Leave "value" empty, or set "value" to item.content from get_library_items to pin a specific video file.
- "video_from_library" / "video_library": reference a video library. Requires "libraryId".

IMPORTANT — Confirmation required before creating:
Before calling this tool, present a full summary to the user and ask for explicit approval. The summary must include:
- Project name, type, provider name, and model name
- Each workflow item in order: its type, and either its text content preview or library/file name
- All generation options (aspect ratio, quality, shuffle, prefix, etc.) that will be set

Only proceed after the user confirms. If the user requests changes, update the plan and confirm again.

Recommended workflow:
1. Call list_available_models → choose and confirm provider + model with user.
2. Call list_all_libraries → discover libraries; confirm selections with user.
3. Call get_library_items(libraryId) → find items by name; confirm specific items with user.
4. Present the complete project plan to the user and wait for approval.
5. Call create_project_with_workflow only after explicit user confirmation.`,
    inputSchema: {
      name: z.string().min(1).max(256).describe('Project display name'),
      type: z.enum(['image', 'text', 'video', 'audio']).describe('Project generation type'),
      providerId: z.string().optional().describe('Saved provider ID (from list_available_models savedProviders[].id)'),
      modelConfigId: z.string().optional().describe('Model config ID (from list_available_models modelCatalog[].models[].id)'),
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
        itemType: z.enum([
          'text',
          'text_from_library', 'text_library',
          'image', 'image_from_library', 'image_library',
          'audio', 'audio_from_library', 'audio_library',
          'video', 'video_from_library', 'video_library',
        ]).describe('Workflow item type'),
        value: z.string().optional().describe('For "text": the prompt text. For "image"/"audio"/"video": leave empty for a blank slot, or set to item.content from get_library_items to pin a specific file.'),
        libraryId: z.string().optional().describe('Library ID (required for *_from_library and *_library types)'),
        selectedTags: z.array(z.string()).optional().describe('Optional tag filter applied when picking items from the library'),
      })).min(1).max(200).describe('Ordered list of workflow items (1–200)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    category: 'mutate',
    requiresConfirmation: true,
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
          itemType: string;
          value?: string;
          libraryId?: string;
          selectedTags?: string[];
        }[];
      };

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
          default:
            internalType = 'text';
            internalValue = '';
        }

        return {
          id: crypto.randomUUID(),
          type: internalType,
          value: internalValue,
          order: idx,
          selectedTags: item.selectedTags,
        };
      });

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
