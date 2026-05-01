import { z } from 'zod';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import type { ProviderRepository } from '../db/provider-repository';
import { PROVIDER_MODELS_MAP } from '../../src/types';

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
  const { repository, userRepository, prisma, providerRepository } = deps;

  const tools: AssistantToolDefinition[] = [];

  // ─── create_library ───
  tools.push({
    name: 'create_library',
    title: 'Create Library',
    description: 'Create a new library of a specific type (text, image, audio, video). Description is optional and should explain what the library contains or when to use it.',
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
        text: JSON.stringify({ id, name, description: nextDescription ?? null, type, message: 'Library created successfully' }),
      };
    },
  });

  // ─── update_library ───
  tools.push({
    name: 'update_library',
    title: 'Update Library',
    description: 'Update an existing library name and/or description. Only provided fields are changed.',
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
        text: JSON.stringify({ id, library_id, name: library.name, title, tags, message: 'Prompt created successfully' }),
      };
    },
  });

  // ─── batch_create_prompts ───
  tools.push({
    name: 'batch_create_prompts',
    title: 'Batch Create Prompts',
    description: 'Create multiple text prompts (library items) in a library in a single batch. Each item requires content; title and tags are optional. For extensive library construction, especially when creating more than 10 items, call this tool multiple times with smaller batches instead of generating every item in one call. Multiple batches keep the generated items more comprehensive and avoid model input/output limits.',
    inputSchema: {
      library_id: z.string().describe('The library ID to add the prompts to'),
      items: z.array(z.object({
        content: z.string().min(1).describe('The prompt text content'),
        title: z.string().optional().describe('Optional title for the prompt'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
      })).min(1).max(100).describe('Array of prompts to create (1-100 items). Prefer batches of 10 or fewer items; for larger library builds, call this tool repeatedly until all items are created.'),
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
      return {
        text: JSON.stringify({
          library_id,
          name: library.name,
          created: libraryItems.map((item) => ({ id: item.id, title: item.title })),
          count: libraryItems.length,
          message: `${libraryItems.length} prompts created successfully`,
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
    description: 'Search library items by keyword (matches content and title) and/or tags. Returns matching items with their library context. Long content is truncated in the preview.',
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
    description: 'List project albums for the authenticated user, with project descriptions, album item count, and total album size per project. Defaults to active projects only — pass status="archived" or "all" to include archived.',
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
    description: 'List libraries (text, image, audio, video) for the authenticated user. Returns library id, name, description, type, and item count. Use the library id as libraryId when composing workflow items of type *_from_library or *_library.',
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

Use this tool to find an item by name/title before composing a workflow. Combine with list_libraries to first discover the libraryId.`,
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
    description: 'Read one project, including its current workflow. Always call this before update_project when changing workflowItems so unchanged workflow items can be carried forward.',
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

      const workflowItems = (project.workflow || []).map(toToolWorkflowItem);
      const response = {
        projectId: project.id,
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
          'update_project replaces the whole workflow when workflowItems is provided. Include every existing workflow item you want to keep, in order; omit only items the user explicitly asked to remove.',
        counts: {
          jobs: project.jobs?.length ?? 0,
          album: project.album?.length ?? 0,
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
    description: `Create a new project with a preset workflow.

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
          name,
          description: description?.trim() || null,
          type,
          workflowItemCount: workflow.length,
          message: 'Project created successfully. Open it in Remix Studio to review the workflow and run generation.',
        }),
      };
    },
  });

  // ─── update_project ───
  tools.push({
    name: 'update_project',
    title: 'Update Project',
    description: `Update an existing project's metadata, settings, or workflow. Only provided non-workflow fields will be updated.

Important workflow behavior:
- If workflowItems is omitted, the existing workflow is unchanged.
- If workflowItems is provided, it completely replaces the existing workflow.
- Before changing workflowItems, call get_project and start from its returned workflowItems. Carry forward every existing item the user did not explicitly ask to remove.`,
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
      })).optional().describe('Replacement ordered workflow list. If provided, include every existing workflow item to keep; omitted existing items are removed. Call get_project first.'),
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
          name: updatedName,
          description: description !== undefined ? (description.trim() || null) : (existingProject.description ?? null),
          updatedFields: Object.keys(updates),
          message: 'Project updated successfully.',
        }),
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
    description: 'Update the title and/or tags of multiple items in a library in a single batch (up to 100 items). Content editing is not supported in batch — use update_library_item for that. Useful for bulk re-tagging or renaming after importing or reviewing a library.',
    inputSchema: {
      library_id: z.string().describe('The library ID that contains the items'),
      updates: z.array(z.object({
        item_id: z.string().describe('ID of the item to update'),
        title: z.string().optional().describe('New title (omit to keep existing; pass empty string to clear)'),
        tags: z.array(z.string()).optional().describe('Replacement tags (omit to keep existing; pass [] to clear all)'),
      })).min(1).max(100).describe('List of items to update (1–100)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'mutate',
    handler: async (userId, input) => {
      const { library_id, updates } = input as {
        library_id: string;
        updates: { item_id: string; title?: string; tags?: string[] }[];
      };

      const library = await repository.getLibrary(userId, library_id);
      if (!library) {
        return { text: JSON.stringify({ error: `Library "${library_id}" not found.` }), isError: true };
      }

      const results: { item_id: string; status: 'updated' | 'error'; error?: string }[] = [];

      for (const upd of updates) {
        const itemUpdates: { title?: string; tags?: string[] } = {};
        if (upd.title !== undefined) itemUpdates.title = upd.title;
        if (upd.tags !== undefined) itemUpdates.tags = upd.tags;

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
      status: z.string().optional().describe('Filter by status (e.g. "active", "disconnected")'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { status }) => {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId, ...(status ? { status } : {}) },
      });
      return { text: JSON.stringify(accounts) };
    }
  });

  tools.push({
    name: 'create_campaign',
    title: 'Create Campaign',
    description: 'Creates a new social media campaign.',
    inputSchema: {
      name: z.string().describe('Name of the campaign'),
      description: z.string().optional(),
      socialAccountIds: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { name, description, socialAccountIds }) => {
      const campaign = await prisma.campaign.create({
        data: {
          userId,
          name,
          description,
          ...(socialAccountIds && socialAccountIds.length > 0 ? {
            socialAccounts: { connect: socialAccountIds.map((id: string) => ({ id })) }
          } : {})
        },
        include: { socialAccounts: true }
      });
      return { text: JSON.stringify(campaign) };
    }
  });

  tools.push({
    name: 'list_campaigns',
    title: 'List Campaigns',
    description: 'Returns the users social media campaigns.',
    inputSchema: {
      status: z.string().optional().describe('Filter by status'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { status }) => {
      const campaigns = await prisma.campaign.findMany({
        where: { userId, ...(status ? { status } : {}) },
        include: { socialAccounts: true, _count: { select: { posts: true } } }
      });
      return { text: JSON.stringify(campaigns) };
    }
  });

  tools.push({
    name: 'update_campaign',
    title: 'Update Campaign',
    description: 'Updates a social media campaign.',
    inputSchema: {
      campaignId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      socialAccountIds: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { campaignId, name, description, status, socialAccountIds }) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }});
      if (!campaign || campaign.userId !== userId) throw new Error("Campaign not found");
      const updated = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(status && { status }),
          ...(socialAccountIds ? {
            socialAccounts: { set: socialAccountIds.map((id: string) => ({ id })) }
          } : {})
        },
        include: { socialAccounts: true }
      });
      return { text: JSON.stringify(updated) };
    }
  });

  tools.push({
    name: 'create_post',
    title: 'Create Post',
    description: 'Creates a new post in a campaign.',
    inputSchema: {
      campaignId: z.string(),
      textContent: z.string().optional(),
      scheduledAt: z.string().optional().describe('ISO date string (e.g. 2026-05-01T12:00:00Z)'),
      status: z.string().optional().describe('e.g., draft, scheduled'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { campaignId, textContent, scheduledAt, status }) => {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }});
      if (!campaign || campaign.userId !== userId) throw new Error("Campaign not found");
      const post = await prisma.post.create({
        data: {
          userId,
          campaignId,
          textContent,
          ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
          ...(status && { status })
        }
      });
      return { text: JSON.stringify(post) };
    }
  });

  tools.push({
    name: 'get_post',
    title: 'Get Post',
    description: 'Get details of a specific post.',
    inputSchema: {
      postId: z.string(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    category: 'read',
    handler: async (userId, { postId }) => {
      const post = await prisma.post.findFirst({
        where: { id: postId, userId },
        include: { media: true, executions: true }
      });
      if (!post) throw new Error("Post not found");
      return { text: JSON.stringify(post) };
    }
  });

  tools.push({
    name: 'update_post',
    title: 'Update Post',
    description: 'Update a post in a campaign.',
    inputSchema: {
      postId: z.string(),
      textContent: z.string().optional(),
      scheduledAt: z.string().optional().describe('ISO date string, pass null or empty string to unset'),
      status: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, textContent, scheduledAt, status }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const updated = await prisma.post.update({
        where: { id: postId },
        data: {
          ...(textContent !== undefined && { textContent }),
          ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
          ...(status !== undefined && { status })
        }
      });
      return { text: JSON.stringify(updated) };
    }
  });

  tools.push({
    name: 'add_media_to_post',
    title: 'Add Media to Post',
    description: 'Add a media item (like an image from the library/album) to a post.',
    inputSchema: {
      postId: z.string(),
      sourceUrl: z.string().describe('The S3 key or URL of the media'),
      type: z.string().describe('image, video, or gif'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, sourceUrl, type }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      const media = await prisma.postMedia.create({
        data: {
          postId,
          sourceUrl,
          type,
          status: 'pending'
        }
      });
      return { text: JSON.stringify(media) };
    }
  });

  tools.push({
    name: 'schedule_post',
    title: 'Schedule Post',
    description: 'Update a post status to "scheduled" and set the scheduled time.',
    inputSchema: {
      postId: z.string(),
      scheduledAt: z.string().describe('ISO date string (e.g. 2026-05-01T12:00:00Z)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    category: 'mutate',
    requiresConfirmation: true,
    handler: async (userId, { postId, scheduledAt }) => {
      const post = await prisma.post.findUnique({ where: { id: postId }});
      if (!post || post.userId !== userId) throw new Error("Post not found");
      
      const campaign = await prisma.campaign.findUnique({
        where: { id: post.campaignId },
        include: { socialAccounts: true }
      });
      if (!campaign || campaign.socialAccounts.length === 0) {
        throw new Error("Cannot schedule post: Campaign has no linked social accounts.");
      }

      const updated = await prisma.post.update({
        where: { id: postId },
        data: {
          scheduledAt: new Date(scheduledAt),
          status: 'scheduled'
        }
      });
      return { text: JSON.stringify(updated) };
    }
  });

  return tools;
}
