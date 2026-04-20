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
}

export interface AssistantConversationRecord {
  id: string;
  userId: string;
  title: string;
  providerId: string | null;
  modelConfigId: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface AssistantMessageRecord {
  id: string;
  conversationId: string;
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

export type AssistantPendingConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

export interface AssistantPendingConfirmationRecord {
  id: string;
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolArgsJson: unknown;
  summary: string | null;
  status: AssistantPendingConfirmationStatus;
  expiresAt: number;
  createdAt: number;
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
    createdAt: toDateMs(record.createdAt),
    updatedAt: toDateMs(record.updatedAt),
    archivedAt: record.archivedAt ? toDateMs(record.archivedAt) : null,
  };
}

function toMessage(record: any): AssistantMessageRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
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

export class AssistantRepository {
  constructor(private prisma: PrismaClient) {}

  // ─── Conversations ───

  async listConversations(userId: string, options: ListConversationsOptions = {}): Promise<AssistantConversationRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const records = await this.prisma.assistantConversation.findMany({
      where: {
        userId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    return records.map(toConversation);
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
    options: { limit?: number } = {},
  ): Promise<AssistantMessageRecord[]> {
    const take = options.limit ? Math.min(Math.max(options.limit, 1), 500) : undefined;
    const records = await this.prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      ...(take ? { take } : {}),
    });
    return records.map(toMessage);
  }

  async appendMessage(input: AppendMessageInput): Promise<AssistantMessageRecord> {
    const record = await this.prisma.assistantMessage.create({
      data: {
        conversationId: input.conversationId,
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
        messageId: input.messageId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolArgsJson: input.toolArgsJson as any,
        summary: input.summary ?? null,
        expiresAt: input.expiresAt,
      },
    });
    return toPendingConfirmation(record);
  }

  async getPendingConfirmation(id: string): Promise<AssistantPendingConfirmationRecord | null> {
    const record = await this.prisma.assistantPendingConfirmation.findUnique({ where: { id } });
    return record ? toPendingConfirmation(record) : null;
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
}
