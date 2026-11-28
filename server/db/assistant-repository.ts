import { PrismaClient } from '@prisma/client';

/**
 * Persistence for the standalone assistant chat runtime.
 *
 * Kept separate from generation-queue repositories so chat state does not
 * share tables, indexes, or lifecycle with queued jobs.
 */

export type AssistantMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type AssistantMessageStatus =
  | 'completed'
  | 'error'
  | 'awaiting_confirmation'
  | 'cancelled'
  | 'truncated';

export type AssistantStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'error';

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: unknown;
  thoughtSignature?: string;
  openAIReasoning?: { id: string; encryptedContent: string }[];
  kimiReasoningContent?: string;
  kimiRawArguments?: string;
}

export interface AssistantConversationRecord {
  id: string;
  userId: string;
  title: string;
  providerId: string | null;
  modelConfigId: string | null;
  approvedTools: string[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface AssistantMessageRecord {
  id: string;
  conversationId: string;
  swarmAgentId: string | null;
  role: AssistantMessageRole;
  content: string;
  toolCalls: AssistantToolCall[] | null;
  toolCallId: string | null;
  toolName: string | null;
  toolArgsJson: unknown | null;
  toolResultJson: unknown | null;
  status: AssistantMessageStatus | null;
  stopReason: AssistantStopReason | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorText: string | null;
  createdAt: number;
}

export type AssistantResourceEntityType = 'library' | 'project' | 'campaign' | 'post';

/** A workspace entity a conversation has touched, listed in the assistant sidebar. */
export interface AssistantConversationResourceRecord {
  id: string;
  conversationId: string;
  entityType: AssistantResourceEntityType;
  entityId: string;
  name: string | null;
  subType: string | null;
  href: string;
  summary: string | null;
  toolName: string | null;
  toolTitle: string | null;
  mentionCount: number;
  lastMentionedAt: number;
  createdAt: number;
}

export interface RecordConversationResourceInput {
  conversationId: string;
  entityType: AssistantResourceEntityType;
  entityId: string;
  name?: string | null;
  subType?: string | null;
  href: string;
  summary?: string | null;
  toolName?: string | null;
  toolTitle?: string | null;
}

export type AssistantPendingConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

export interface AssistantPendingConfirmationRecord {
  id: string;
  conversationId: string;
  swarmAgentId: string | null;
  swarmAgentName?: string | null;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolArgsJson: unknown;
  summary: string | null;
  status: AssistantPendingConfirmationStatus;
  expiresAt: number;
  createdAt: number;
}

export type AssistantSwarmRunStatus =
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
  | 'stopped'
  | 'failed';

export type AssistantSwarmAgentStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'awaiting_confirmation'
  | 'completed'
  | 'failed'
  | 'stopped';

export type AssistantSwarmToolScope = 'read' | 'propose' | 'write';

export interface AssistantSwarmAgentRecord {
  id: string;
  swarmRunId: string;
  name: string;
  role: string;
  brief: string;
  providerId: string | null;
  modelConfigId: string | null;
  toolScope: AssistantSwarmToolScope;
  status: AssistantSwarmAgentStatus;
  summary: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantSwarmBlackboardEntryRecord {
  id: string;
  swarmRunId: string;
  conversationId: string;
  key: string;
  title: string | null;
  content: string;
  dataJson: unknown | null;
  authorAgentId: string | null;
  authorName: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantSwarmRunRecord {
  id: string;
  conversationId: string;
  goal: string;
  status: AssistantSwarmRunStatus;
  createdAt: number;
  completedAt: number | null;
  agents: AssistantSwarmAgentRecord[];
  blackboardEntries: AssistantSwarmBlackboardEntryRecord[];
}

export interface AssistantSwarmPresetWorker {
  name: string;
  role: string;
  brief: string;
  toolScope: AssistantSwarmToolScope;
  providerId?: string | null;
  modelConfigId?: string | null;
}

export interface AssistantSwarmPreset {
  id: string;
  name: string;
  description: string;
  goalTemplate: string;
  workers: AssistantSwarmPresetWorker[];
}

export interface CreateConversationInput {
  userId: string;
  title?: string;
  providerId?: string | null;
  modelConfigId?: string | null;
}

export interface UpdateConversationInput {
  title?: string;
  providerId?: string | null;
  modelConfigId?: string | null;
  archived?: boolean;
}

export interface AppendMessageInput {
  conversationId: string;
  swarmAgentId?: string | null;
  role: AssistantMessageRole;
  content?: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;
  toolName?: string;
  toolArgsJson?: unknown;
  toolResultJson?: unknown;
  status?: AssistantMessageStatus;
  stopReason?: AssistantStopReason;
  inputTokens?: number;
  outputTokens?: number;
  errorText?: string;
}

export interface CreatePendingConfirmationInput {
  conversationId: string;
  swarmAgentId?: string | null;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolArgsJson: unknown;
  summary?: string;
  expiresAt: Date;
}

export interface ListConversationsOptions {
  limit?: number;
  cursor?: string;
  includeArchived?: boolean;
}

export interface SearchConversationsOptions {
  query?: string;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
}

export interface SearchConversationsResult {
  items: AssistantConversationRecord[];
  total: number;
  page: number;
  pages: number;
}

function toDateMs(value: Date | number | null | undefined): number {
  if (value == null) return 0;
  return value instanceof Date ? value.getTime() : value;
}

function toConversation(record: any): AssistantConversationRecord {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    providerId: record.providerId ?? null,
    modelConfigId: record.modelConfigId ?? null,
    approvedTools: Array.isArray(record.approvedTools) ? record.approvedTools : [],
    createdAt: toDateMs(record.createdAt),
    updatedAt: toDateMs(record.updatedAt),
    archivedAt: record.archivedAt ? toDateMs(record.archivedAt) : null,
  };
}

function toMessage(record: any): AssistantMessageRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
    swarmAgentId: record.swarmAgentId ?? null,
    role: record.role as AssistantMessageRole,
    content: record.content ?? '',
    toolCalls: Array.isArray(record.toolCalls) ? (record.toolCalls as AssistantToolCall[]) : null,
    toolCallId: record.toolCallId ?? null,
    toolName: record.toolName ?? null,
    toolArgsJson: record.toolArgsJson ?? null,
    toolResultJson: record.toolResultJson ?? null,
    status: (record.status ?? null) as AssistantMessageStatus | null,
    stopReason: (record.stopReason ?? null) as AssistantStopReason | null,
    inputTokens: record.inputTokens ?? null,
    outputTokens: record.outputTokens ?? null,
    errorText: record.errorText ?? null,
    createdAt: toDateMs(record.createdAt),
  };
}

function toPendingConfirmation(record: any): AssistantPendingConfirmationRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
    swarmAgentId: record.swarmAgentId ?? null,
    swarmAgentName: record.swarmAgent?.name ?? null,
    messageId: record.messageId,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    toolArgsJson: record.toolArgsJson,
    summary: record.summary ?? null,
    status: record.status as AssistantPendingConfirmationStatus,
    expiresAt: toDateMs(record.expiresAt),
    createdAt: toDateMs(record.createdAt),
  };
}

function toSwarmAgent(record: any): AssistantSwarmAgentRecord {
  return {
    id: record.id,
    swarmRunId: record.swarmRunId,
    name: record.name,
    role: record.role,
    brief: record.brief,
    providerId: record.providerId ?? null,
    modelConfigId: record.modelConfigId ?? null,
    toolScope: (record.toolScope ?? 'read') as AssistantSwarmToolScope,
    status: (record.status ?? 'queued') as AssistantSwarmAgentStatus,
    summary: record.summary ?? null,
    inputTokens: record.inputTokens ?? 0,
    outputTokens: record.outputTokens ?? 0,
    createdAt: toDateMs(record.createdAt),
    updatedAt: toDateMs(record.updatedAt),
  };
}

function toBlackboardEntry(record: any): AssistantSwarmBlackboardEntryRecord {
  return {
    id: record.id,
    swarmRunId: record.swarmRunId,
    conversationId: record.conversationId,
    key: record.key,
    title: record.title ?? null,
    content: record.content ?? '',
    dataJson: record.dataJson ?? null,
    authorAgentId: record.authorAgentId ?? null,
    authorName: record.authorName ?? 'Coordinator',
    createdAt: toDateMs(record.createdAt),
    updatedAt: toDateMs(record.updatedAt),
  };
}

function toSwarmRun(record: any): AssistantSwarmRunRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
    goal: record.goal,
    status: (record.status ?? 'running') as AssistantSwarmRunStatus,
    createdAt: toDateMs(record.createdAt),
    completedAt: record.completedAt ? toDateMs(record.completedAt) : null,
    agents: Array.isArray(record.agents) ? record.agents.map(toSwarmAgent) : [],
    blackboardEntries: Array.isArray(record.blackboardEntries)
      ? record.blackboardEntries.map(toBlackboardEntry)
      : [],
  };
}

function toConversationResource(record: any): AssistantConversationResourceRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
    entityType: record.entityType as AssistantResourceEntityType,
    entityId: record.entityId,
    name: record.name ?? null,
    subType: record.subType ?? null,
    href: record.href,
    summary: record.summary ?? null,
    toolName: record.toolName ?? null,
    toolTitle: record.toolTitle ?? null,
    mentionCount: record.mentionCount ?? 1,
    lastMentionedAt: toDateMs(record.lastMentionedAt),
    createdAt: toDateMs(record.createdAt),
  };
}

/** Per-user chat preferences. An empty `enabledProviderIds` means every chat provider. */
export interface AssistantSettingsRecord {
  enabledProviderIds: string[];
  lastProviderId: string | null;
  lastModelId: string | null;
  swarmEnabled: boolean;
  swarmWorkerProviderId: string | null;
  swarmWorkerModelId: string | null;
  swarmPresets: AssistantSwarmPreset[];
}

export type AssistantSettingsPatch = Partial<AssistantSettingsRecord>;

function toSettings(row: any): AssistantSettingsRecord {
  return {
    enabledProviderIds: row?.enabledProviderIds ?? [],
    lastProviderId: row?.lastProviderId ?? null,
    lastModelId: row?.lastModelId ?? null,
    swarmEnabled: Boolean(row?.swarmEnabled),
    swarmWorkerProviderId: row?.swarmWorkerProviderId ?? null,
    swarmWorkerModelId: row?.swarmWorkerModelId ?? null,
    swarmPresets: Array.isArray(row?.swarmPresetsJson) ? (row.swarmPresetsJson as AssistantSwarmPreset[]) : [],
  };
}

export class AssistantRepository {
  constructor(private prisma: PrismaClient) {}

  // ─── Settings ───

  async getSettings(userId: string): Promise<AssistantSettingsRecord> {
    const row = await this.prisma.assistantSetting.findUnique({ where: { userId } });
    return toSettings(row);
  }

  async updateSettings(userId: string, patch: AssistantSettingsPatch): Promise<AssistantSettingsRecord> {
    const data: Record<string, unknown> = {};
    if (patch.enabledProviderIds !== undefined) data.enabledProviderIds = [...new Set(patch.enabledProviderIds)];
    if (patch.lastProviderId !== undefined) data.lastProviderId = patch.lastProviderId;
    if (patch.lastModelId !== undefined) data.lastModelId = patch.lastModelId;
    if (patch.swarmEnabled !== undefined) data.swarmEnabled = patch.swarmEnabled;
    if (patch.swarmWorkerProviderId !== undefined) data.swarmWorkerProviderId = patch.swarmWorkerProviderId;
    if (patch.swarmWorkerModelId !== undefined) data.swarmWorkerModelId = patch.swarmWorkerModelId;
    if (patch.swarmPresets !== undefined) data.swarmPresetsJson = patch.swarmPresets;
    const row = await this.prisma.assistantSetting.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return toSettings(row);
  }

  // ─── Conversations ───

  async listConversations(userId: string, options: ListConversationsOptions = {}): Promise<AssistantConversationRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const records = await this.prisma.assistantConversation.findMany({
      where: {
        userId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    return records.map(toConversation);
  }

  /**
   * Offset-paginated search across conversation titles and message content.
   * Returns conversations the user owns, optionally filtered by a substring
   * query that matches either the title or any message content.
   */
  async searchConversations(
    userId: string,
    options: SearchConversationsOptions = {},
  ): Promise<SearchConversationsResult> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const query = (options.query ?? '').trim();

    const baseWhere: any = {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    };

    const where = query
      ? {
          ...baseWhere,
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            {
              messages: {
                some: { content: { contains: query, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : baseWhere;

    const [total, records] = await Promise.all([
      this.prisma.assistantConversation.count({ where }),
      this.prisma.assistantConversation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: records.map(toConversation),
      total,
      page,
      pages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async getConversation(userId: string, conversationId: string): Promise<AssistantConversationRecord | null> {
    const record = await this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
    });
    return record ? toConversation(record) : null;
  }

  async createConversation(input: CreateConversationInput): Promise<AssistantConversationRecord> {
    const record = await this.prisma.assistantConversation.create({
      data: {
        userId: input.userId,
        title: input.title ?? 'New chat',
        providerId: input.providerId ?? null,
        modelConfigId: input.modelConfigId ?? null,
      },
    });
    return toConversation(record);
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    updates: UpdateConversationInput,
  ): Promise<AssistantConversationRecord> {
    const data: any = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.providerId !== undefined) data.providerId = updates.providerId;
    if (updates.modelConfigId !== undefined) data.modelConfigId = updates.modelConfigId;
    if (updates.archived !== undefined) {
      data.archivedAt = updates.archived ? new Date() : null;
    }

    const result = await this.prisma.assistantConversation.updateMany({
      where: { id: conversationId, userId },
      data,
    });
    if (result.count === 0) {
      throw new Error('Conversation not found');
    }
    const record = await this.prisma.assistantConversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    return toConversation(record);
  }

  /** Bump updatedAt so the conversation surfaces at the top of the list. */
  async touchConversation(conversationId: string): Promise<void> {
    await this.prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const result = await this.prisma.assistantConversation.deleteMany({
      where: { id: conversationId, userId },
    });
    if (result.count === 0) {
      throw new Error('Conversation not found');
    }
  }

  /** Returns the tool names this conversation has pre-approved for auto-execution. */
  async getApprovedTools(userId: string, conversationId: string): Promise<string[]> {
    const record = await this.prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId },
      select: { approvedTools: true },
    });
    if (!record) throw new Error('Conversation not found');
    return Array.isArray(record.approvedTools) ? record.approvedTools : [];
  }

  /** Replace the approved-tools list for a conversation. Caller must dedupe. */
  async setApprovedTools(userId: string, conversationId: string, tools: string[]): Promise<string[]> {
    const result = await this.prisma.assistantConversation.updateMany({
      where: { id: conversationId, userId },
      data: { approvedTools: tools },
    });
    if (result.count === 0) {
      throw new Error('Conversation not found');
    }
    return tools;
  }

  /** Append a tool name to the approved list if not already present. */
  async addApprovedTool(conversationId: string, toolName: string): Promise<void> {
    const record = await this.prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      select: { approvedTools: true },
    });
    if (!record) return;
    const current = Array.isArray(record.approvedTools) ? record.approvedTools : [];
    if (current.includes(toolName)) return;
    await this.prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { approvedTools: [...current, toolName] },
    });
  }

  // ─── Messages ───

  async deleteMessagesFrom(conversationId: string, messageId: string): Promise<void> {
    const msg = await this.prisma.assistantMessage.findUnique({
      where: { id: messageId },
    });
    if (!msg || msg.conversationId !== conversationId) {
      throw new Error('Message not found');
    }

    await this.prisma.assistantMessage.deleteMany({
      where: {
        conversationId,
        createdAt: { gte: msg.createdAt },
      },
    });

    await this.prisma.assistantPendingConfirmation.deleteMany({
      where: {
        conversationId,
        createdAt: { gte: msg.createdAt },
      },
    });
  }

  async listMessages(
    conversationId: string,
    options: { limit?: number; swarmAgentId?: string | null } = {},
  ): Promise<AssistantMessageRecord[]> {
    const take = options.limit ? Math.min(Math.max(options.limit, 1), 500) : undefined;
    // Default to Coordinator messages (swarmAgentId: null) unless a specific worker id is requested.
    const swarmAgentId = options.swarmAgentId === undefined ? null : options.swarmAgentId;
    const records = await this.prisma.assistantMessage.findMany({
      where: { conversationId, swarmAgentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...(take ? { take } : {}),
    });
    return records.map(toMessage);
  }

  async findToolMessageByCallId(
    conversationId: string,
    toolCallId: string,
  ): Promise<AssistantMessageRecord | null> {
    const record = await this.prisma.assistantMessage.findFirst({
      where: { conversationId, role: 'tool', toolCallId },
    });
    return record ? toMessage(record) : null;
  }

  async appendMessage(input: AppendMessageInput): Promise<AssistantMessageRecord> {
    const record = await this.prisma.assistantMessage.create({
      data: {
        conversationId: input.conversationId,
        swarmAgentId: input.swarmAgentId ?? null,
        role: input.role,
        content: input.content ?? '',
        toolCalls: (input.toolCalls ?? undefined) as any,
        toolCallId: input.toolCallId ?? null,
        toolName: input.toolName ?? null,
        toolArgsJson: (input.toolArgsJson ?? undefined) as any,
        toolResultJson: (input.toolResultJson ?? undefined) as any,
        status: input.status ?? null,
        stopReason: input.stopReason ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        errorText: input.errorText ?? null,
      },
    });
    return toMessage(record);
  }

  async updateMessageStatus(messageId: string, status: AssistantMessageStatus): Promise<void> {
    await this.prisma.assistantMessage.update({
      where: { id: messageId },
      data: { status },
    });
  }

  // ─── Pending confirmations ───

  async createPendingConfirmation(input: CreatePendingConfirmationInput): Promise<AssistantPendingConfirmationRecord> {
    const record = await this.prisma.assistantPendingConfirmation.create({
      data: {
        conversationId: input.conversationId,
        swarmAgentId: input.swarmAgentId ?? null,
        messageId: input.messageId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolArgsJson: input.toolArgsJson as any,
        summary: input.summary ?? null,
        expiresAt: input.expiresAt,
      },
      include: { swarmAgent: { select: { name: true } } },
    });
    return toPendingConfirmation(record);
  }

  async getPendingConfirmation(id: string): Promise<AssistantPendingConfirmationRecord | null> {
    const record = await this.prisma.assistantPendingConfirmation.findUnique({
      where: { id },
      include: { swarmAgent: { select: { name: true } } },
    });
    return record ? toPendingConfirmation(record) : null;
  }

  /**
   * The confirmation a conversation is currently waiting on, if any. Used to
   * restore the confirm/cancel card after a reload — the prompt lives in the
   * database, so it outlives the request that produced it. Expired rows are
   * never returned; `resumeAfterConfirmation` retires them on decision.
   */
  async findActivePendingConfirmation(
    conversationId: string,
    now: Date = new Date(),
  ): Promise<AssistantPendingConfirmationRecord | null> {
    const record = await this.prisma.assistantPendingConfirmation.findFirst({
      where: { conversationId, swarmAgentId: null, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { swarmAgent: { select: { name: true } } },
    });
    return record ? toPendingConfirmation(record) : null;
  }

  /** All active pending confirmations across the Coordinator and every swarm worker. */
  async listActivePendingConfirmations(
    conversationId: string,
    now: Date = new Date(),
  ): Promise<AssistantPendingConfirmationRecord[]> {
    const records = await this.prisma.assistantPendingConfirmation.findMany({
      where: { conversationId, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: { swarmAgent: { select: { name: true } } },
    });
    return records.map(toPendingConfirmation);
  }

  async findPendingConfirmationForCall(
    conversationId: string,
    toolCallId: string,
  ): Promise<AssistantPendingConfirmationRecord | null> {
    const record = await this.prisma.assistantPendingConfirmation.findFirst({
      where: { conversationId, toolCallId, status: 'pending' },
    });
    return record ? toPendingConfirmation(record) : null;
  }

  async updatePendingConfirmationStatus(
    id: string,
    status: AssistantPendingConfirmationStatus,
  ): Promise<void> {
    await this.prisma.assistantPendingConfirmation.update({
      where: { id },
      data: { status },
    });
  }

  /** Mark all pending confirmations past their expiry as expired. Returns the
   *  number of rows updated. Callers can run this opportunistically. */
  async expireStaleConfirmations(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.assistantPendingConfirmation.updateMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
    return result.count;
  }

  // ─── Conversation resources ───

  /**
   * Upsert the entity a tool call touched. Re-mentioning an entity bumps it to
   * the top of the sidebar rather than creating a duplicate row.
   */
  async recordConversationResource(
    input: RecordConversationResourceInput,
  ): Promise<AssistantConversationResourceRecord> {
    const record = await this.prisma.assistantConversationResource.upsert({
      where: {
        conversationId_entityType_entityId: {
          conversationId: input.conversationId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      create: {
        conversationId: input.conversationId,
        entityType: input.entityType,
        entityId: input.entityId,
        name: input.name ?? null,
        subType: input.subType ?? null,
        href: input.href,
        summary: input.summary ?? null,
        toolName: input.toolName ?? null,
        toolTitle: input.toolTitle ?? null,
      },
      update: {
        // A later mention may carry a better name/summary; keep the old value
        // when the new call did not resolve one.
        name: input.name ?? undefined,
        subType: input.subType ?? undefined,
        href: input.href,
        summary: input.summary ?? undefined,
        // The row shows why it is listed, so the newest mention wins.
        toolName: input.toolName ?? undefined,
        toolTitle: input.toolTitle ?? undefined,
        mentionCount: { increment: 1 },
        lastMentionedAt: new Date(),
      },
    });
    return toConversationResource(record);
  }

  /** Most recently mentioned first. */
  async listConversationResources(
    conversationId: string,
    limit = 50,
  ): Promise<AssistantConversationResourceRecord[]> {
    const records = await this.prisma.assistantConversationResource.findMany({
      where: { conversationId },
      orderBy: { lastMentionedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return records.map(toConversationResource);
  }

  async deleteConversationResource(conversationId: string, resourceId: string): Promise<void> {
    const result = await this.prisma.assistantConversationResource.deleteMany({
      where: { id: resourceId, conversationId },
    });
    if (result.count === 0) {
      throw new Error('Resource not found');
    }
  }

  // ─── Swarm runs, agents & blackboard ───

  async createSwarmRun(input: { conversationId: string; goal: string }): Promise<AssistantSwarmRunRecord> {
    const record = await this.prisma.assistantSwarmRun.create({
      data: {
        conversationId: input.conversationId,
        goal: input.goal,
        status: 'running',
      },
      include: {
        agents: { orderBy: { createdAt: 'asc' } },
        blackboardEntries: { orderBy: { updatedAt: 'desc' } },
      },
    });
    return toSwarmRun(record);
  }

  async updateSwarmRun(
    swarmRunId: string,
    updates: { status?: AssistantSwarmRunStatus; completedAt?: Date | null },
  ): Promise<AssistantSwarmRunRecord> {
    const data: Record<string, unknown> = {};
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.completedAt !== undefined) data.completedAt = updates.completedAt;
    const record = await this.prisma.assistantSwarmRun.update({
      where: { id: swarmRunId },
      data,
      include: {
        agents: { orderBy: { createdAt: 'asc' } },
        blackboardEntries: { orderBy: { updatedAt: 'desc' } },
      },
    });
    return toSwarmRun(record);
  }

  async listSwarmRuns(conversationId: string, limit = 20): Promise<AssistantSwarmRunRecord[]> {
    const records = await this.prisma.assistantSwarmRun.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
      include: {
        agents: { orderBy: { createdAt: 'asc' } },
        blackboardEntries: { orderBy: { updatedAt: 'desc' } },
      },
    });
    return records.map(toSwarmRun);
  }

  async getSwarmRun(swarmRunId: string): Promise<AssistantSwarmRunRecord | null> {
    const record = await this.prisma.assistantSwarmRun.findUnique({
      where: { id: swarmRunId },
      include: {
        agents: { orderBy: { createdAt: 'asc' } },
        blackboardEntries: { orderBy: { updatedAt: 'desc' } },
      },
    });
    return record ? toSwarmRun(record) : null;
  }

  async createSwarmAgent(input: {
    swarmRunId: string;
    name: string;
    role: string;
    brief: string;
    providerId?: string | null;
    modelConfigId?: string | null;
    toolScope?: AssistantSwarmToolScope;
    status?: AssistantSwarmAgentStatus;
  }): Promise<AssistantSwarmAgentRecord> {
    const record = await this.prisma.assistantSwarmAgent.create({
      data: {
        swarmRunId: input.swarmRunId,
        name: input.name,
        role: input.role,
        brief: input.brief,
        providerId: input.providerId ?? null,
        modelConfigId: input.modelConfigId ?? null,
        toolScope: input.toolScope ?? 'read',
        status: input.status ?? 'queued',
      },
    });
    return toSwarmAgent(record);
  }

  async updateSwarmAgent(
    agentId: string,
    updates: {
      status?: AssistantSwarmAgentStatus;
      summary?: string | null;
      inputTokens?: number;
      outputTokens?: number;
    },
  ): Promise<AssistantSwarmAgentRecord> {
    const data: Record<string, unknown> = {};
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.summary !== undefined) data.summary = updates.summary;
    if (updates.inputTokens !== undefined) data.inputTokens = updates.inputTokens;
    if (updates.outputTokens !== undefined) data.outputTokens = updates.outputTokens;
    const record = await this.prisma.assistantSwarmAgent.update({
      where: { id: agentId },
      data,
    });
    return toSwarmAgent(record);
  }

  async addSwarmAgentTokens(agentId: string, inputTokens: number, outputTokens: number): Promise<void> {
    await this.prisma.assistantSwarmAgent.update({
      where: { id: agentId },
      data: {
        inputTokens: { increment: Math.max(0, inputTokens) },
        outputTokens: { increment: Math.max(0, outputTokens) },
      },
    });
  }

  async getSwarmAgent(agentId: string): Promise<(AssistantSwarmAgentRecord & { conversationId: string }) | null> {
    const record = await this.prisma.assistantSwarmAgent.findUnique({
      where: { id: agentId },
      include: { swarmRun: { select: { conversationId: true } } },
    });
    if (!record) return null;
    return {
      ...toSwarmAgent(record),
      conversationId: record.swarmRun.conversationId,
    };
  }

  async upsertBlackboardEntry(input: {
    swarmRunId: string;
    conversationId: string;
    key: string;
    title?: string | null;
    content: string;
    dataJson?: unknown;
    authorAgentId?: string | null;
    authorName: string;
  }): Promise<AssistantSwarmBlackboardEntryRecord> {
    const record = await this.prisma.assistantSwarmBlackboardEntry.upsert({
      where: {
        swarmRunId_key: {
          swarmRunId: input.swarmRunId,
          key: input.key,
        },
      },
      create: {
        swarmRunId: input.swarmRunId,
        conversationId: input.conversationId,
        key: input.key,
        title: input.title ?? null,
        content: input.content,
        dataJson: (input.dataJson ?? undefined) as any,
        authorAgentId: input.authorAgentId ?? null,
        authorName: input.authorName,
      },
      update: {
        title: input.title ?? undefined,
        content: input.content,
        dataJson: (input.dataJson ?? undefined) as any,
        authorAgentId: input.authorAgentId ?? null,
        authorName: input.authorName,
      },
    });
    return toBlackboardEntry(record);
  }

  async listBlackboardEntries(
    conversationId: string,
    swarmRunId?: string,
  ): Promise<AssistantSwarmBlackboardEntryRecord[]> {
    const records = await this.prisma.assistantSwarmBlackboardEntry.findMany({
      where: {
        conversationId,
        ...(swarmRunId ? { swarmRunId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return records.map(toBlackboardEntry);
  }

  async deleteBlackboardEntry(conversationId: string, entryId: string): Promise<void> {
    const result = await this.prisma.assistantSwarmBlackboardEntry.deleteMany({
      where: { id: entryId, conversationId },
    });
    if (result.count === 0) {
      throw new Error('Blackboard entry not found');
    }
  }
}
