import crypto from 'crypto';
import { z } from 'zod';
import {
  AssistantRepository,
  AssistantMessageRecord,
  AssistantPendingConfirmationRecord,
  AssistantToolCall,
} from '../db/assistant-repository';
import type { ProviderRepository } from '../db/provider-repository';
import {
  AssistantToolDefinition,
  ToolDependencies,
  ToolResult,
  createAssistantToolDefinitions,
} from '../mcp/tool-definitions';
import { summarizeToolEffect, toolRequiresConfirmation } from '../mcp/tool-confirmation';
import {
  buildMcpAppResultMeta,
  getMcpAppResourceUri,
  readMcpAppResource,
  type McpAppResourceContents,
} from '../mcp/apps/mcp-apps';
import type { S3Storage } from '../storage/s3-storage';
import { resolveChatProvider } from './chat-provider-factory';
import type {
  ChatMessage,
  ChatProvider,
  ChatResponse,
  ChatStopReason,
  ToolCall,
} from './providers/types';
import { toolParametersJsonSchema } from './providers/types';
import { ASSISTANT_SYSTEM_PROMPT, wrapToolResult } from './system-prompt';
import { estimateMessages, estimateToolDefinitions, sumCategories, type ContextCategories, type ToolDefinitionEstimate } from './context-estimate';
import { extractAssistantResourceTarget } from './resource-target';
import { PROVIDER_MODELS_MAP } from '../../src/types';

/**
 * Assistant runner — the only place that loops between model and tools.
 *
 * Responsibilities per plan sections 9, 10, 11, 14, 15:
 *  - load conversation history and normalize it for the provider
 *  - call the selected provider adapter
 *  - enforce circuit rules (iteration, call count, repetition, timeouts)
 *  - validate + invoke tool handlers, persisting each step
 *  - pause on tools that require user confirmation
 *  - truncate history head+tail when it grows past a bounded window
 */

export const ASSISTANT_LIMITS = {
  MAX_ITERATIONS: 1000,
  MAX_TOOL_CALLS: 1000,
  MAX_PARALLEL_TOOLS: 12,
  // 8192 is the ceiling, not a preference: our Anthropic calls are
  // non-streaming, and the SDK refuses a non-streaming request above 8192
  // output tokens on Opus 4/4.1. Raising this requires streaming first.
  MAX_OUTPUT_TOKENS: 8192,
  MAX_TRUNCATION_RETRIES: 2,
  MAX_TURN_GAP_MS: 60_000,
  PROVIDER_TIMEOUT_MS: 120_000,
  TOOL_TIMEOUT_MS: 15_000,
  RECENT_CALL_WINDOW: 6,
  PER_USER_CONCURRENT: 2,
  PROVIDER_RETRY_COUNT: 1,
  PROVIDER_RETRY_BACKOFF_MS: 500,
  CONFIRMATION_TTL_MS: 10 * 60 * 1000,
  MAX_HISTORY_MESSAGES: 80,
};

const TRUNCATION_RETRY_HINT =
  'Your previous response was cut off at the output token limit before you finished. '
  + 'Continue from where you stopped, and split the remaining work across several smaller '
  + 'tool calls across turns rather than emitting it all at once. Do not repeat work you already completed.';

const TRUNCATED_ARGS_HINT =
  'The arguments for this call were cut off at the output token limit, so the call was not executed. '
  + 'Retry with roughly half as many items, then continue with further calls until every item is created.';

export interface AssistantToolMetadata {
  name: string;
  title: string;
  description: string;
  category: AssistantToolDefinition['category'];
  /** `ui://` MCP App view the chat renders this tool's result with. */
  appResourceUri?: string;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
}

export type AssistantStatusEvent =
  | { type: 'provider_call_started'; iteration: number }
  | { type: 'provider_thinking'; iteration: number; title: string; content?: string }
  | { type: 'provider_call_finished'; iteration: number; stopReason: ChatStopReason }
  | { type: 'tool_call_started'; call: ToolCall }
  | { type: 'tool_call_finished'; call: ToolCall; isError: boolean }
  | { type: 'confirmation_required'; call: ToolCall; confirmationId: string }
  | { type: 'circuit_open'; reason: string }
  | { type: 'stop_requested' };

export type TurnResult =
  | { kind: 'final'; finalMessage: AssistantMessageRecord }
  | {
      kind: 'awaiting_confirmation';
      assistantMessage: AssistantMessageRecord;
      confirmation: AssistantPendingConfirmationRecord;
    }
  | { kind: 'error'; error: string; partialMessage?: AssistantMessageRecord }
  /** The user pressed Stop; `stoppedMessage` is the transcript's note saying so. */
  | { kind: 'stopped'; stoppedMessage: AssistantMessageRecord };

export interface SendUserMessageInput {
  userId: string;
  conversationId: string;
  content: string;
  abortSignal?: AbortSignal;
  onStatusEvent?: (event: AssistantStatusEvent) => void;
}

export interface ResumeInput {
  userId: string;
  conversationId: string;
  confirmationId: string;
  decision: 'confirm' | 'confirm_tool' | 'confirm_session' | 'cancel';
  abortSignal?: AbortSignal;
  onStatusEvent?: (event: AssistantStatusEvent) => void;
}

/** Simple in-memory per-user turn counter. Multi-process deployments would
 *  need a distributed lock; v1 runs in a single process. */
const activeTurnsByUser = new Map<string, number>();

/**
 * The payload a tool actually produced. Most tools skip `structuredContent`
 * and put their JSON in `text`, so both have to be read to see a result.
 */
/** An MCP `CallToolResult`, as a view expects to receive it. */
export interface AppToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

function asStructured(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseStructured(text: string): Record<string, unknown> | undefined {
  try {
    return asStructured(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** The tool output inside a stored `<tool_result>` wrapper. */
function unwrapStoredToolResult(content: string | null | undefined): string {
  if (!content) return '';
  const match = content.match(/<tool_result\b[^>]*>([\s\S]*?)<\/tool_result>/i);
  return (match?.[1] ?? content).trim();
}

function toolResultPayload(result: ToolResult): unknown {
  if (result.structuredContent != null) return result.structuredContent;
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
}

/** Where a conversation's next model call spends its context. */
export interface AssistantContextEstimate {
  categories: ContextCategories;
  total: number;
  /** Input tokens the model reported for the latest reply, which the estimates are scaled to. */
  reportedInputTokens: number | null;
  calibrated: boolean;
  tools: ToolDefinitionEstimate[];
  imageCount: number;
  messageCount: number;
  /** Older messages left out of the request to fit the history limit. */
  omittedMessageCount: number;
}

export class AssistantRunner {
  private tools: AssistantToolDefinition[];
  private toolsByName: Map<string, AssistantToolDefinition>;
  private sessionApprovedToolsByConversation = new Map<string, Set<string>>();
  private storage: S3Storage;

  constructor(
    private repo: AssistantRepository,
    private providerRepo: ProviderRepository,
    toolDeps: ToolDependencies,
  ) {
    this.storage = toolDeps.storage;
    this.tools = createAssistantToolDefinitions(toolDeps).filter((tool) => !tool.mcpOnly);
    this.toolsByName = new Map(this.tools.map((t) => [t.name, t]));
  }

  listToolMetadata(): AssistantToolMetadata[] {
    return this.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      category: tool.category,
      requiresConfirmation: toolRequiresConfirmation(tool),
      inputSchema: toolParametersJsonSchema(tool),
      ...(getMcpAppResourceUri(tool.name) ? { appResourceUri: getMcpAppResourceUri(tool.name) } : {}),
    }));
  }

  /** The HTML of an MCP App view, for the chat to render in a sandboxed frame. */
  readAppResource(uri: string): Promise<McpAppResourceContents | null> {
    return readMcpAppResource(uri, this.storage);
  }

  private async toAppToolResult(
    toolName: string,
    text: string,
    structured: Record<string, unknown> | undefined,
    isError: boolean,
  ): Promise<AppToolResult> {
    const meta = isError ? undefined : await buildMcpAppResultMeta(toolName, structured, this.storage);
    return {
      content: [{ type: 'text', text }],
      ...(structured ? { structuredContent: structured } : {}),
      ...(meta ? { _meta: meta } : {}),
      ...(isError ? { isError: true } : {}),
    };
  }

  /**
   * A stored tool result in the shape an MCP App view reads, with its media
   * signed again: the links the turn produced have expired by the time an old
   * conversation is reopened.
   */
  async getAppToolResult(
    userId: string,
    conversationId: string,
    toolCallId: string,
  ): Promise<{ toolName: string; arguments: unknown; result: AppToolResult } | null> {
    const conversation = await this.repo.getConversation(userId, conversationId);
    if (!conversation) return null;
    const messages = await this.repo.listMessages(conversationId);
    const message = messages.find((entry) => entry.role === 'tool' && entry.toolCallId === toolCallId);
    if (!message?.toolName || !getMcpAppResourceUri(message.toolName)) return null;
    const text = unwrapStoredToolResult(message.content);
    const structured = asStructured(message.toolResultJson) ?? parseStructured(text);
    return {
      toolName: message.toolName,
      arguments: message.toolArgsJson ?? {},
      result: await this.toAppToolResult(message.toolName, text, structured, message.status === 'error'),
    };
  }

  /**
   * Runs a tool a view asked for (paging, refreshing). Only read tools: a view
   * is not the model and has no confirmation step, so anything that changes
   * data stays with the conversation.
   */
  async callToolForApp(userId: string, toolName: string, args: unknown): Promise<AppToolResult> {
    const tool = this.toolsByName.get(toolName);
    if (!tool || tool.category !== 'read') {
      return this.toAppToolResult(toolName, JSON.stringify({ error: `Tool '${toolName}' is not available to views` }), undefined, true);
    }
    const parsed = safeParseToolInput(tool, args);
    if (!parsed.ok) {
      const error = (parsed as { ok: false; error: string }).error;
      return this.toAppToolResult(toolName, JSON.stringify({ error }), undefined, true);
    }
    const result = await withTimeout(
      tool.handler(userId, parsed.value),
      ASSISTANT_LIMITS.TOOL_TIMEOUT_MS,
      `Tool '${toolName}' timed out`,
    );
    const structured = asStructured(result.structuredContent) ?? parseStructured(result.text);
    return this.toAppToolResult(toolName, result.text, structured, result.isError === true);
  }

  async sendUserMessage(input: SendUserMessageInput): Promise<TurnResult> {
    return this.withUserSlot(input.userId, async () => {
      console.log(`[Assistant] Turn started: user=${input.userId} conversation=${input.conversationId}`);
      const conversation = await this.repo.getConversation(input.userId, input.conversationId);
      if (!conversation) return errorResult('Conversation not found');
      if (!conversation.providerId || !conversation.modelConfigId) {
        const partial = await this.recordConfigurationError(
          input.conversationId,
          'Conversation is missing a provider or model selection',
        );
        return { kind: 'error', error: 'Conversation is missing a provider or model selection', partialMessage: partial };
      }

      this.hydrateApprovedToolsCache(conversation.id, conversation.approvedTools);

      await this.repo.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: input.content,
      });
      await this.repo.touchConversation(conversation.id);

      return this.runLoop({
        userId: input.userId,
        conversationId: conversation.id,
        providerId: conversation.providerId,
        modelId: conversation.modelConfigId,
        abortSignal: input.abortSignal,
        onStatusEvent: input.onStatusEvent,
      });
    });
  }

  async resumeAfterConfirmation(input: ResumeInput): Promise<TurnResult> {
    return this.withUserSlot(input.userId, async () => {
      const conversation = await this.repo.getConversation(input.userId, input.conversationId);
      if (!conversation) return errorResult('Conversation not found');
      if (!conversation.providerId || !conversation.modelConfigId) {
        const partial = await this.recordConfigurationError(
          input.conversationId,
          'Conversation is missing a provider or model selection',
        );
        return { kind: 'error', error: 'Conversation is missing a provider or model selection', partialMessage: partial };
      }

      this.hydrateApprovedToolsCache(conversation.id, conversation.approvedTools);

      const confirmation = await this.repo.getPendingConfirmation(input.confirmationId);
      if (!confirmation || confirmation.conversationId !== conversation.id) {
        return errorResult('Confirmation not found');
      }
      if (confirmation.status !== 'pending') {
        return errorResult(`Confirmation already ${confirmation.status}`);
      }
      if (confirmation.expiresAt < Date.now()) {
        await this.repo.updatePendingConfirmationStatus(confirmation.id, 'expired');
        await this.repo.updateMessageStatus(confirmation.messageId, 'completed');
        await this.repo.appendMessage({
          conversationId: conversation.id,
          role: 'tool',
          toolCallId: confirmation.toolCallId,
          toolName: confirmation.toolName,
          toolArgsJson: confirmation.toolArgsJson,
          content: wrapToolResult(confirmation.toolName, JSON.stringify({
            expired: true,
            message: 'Confirmation expired before user responded.',
          })),
          status: 'error',
        });
        return errorResult('Confirmation expired');
      }

      if (input.decision === 'cancel') {
        await this.repo.updatePendingConfirmationStatus(confirmation.id, 'cancelled');
        await this.repo.updateMessageStatus(confirmation.messageId, 'completed');
        await this.repo.appendMessage({
          conversationId: conversation.id,
          role: 'tool',
          toolCallId: confirmation.toolCallId,
          toolName: confirmation.toolName,
          toolArgsJson: confirmation.toolArgsJson,
          content: wrapToolResult(confirmation.toolName, JSON.stringify({
            cancelled: true,
            message: 'User cancelled this action.',
          })),
          status: 'cancelled',
        });
        await this.repo.touchConversation(conversation.id);

        return this.runLoop({
          userId: input.userId,
          conversationId: conversation.id,
          providerId: conversation.providerId,
          modelId: conversation.modelConfigId,
          abortSignal: input.abortSignal,
          onStatusEvent: input.onStatusEvent,
        });
      }

      const tool = this.toolsByName.get(confirmation.toolName);
      if ((input.decision === 'confirm_tool' || input.decision === 'confirm_session') && tool?.category === 'mutate') {
        this.rememberSessionApprovedTool(conversation.id, tool.name);
        await this.repo.addApprovedTool(conversation.id, tool.name).catch((err) => {
          console.error('[AssistantRunner] Failed to persist approved tool', err);
        });
      }

      // Confirmed — execute the tool now, then continue the loop.
      await this.repo.updatePendingConfirmationStatus(confirmation.id, 'confirmed');
      await this.repo.updateMessageStatus(confirmation.messageId, 'completed');

      if (!tool) {
        await this.repo.appendMessage({
          conversationId: conversation.id,
          role: 'tool',
          toolCallId: confirmation.toolCallId,
          toolName: confirmation.toolName,
          toolArgsJson: confirmation.toolArgsJson,
          content: wrapToolResult(confirmation.toolName, JSON.stringify({
            error: true,
            message: `Tool '${confirmation.toolName}' no longer exists`,
          })),
          status: 'error',
        });
        return errorResult(`Tool '${confirmation.toolName}' no longer exists`);
      }

      const executed = await this.executeToolCall(
        input.userId,
        conversation.id,
        tool,
        { id: confirmation.toolCallId, name: confirmation.toolName, arguments: confirmation.toolArgsJson },
        input.onStatusEvent,
      );
      if (!executed) return errorResult('Tool execution failed');

      await this.repo.touchConversation(conversation.id);

      return this.runLoop({
        userId: input.userId,
        conversationId: conversation.id,
        providerId: conversation.providerId,
        modelId: conversation.modelConfigId,
        abortSignal: input.abortSignal,
        onStatusEvent: input.onStatusEvent,
      });
    });
  }

  async summarizeConversation(userId: string, conversationId: string): Promise<string | null> {
    const conversation = await this.repo.getConversation(userId, conversationId);
    if (!conversation) return null;

    // Use the same provider as the conversation
    const providerId = conversation.providerId;
    if (!providerId) return null;

    let provider: ChatProvider;
    let providerType: string;
    try {
      const handle = await resolveChatProvider(this.providerRepo, userId, providerId);
      provider = handle.provider;
      providerType = handle.type;
    } catch (e) {
      console.error('[AssistantRunner] Failed to resolve provider for summarization', e);
      return null;
    }

    // Determine the lightweight model ID based on the provider type
    let modelId: string;
    switch (providerType) {
      case 'GoogleAI':
        modelId = 'gemini-3.1-flash-lite';
        break;
      case 'Claude':
        modelId = 'claude-haiku-5-5';
        break;
      case 'OpenAI':
        modelId = 'gpt-5.4-nano';
        break;
      default:
        return null;
    }

    const messages = await this.repo.listMessages(conversationId);
    if (messages.length === 0) return null;

    // Format a brief history for summarization
    const historyText = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, 10) // Only need the first few exchanges for a title
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `Summarize the following chat conversation into a concise, professional title (maximum 6 words). Do not use any quotes, prefixes (like "Title:"), or markdown. Return ONLY the title text.\n\nCONVERSATION:\n${historyText}\n\nTITLE:`;

    try {
      const response = await this.callProviderWithRetry(provider, {
        modelId,
        messages: [{ role: 'user', content: prompt }],
        tools: [],
      });

      if (response.text) {
        let title = response.text.trim();
        // Remove any <think> blocks that might be returned by reasoning models
        title = title.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        title = title.replace(/<think>[\s\S]*/gi, '').trim(); // in case of truncated tag
        
        // Clean up common LLM artifacts
        title = title.replace(/^["']|["']$/g, '').trim();
        title = title.replace(/^Title:\s*/i, '').trim();
        
        if (title.length > 100) title = title.slice(0, 97) + '...';

        if (title) {
          await this.repo.updateConversation(userId, conversationId, { title });
          return title;
        }
      }
    } catch (e) {
      console.error('[AssistantRunner] Summarization failed', e);
    }

    return null;
  }

  // ─── internals ───


  private async runLoop(input: {
    userId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
    abortSignal?: AbortSignal;
    onStatusEvent?: (event: AssistantStatusEvent) => void;
  }): Promise<TurnResult> {
    const { userId, conversationId, providerId: providerIdOriginal, modelId: modelConfigId, abortSignal, onStatusEvent } = input;

    let providerHandle: { provider: ChatProvider; type: string };
    try {
      providerHandle = await resolveChatProvider(this.providerRepo, userId, providerIdOriginal);
    } catch (e: any) {
      const rawError = `Could not load chat provider: ${e?.message ?? 'unknown error'}`;
      const partial = await this.recordConfigurationError(conversationId, rawError);
      return { kind: 'error', error: rawError, partialMessage: partial };
    }
    const { provider, type: providerType } = providerHandle;

    const availableModels = PROVIDER_MODELS_MAP[providerType as keyof typeof PROVIDER_MODELS_MAP] || [];
    const modelConfig = availableModels.find(m => m.id === modelConfigId);
    if (!modelConfig) {
      const rawError = `Model config '${modelConfigId}' is not available for provider '${providerType}'`;
      const partial = await this.recordConfigurationError(conversationId, rawError);
      return { kind: 'error', error: rawError, partialMessage: partial };
    }
    const realModelId = modelConfig.modelId;

    let toolCallBudget = ASSISTANT_LIMITS.MAX_TOOL_CALLS;
    const recentCallHashes: string[] = [];
    let lastTurnEnd = Date.now();
    // Truncation recovery: `retryHint` is injected into the next provider call
    // only (never persisted), so the model learns its last response was cut off
    // without the nudge showing up in the user's transcript.
    let truncationRetries = 0;
    let retryHint: string | undefined;

    for (let iter = 0; iter < ASSISTANT_LIMITS.MAX_ITERATIONS; iter++) {
      if (abortSignal?.aborted) return this.stopTurn(conversationId);

      if (Date.now() - lastTurnEnd > ASSISTANT_LIMITS.MAX_TURN_GAP_MS) {
        emit(onStatusEvent, { type: 'circuit_open', reason: 'turn_gap_exceeded' });
        const partial = await this.recordCircuitStop(conversationId, 'Turn paused — exceeded time budget between model turns.');
        return { kind: 'error', error: 'Turn gap exceeded', partialMessage: partial };
      }

      // Rebuild chat history from DB on every iteration — keeps the truncation
      // policy simple and ensures confirmation/resume paths see fresh state.
      const messages = await this.buildChatHistory(conversationId);
      if (retryHint) {
        messages.push({ role: 'user', content: retryHint });
        retryHint = undefined;
      }

      emit(onStatusEvent, { type: 'provider_call_started', iteration: iter });
      let response: ChatResponse;
      try {
        response = await this.callProviderWithRetry(provider, {
          modelId: realModelId,
          messages,
          tools: this.tools,
          maxTokens: ASSISTANT_LIMITS.MAX_OUTPUT_TOKENS,
          abortSignal,
          cacheKey: conversationId,
          onThought: (update) => {
            emit(onStatusEvent, {
              type: 'provider_thinking',
              iteration: iter,
              title: update.title,
              content: update.content,
            });
          },
        });
      } catch (e: any) {
        // Stopping abandons the model call; that is not a provider failure.
        if (abortSignal?.aborted) return this.stopTurn(conversationId);
        console.error(`[Assistant] Provider error: conversation=${conversationId} iter=${iter} error=${e?.message}`);
        const partial = await this.recordProviderError(conversationId, e?.message ?? 'Provider call failed');
        return { kind: 'error', error: e?.message ?? 'Provider call failed', partialMessage: partial };
      }
      if (response.usage) {
        const { inputTokens, outputTokens, cachedInputTokens, cacheCreationInputTokens } = response.usage;
        const cacheParts: string[] = [];
        if (typeof cachedInputTokens === 'number') cacheParts.push(`cached=${cachedInputTokens}`);
        if (typeof cacheCreationInputTokens === 'number') cacheParts.push(`cacheWrite=${cacheCreationInputTokens}`);
        console.log(
          `[Assistant] Usage: conversation=${conversationId} iter=${iter} provider=${providerType} in=${inputTokens ?? 0}`
          + (cacheParts.length > 0 ? ` (${cacheParts.join(', ')})` : '')
          + ` out=${outputTokens ?? 0}`,
        );
      }
      emit(onStatusEvent, { type: 'provider_call_finished', iteration: iter, stopReason: response.stopReason });

      // Persist the assistant message — we may later rewrite its `toolCalls`
      // to reflect the halt point, so keep the id.
      let assistantMessage = await this.repo.appendMessage({
        conversationId,
        role: 'assistant',
        content: response.text,
        toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        status: 'completed',
        stopReason: response.stopReason,
        inputTokens: response.usage?.inputTokens,
        outputTokens: response.usage?.outputTokens,
      });

      // Stop arrived while the model was answering. A plain answer is complete
      // and is kept as the turn's result; proposed tool calls are not run.
      if (abortSignal?.aborted && response.toolCalls.length > 0) {
        await this.recordStoppedToolCalls(conversationId, response.toolCalls);
        return this.stopTurn(conversationId);
      }

      // A `max_tokens` stop means the provider cut generation off mid-response —
      // it is never a completed answer. When a tool call survived the cut its
      // arguments are usually half-written, and the schema check below reports
      // the truncation; with no tool call at all we would otherwise return
      // truncated text as a successful final message.
      if (response.stopReason === 'max_tokens') {
        if (response.toolCalls.length === 0) {
          if (++truncationRetries > ASSISTANT_LIMITS.MAX_TRUNCATION_RETRIES) {
            emit(onStatusEvent, { type: 'circuit_open', reason: 'output_truncated' });
            const partial = await this.recordCircuitStop(
              conversationId,
              'the model kept running past its output limit. Ask for this in smaller pieces.',
            );
            return { kind: 'error', error: 'Output truncated repeatedly', partialMessage: partial };
          }
          retryHint = TRUNCATION_RETRY_HINT;
          lastTurnEnd = Date.now();
          continue;
        }
      } else {
        truncationRetries = 0;
      }

      if (response.toolCalls.length === 0) {
        await this.repo.touchConversation(conversationId);
        return { kind: 'final', finalMessage: assistantMessage };
      }

      if (response.toolCalls.length > ASSISTANT_LIMITS.MAX_PARALLEL_TOOLS) {
        emit(onStatusEvent, { type: 'circuit_open', reason: 'parallel_tools_exceeded' });
        const partial = await this.recordCircuitStop(conversationId, 'Too many tool calls in a single turn — stopped for safety.');
        return { kind: 'error', error: 'Parallel tool cap exceeded', partialMessage: partial };
      }

      // Execute each proposed tool call in order; halt on the first one that
      // requires confirmation.
      const processedCalls: ToolCall[] = [];
      for (const [callIndex, call] of response.toolCalls.entries()) {
        // A tool already running is let finish so its result is on record;
        // the ones after it never start.
        if (abortSignal?.aborted) {
          await this.recordStoppedToolCalls(conversationId, response.toolCalls.slice(callIndex));
          return this.stopTurn(conversationId);
        }

        if (--toolCallBudget < 0) {
          emit(onStatusEvent, { type: 'circuit_open', reason: 'tool_call_budget_exceeded' });
          const partial = await this.recordCircuitStop(conversationId, 'Hit the tool-call budget for this turn — stopped for safety.');
          return { kind: 'error', error: 'Tool-call budget exceeded', partialMessage: partial };
        }

        const hash = hashToolCall(call.name, call.arguments);
        recentCallHashes.push(hash);
        if (recentCallHashes.length > ASSISTANT_LIMITS.RECENT_CALL_WINDOW) recentCallHashes.shift();
        if (isRepetitionDetected(recentCallHashes, hash)) {
          emit(onStatusEvent, { type: 'circuit_open', reason: 'repetition_detected' });
          const partial = await this.recordCircuitStop(conversationId, 'Detected repeated tool call — stopped for safety.');
          return { kind: 'error', error: 'Repeated tool call detected', partialMessage: partial };
        }

          const tool = this.toolsByName.get(call.name);
          if (!tool) {
            await this.repo.appendMessage({
              conversationId,
              role: 'tool',
              toolCallId: call.id,
              toolName: call.name,
              toolArgsJson: call.arguments,
              content: wrapToolResult(call.name, JSON.stringify({ error: `Unknown tool '${call.name}'` }), { error: true }),
              status: 'error',
            });
            processedCalls.push(call);
            continue;
          }

          const parsed = safeParseToolInput(tool, call.arguments);
          if (!parsed.ok) {
            const errMsg = (parsed as { ok: false; error: string }).error;
            // Truncated arguments fail the schema check for a reason the model
            // can act on — say so, otherwise it retries at the same size.
            const truncatedArgs = response.stopReason === 'max_tokens';
            await this.repo.appendMessage({
              conversationId,
              role: 'tool',
              toolCallId: call.id,
              toolName: call.name,
              toolArgsJson: call.arguments,
              content: wrapToolResult(call.name, JSON.stringify({
                error: errMsg,
                ...(truncatedArgs ? { truncated: true, hint: TRUNCATED_ARGS_HINT } : {}),
              }), { error: true }),
              status: 'error',
            });
            processedCalls.push(call);
            continue;
          }

          if (toolRequiresConfirmation(tool)) {
            if (this.shouldAutoApproveWriteActions(conversationId, tool)) {
              emit(onStatusEvent, { type: 'tool_call_started', call });
              const startMs = Date.now();
              const isError = await this.executeToolCallInner(userId, conversationId, tool, { ...call, arguments: parsed.value });
              console.log(`[Assistant] Tool auto-approved for session: ${call.name} in ${Date.now() - startMs}ms conversation=${conversationId}`);
              emit(onStatusEvent, { type: 'tool_call_finished', call, isError });
              processedCalls.push(call);
              continue;
            }

            const latestUserMessage = findLatestUserMessageContent(messages);
            const labels = await this.resolveLabelsForArgs(userId, parsed.value);
            const proposal = buildConfirmationProposalText(
              assistantMessage.content,
              latestUserMessage,
              tool,
              parsed.value,
              labels
            );
            if (proposal !== assistantMessage.content) {
              await this.rewriteAssistantMessage(assistantMessage.id, {
                content: proposal,
              });
              assistantMessage = { ...assistantMessage, content: proposal };
            }

            // Rewrite the assistant message so its toolCalls array only lists
            // what we've already processed plus this halted call. Calls after
            // this one in the response are dropped — the model will re-plan
            // after the user decides.
            const trimmedToolCalls = [...processedCalls, call];
            await this.rewriteAssistantMessage(assistantMessage.id, { toolCalls: trimmedToolCalls });
            const finalSummary = summarizeToolEffect(tool, parsed.value, labels);
            const confirmation = await this.repo.createPendingConfirmation({
              conversationId,
              messageId: assistantMessage.id,
              toolCallId: call.id,
              toolName: call.name,
              toolArgsJson: parsed.value,
              summary: finalSummary,
              expiresAt: new Date(Date.now() + ASSISTANT_LIMITS.CONFIRMATION_TTL_MS),
            });
          emit(onStatusEvent, { type: 'confirmation_required', call, confirmationId: confirmation.id });
          await this.repo.updateMessageStatus(assistantMessage.id, 'awaiting_confirmation');
          await this.repo.touchConversation(conversationId);
          return {
            kind: 'awaiting_confirmation',
            assistantMessage: { ...assistantMessage, toolCalls: trimmedToolCalls, status: 'awaiting_confirmation' },
            confirmation,
          };
        }

        emit(onStatusEvent, { type: 'tool_call_started', call });
        const startMs = Date.now();
        await this.executeToolCallInner(userId, conversationId, tool, { ...call, arguments: parsed.value });
        console.log(`[Assistant] Tool executed: ${call.name} in ${Date.now() - startMs}ms conversation=${conversationId}`);
        emit(onStatusEvent, { type: 'tool_call_finished', call, isError: false });
        processedCalls.push(call);
      }

      lastTurnEnd = Date.now();
    }

    emit(onStatusEvent, { type: 'circuit_open', reason: 'max_iterations' });
    console.warn(`[Assistant] Circuit open: max_iterations conversation=${input.conversationId}`);
    const partial = await this.recordCircuitStop(input.conversationId, 'Reached the maximum number of model turns — stopped for safety.');
    return { kind: 'error', error: 'Max iterations reached', partialMessage: partial };
  }

  /**
   * Public-ish helper used by `resumeAfterConfirmation` to execute a single
   * confirmed tool and append its result before re-entering the loop.
   */
  private async executeToolCall(
    userId: string,
    conversationId: string,
    tool: AssistantToolDefinition,
    call: ToolCall,
    onStatusEvent?: (event: AssistantStatusEvent) => void,
  ): Promise<boolean> {
    const parsed = safeParseToolInput(tool, call.arguments);
    if (!parsed.ok) {
      const errMsg = (parsed as { ok: false; error: string }).error;
      await this.repo.appendMessage({
        conversationId,
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        toolArgsJson: call.arguments,
        content: wrapToolResult(call.name, JSON.stringify({ error: errMsg }), { error: true }),
        status: 'error',
      });
      return false;
    }
    emit(onStatusEvent, { type: 'tool_call_started', call });
    const isError = await this.executeToolCallInner(userId, conversationId, tool, { ...call, arguments: parsed.value });
    emit(onStatusEvent, { type: 'tool_call_finished', call, isError });
    return !isError;
  }

  /**
   * Record the workspace entity a successful tool call changed, so the
   * assistant sidebar can list it. Read-only tools are skipped: the list is
   * what the conversation changed, not everything it looked at.
   *
   * Best-effort — never fail a turn over bookkeeping.
   */
  private async recordResourceTarget(
    conversationId: string,
    tool: AssistantToolDefinition,
    call: ToolCall,
    result: ToolResult,
  ): Promise<void> {
    if (tool.category === 'read') return;
    try {
      const target = extractAssistantResourceTarget(call.name, call.arguments, toolResultPayload(result));
      if (!target) return;
      await this.repo.recordConversationResource({
        conversationId,
        ...target,
        toolName: tool.name,
        toolTitle: tool.title,
      });
    } catch (e: any) {
      console.warn(`[Assistant] Failed to record resource for ${call.name}: ${e?.message ?? e}`);
    }
  }

  private async executeToolCallInner(
    userId: string,
    conversationId: string,
    tool: AssistantToolDefinition,
    call: ToolCall,
  ): Promise<boolean> {
    try {
      const result = await withTimeout(
        tool.handler(userId, call.arguments),
        ASSISTANT_LIMITS.TOOL_TIMEOUT_MS,
        `Tool '${call.name}' timed out`,
      );
      await this.repo.appendMessage({
        conversationId,
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        toolArgsJson: call.arguments,
        content: wrapToolResult(call.name, result.text, { error: result.isError }),
        toolResultJson: result.structuredContent,
        status: result.isError ? 'error' : 'completed',
      });
      if (!result.isError) {
        await this.recordResourceTarget(conversationId, tool, call, result);
      }
      return result.isError === true;
    } catch (e: any) {
      await this.repo.appendMessage({
        conversationId,
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        toolArgsJson: call.arguments,
        content: wrapToolResult(
          call.name,
          JSON.stringify({ error: e?.message ?? 'Tool execution failed' }),
          { error: true },
        ),
        status: 'error',
        errorText: e?.message ?? 'Tool execution failed',
      });
      return true;
    }
  }

  clearConversationSessionApproval(conversationId: string): void {
    this.sessionApprovedToolsByConversation.delete(conversationId);
  }

  /** Replace the in-memory approval cache for a conversation with the values
   *  loaded from persistent storage. Called on conversation entry. */
  private hydrateApprovedToolsCache(conversationId: string, approvedTools: string[]): void {
    this.sessionApprovedToolsByConversation.set(conversationId, new Set(approvedTools));
  }

  /** Returns the tool names this conversation has pre-approved for auto-execution. */
  async getApprovedTools(userId: string, conversationId: string): Promise<string[]> {
    return this.repo.getApprovedTools(userId, conversationId);
  }

  /** Replace the approved-tools list for a conversation. Only 'mutate' tools
   *  are eligible; other names are filtered out. */
  async setApprovedTools(userId: string, conversationId: string, toolNames: string[]): Promise<string[]> {
    const eligible = Array.from(new Set(toolNames)).filter((name) => {
      const tool = this.toolsByName.get(name);
      return tool?.category === 'mutate';
    });
    const saved = await this.repo.setApprovedTools(userId, conversationId, eligible);
    this.sessionApprovedToolsByConversation.set(conversationId, new Set(saved));
    return saved;
  }

  private async rewriteAssistantToolCalls(messageId: string, toolCalls: ToolCall[]): Promise<void> {
    await this.rewriteAssistantMessage(messageId, { toolCalls });
  }

  private async rewriteAssistantMessage(
    messageId: string,
    updates: {
      content?: string;
      toolCalls?: ToolCall[];
    },
  ): Promise<void> {
    // Prisma's assistant message doesn't expose an update helper in our repo yet;
    // do a direct update via a small method on the repo. Fall back to inline.
    await (this.repo as any)['prisma']?.assistantMessage?.update?.({
      where: { id: messageId },
      data: {
        ...(updates.content !== undefined ? { content: updates.content } : {}),
        ...(updates.toolCalls !== undefined ? { toolCalls: updates.toolCalls as any } : {}),
      },
    }).catch(() => {});
  }

  /**
   * What the next model call of a conversation would spend its context on, by
   * category. The parts are estimates scaled so they agree with the input total
   * the model reported for the latest reply.
   */
  async estimateContext(userId: string, conversationId: string): Promise<AssistantContextEstimate | null> {
    const conversation = await this.repo.getConversation(userId, conversationId);
    if (!conversation) return null;
    const records = await this.repo.listMessages(conversationId);

    const tools = estimateToolDefinitions(this.tools, toolParametersJsonSchema);
    const toolTokens = tools.reduce((sum, tool) => sum + tool.tokens, 0);
    const estimate = (history: ChatMessage[]): ContextCategories => {
      const { imageCount: _imageCount, ...parts } = estimateMessages(history);
      return { ...parts, tools: toolTokens };
    };

    const history = this.historyFromRecords(records);
    const { imageCount, ...nextParts } = estimateMessages(history.messages);
    const raw: ContextCategories = { ...nextParts, tools: toolTokens };

    // The latest reply's reported input covered everything before it; compare
    // that with our estimate of the same request to correct the estimates.
    let reportedInputTokens: number | null = null;
    let scale = 1;
    for (let i = records.length - 1; i >= 0; i--) {
      const record = records[i];
      if (record.role === 'assistant' && typeof record.inputTokens === 'number' && record.inputTokens > 0) {
        reportedInputTokens = record.inputTokens;
        const estimatedThen = sumCategories(estimate(this.historyFromRecords(records.slice(0, i)).messages));
        if (estimatedThen > 0) scale = Math.min(4, Math.max(0.25, record.inputTokens / estimatedThen));
        break;
      }
    }

    const categories = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, Math.round(value * scale)]),
    ) as unknown as ContextCategories;
    return {
      categories,
      total: sumCategories(categories),
      reportedInputTokens,
      calibrated: reportedInputTokens != null,
      tools: tools.map((tool) => ({ name: tool.name, tokens: Math.round(tool.tokens * scale) })),
      imageCount,
      messageCount: history.messages.length - 1,
      omittedMessageCount: history.omitted,
    };
  }

  private async buildChatHistory(conversationId: string): Promise<ChatMessage[]> {
    const records = await this.repo.listMessages(conversationId);
    return this.historyFromRecords(records).messages;
  }

  /** The system prompt and the (truncated) history a model call is sent. */
  private historyFromRecords(records: AssistantMessageRecord[]): { messages: ChatMessage[]; omitted: number } {
    const body: ChatMessage[] = [];
    for (const m of records) {
      if (m.status === 'awaiting_confirmation') continue; // skip halted-turn stubs
      if (m.role === 'user') {
        const { textContent, images } = parseUserMessageImages(m.content);
        const timestamp = formatMessageTimestamp(m.createdAt);
        const contentWithTimestamp = timestamp
          ? (textContent ? `${textContent}\n\n[Sent at: ${timestamp}]` : `[Sent at: ${timestamp}]`)
          : textContent;
        const userMsg: ChatMessage = { role: 'user', content: contentWithTimestamp };
        if (images.length > 0) (userMsg as any).images = images;
        body.push(userMsg);
      } else if (m.role === 'assistant') {
        const entry: ChatMessage = {
          role: 'assistant',
          content: m.content,
          ...(m.toolCalls && m.toolCalls.length > 0 ? { toolCalls: m.toolCalls as AssistantToolCall[] as ToolCall[] } : {}),
        };
        body.push(entry);
      } else if (m.role === 'tool') {
        body.push({
          role: 'tool',
          toolCallId: m.toolCallId ?? '',
          name: m.toolName ?? '',
          content: m.content,
          toolResultJson: m.toolResultJson,
        });
      }
    }

    const truncated = truncateHistory(body, ASSISTANT_LIMITS.MAX_HISTORY_MESSAGES);
    // A truncated history drops messages and adds one placeholder in their place.
    const omitted = truncated === body ? 0 : body.length - (truncated.length - 1);
    // Keep the system prompt 100% static so provider KV / prefix caches stay
    // warm across tool-loop iterations and multi-turn follow-ups.
    return { messages: [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...truncated], omitted };
  }

  private async callProviderWithRetry(
    provider: ChatProvider,
    req: Parameters<ChatProvider['chat']>[0],
  ): Promise<ChatResponse> {
    let lastError: any;
    for (let attempt = 0; attempt <= ASSISTANT_LIMITS.PROVIDER_RETRY_COUNT; attempt++) {
      try {
        // Not every provider SDK honours the abort signal promptly, so stop
        // waiting on our side the moment it fires.
        return await raceAbort(
          withTimeout(
            provider.chat(req),
            ASSISTANT_LIMITS.PROVIDER_TIMEOUT_MS,
            'Provider call timed out',
          ),
          req.abortSignal,
        );
      } catch (e: any) {
        lastError = e;
        if (req.abortSignal?.aborted) throw e;
        if (!isRetryableProviderError(e) || attempt === ASSISTANT_LIMITS.PROVIDER_RETRY_COUNT) throw e;
        await sleep(ASSISTANT_LIMITS.PROVIDER_RETRY_BACKOFF_MS * (attempt + 1));
      }
    }
    throw lastError;
  }

  /** End a turn the user stopped, leaving a note in the transcript. */
  private async stopTurn(conversationId: string): Promise<TurnResult> {
    console.log(`[Assistant] Turn stopped by user: conversation=${conversationId}`);
    const stoppedMessage = await this.repo.appendMessage({
      conversationId,
      role: 'assistant',
      content: 'Stopped at your request.',
      status: 'cancelled',
    });
    await this.repo.touchConversation(conversationId);
    return { kind: 'stopped', stoppedMessage };
  }

  /**
   * Answer tool calls the turn will never run. Every call the model proposed
   * needs a result in the history, or the next request to the provider is
   * rejected for an unanswered tool call.
   */
  private async recordStoppedToolCalls(conversationId: string, calls: ToolCall[]): Promise<void> {
    for (const call of calls) {
      await this.repo.appendMessage({
        conversationId,
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        toolArgsJson: call.arguments,
        content: wrapToolResult(call.name, JSON.stringify({
          cancelled: true,
          message: 'The user stopped the turn before this ran.',
        })),
        status: 'cancelled',
      });
    }
  }

  private async recordCircuitStop(conversationId: string, message: string): Promise<AssistantMessageRecord> {
    return this.repo.appendMessage({
      conversationId,
      role: 'assistant',
      content: `I stopped because ${message}`,
      status: 'error',
      stopReason: 'error',
    });
  }

  private async recordProviderError(conversationId: string, rawError: string): Promise<AssistantMessageRecord> {
    return this.repo.appendMessage({
      conversationId,
      role: 'assistant',
      content: "The model couldn't finish this turn. You can try again.",
      status: 'error',
      stopReason: 'error',
      errorText: rawError.slice(0, 4000),
    });
  }

  private async recordConfigurationError(conversationId: string, rawError: string): Promise<AssistantMessageRecord> {
    return this.repo.appendMessage({
      conversationId,
      role: 'assistant',
      content: "This chat can't continue because its provider or model is unavailable or no longer supported.",
      status: 'error',
      stopReason: 'error',
      errorText: rawError.slice(0, 4000),
    });
  }

  private async withUserSlot<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const active = activeTurnsByUser.get(userId) ?? 0;
    if (active >= ASSISTANT_LIMITS.PER_USER_CONCURRENT) {
      throw new Error('Too many concurrent assistant turns — wait for one to finish.');
    }
    activeTurnsByUser.set(userId, active + 1);
    try {
      return await fn();
    } finally {
      const next = (activeTurnsByUser.get(userId) ?? 1) - 1;
      if (next <= 0) activeTurnsByUser.delete(userId);
      else activeTurnsByUser.set(userId, next);
    }
  }

  private shouldAutoApproveWriteActions(
    conversationId: string,
    tool: Pick<AssistantToolDefinition, 'name' | 'category'>,
  ): boolean {
    if (tool.category !== 'mutate') return false;
    return this.sessionApprovedToolsByConversation.get(conversationId)?.has(tool.name) ?? false;
  }

  private rememberSessionApprovedTool(conversationId: string, toolName: string): void {
    const approvedTools = this.sessionApprovedToolsByConversation.get(conversationId) ?? new Set<string>();
    approvedTools.add(toolName);
    this.sessionApprovedToolsByConversation.set(conversationId, approvedTools);
  }

  private async resolveLabelsForArgs(userId: string, args: unknown): Promise<Record<string, string>> {
    if (args == null || typeof args !== 'object') return {};
    const obj = args as Record<string, unknown>;
    const labels: Record<string, string> = {};

    const idsToResolve: { id: string; type: 'project' | 'library' | 'provider' }[] = [];
    if (typeof obj.library_id === 'string') idsToResolve.push({ id: obj.library_id, type: 'library' });
    if (typeof obj.libraryId === 'string') idsToResolve.push({ id: obj.libraryId, type: 'library' });
    if (typeof obj.projectId === 'string') idsToResolve.push({ id: obj.projectId, type: 'project' });
    if (typeof obj.providerId === 'string') idsToResolve.push({ id: obj.providerId, type: 'provider' });

    // Also look into workflowItems if present
    if (Array.isArray(obj.workflowItems)) {
      for (const item of obj.workflowItems) {
        if (typeof item.libraryId === 'string') idsToResolve.push({ id: item.libraryId, type: 'library' });
      }
    }

    if (idsToResolve.length === 0) return labels;

    await Promise.all(idsToResolve.map(async ({ id, type }) => {
      try {
        if (type === 'library') {
          // Use internal prisma client since we have direct access in the runner deps
          const lib = await (this.repo as any).prisma.library.findFirst({
             where: { id, userId },
             select: { name: true }
          });
          if (lib) labels[id] = lib.name;
        } else if (type === 'provider') {
          const provider = await (this.repo as any).prisma.provider.findFirst({
            where: { id, userId },
            select: { name: true }
          });
          if (provider) labels[id] = provider.name;
        } else {
          const proj = await (this.repo as any).prisma.project.findFirst({
            where: { id, userId },
            select: { name: true }
          });
          if (proj) labels[id] = proj.name;
        }
      } catch {
        // ignore
      }
    }));

    return labels;
  }
}

// ─── helpers ───

/**
 * Parse [IMAGE_ATTACHMENTS]...[/IMAGE_ATTACHMENTS] blocks out of user message content.
 * Returns the clean text content (block removed) and an array of base64 data URIs.
 */
function parseUserMessageImages(content: string): { textContent: string; images: string[] } {
  const blockMatch = content.match(/\[IMAGE_ATTACHMENTS\]([\s\S]*?)\[\/IMAGE_ATTACHMENTS\]\n?/);
  if (!blockMatch) return { textContent: content, images: [] };

  const imageLines = blockMatch[1].trim().split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:image/'));
  const textContent = content.replace(blockMatch[0], '').trim();
  return { textContent, images: imageLines };
}

function emit(
  cb: ((event: AssistantStatusEvent) => void) | undefined,
  event: AssistantStatusEvent,
): void {
  try { cb?.(event); } catch { /* swallow — emission is best-effort */ }
}

function errorResult(error: string): TurnResult {
  return { kind: 'error', error };
}

function hashToolCall(name: string, args: unknown): string {
  const normalized = stableStringify(args);
  return crypto.createHash('sha1').update(`${name}\x00${normalized}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function isRepetitionDetected(window: string[], current: string): boolean {
  // Repetition: the same hash appears 3+ times in the recent window.
  let count = 0;
  for (const h of window) if (h === current) count++;
  return count >= 3;
}

function isRetryableProviderError(error: unknown): boolean {
  const err = error as any;
  if (!err) return false;
  if (err.name === 'AbortError') return false;
  const status = err.status ?? err.statusCode ?? err.code;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  const msg: string = err.message ?? '';
  return /ECONNRESET|ETIMEDOUT|ENETUNREACH|timed out/i.test(msg);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Settle with `promise`, or reject as soon as `signal` aborts — whichever comes first. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const err = new Error('Turn stopped by user');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

function safeParseToolInput(
  tool: AssistantToolDefinition,
  raw: unknown,
): ParseResult {
  try {
    const schema = z.object(tool.inputSchema as any);
    const value = schema.parse(raw ?? {});
    return { ok: true as const, value };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? 'Invalid tool arguments' };
  }
}

function shouldReplaceProposalText(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;

  const internalPlanningSignals = [
    /\bI need to\b/i,
    /\bI now realize\b/i,
    /\bI should\b/i,
    /\bI['’]m currently\b/i,
    /\bI was going to\b/i,
    /\bI['’]ll need to\b/i,
    /\bThe instructions\b/i,
    /\bcreate_library\b/,
    /\bupdate_library\b/,
    /\bbatch_create_prompts\b/,
    /\bcreate_project_with_workflow\b/,
    /\bupdate_prompt\b/,
    /\bdelete_library_items\b/,
    /\bcall [`']?[a-z_]+[`']?/i,
  ];

  return internalPlanningSignals.some((pattern) => pattern.test(trimmed));
}

function findLatestUserMessageContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function buildConfirmationProposalText(
  currentContent: string,
  latestUserMessage: string,
  tool: AssistantToolDefinition,
  args: unknown,
  labels?: Record<string, string>,
): string {
  const richerProposal = synthesizeMultiStepProposal(tool, args, latestUserMessage);
  if (richerProposal && (shouldReplaceProposalText(currentContent) || isProposalTooNarrow(currentContent, latestUserMessage, tool))) {
    return richerProposal;
  }
  if (shouldReplaceProposalText(currentContent)) {
    return `${summarizeToolEffect(tool, args, labels)}\n\nReview the details below and confirm if you want me to apply this change.`;
  }
  return currentContent;
}

function isProposalTooNarrow(
  currentContent: string,
  latestUserMessage: string,
  tool: AssistantToolDefinition,
): boolean {
  if (tool.name !== 'create_library') return false;
  const promptIntent = extractPromptCreationIntent(latestUserMessage);
  if (!promptIntent) return false;

  if (promptIntent.count != null && !new RegExp(`\\b${promptIntent.count}\\b`).test(currentContent)) {
    return true;
  }

  if (/\bprompts?\b/i.test(latestUserMessage) && !/\bprompts?\b/i.test(currentContent)) {
    return true;
  }

  if (promptIntent.topic) {
    const escapedTopic = escapeRegExp(promptIntent.topic);
    if (!new RegExp(escapedTopic, 'i').test(currentContent)) {
      return true;
    }
  }

  return false;
}

function synthesizeMultiStepProposal(
  tool: AssistantToolDefinition,
  args: unknown,
  latestUserMessage: string,
): string | null {
  if (tool.name !== 'create_library') return null;
  const promptIntent = extractPromptCreationIntent(latestUserMessage);
  if (!promptIntent) return null;

  const objectArgs = (args && typeof args === 'object' && !Array.isArray(args))
    ? args as Record<string, unknown>
    : {};
  const libraryName = String(objectArgs.name ?? 'the new library');
  const countText = promptIntent.count != null
    ? `${promptIntent.count} `
    : '';
  const topicText = promptIntent.topic
    ? `${promptIntent.topic} `
    : '';
  const promptNoun = promptIntent.count === 1 ? 'prompt' : 'prompts';

  return `I will create a new text library named "${libraryName}" first. Once it exists, I will add ${countText}${topicText}${promptNoun} to it.\n\nReview the details below and confirm if you want me to start with the library creation step.`;
}

function extractPromptCreationIntent(userMessage: string): { count: number | null; topic: string | null } | null {
  const trimmed = userMessage.trim();
  if (!trimmed || !/\bprompts?\b/i.test(trimmed)) return null;

  const directMatch = trimmed.match(/\b(\d+)\s+(.+?)\s+prompts?\b/i);
  if (directMatch) {
    return {
      count: Number.parseInt(directMatch[1], 10),
      topic: normalizePromptTopic(directMatch[2]),
    };
  }

  const countOnlyMatch = trimmed.match(/\b(\d+)\s+prompts?\b/i);
  if (countOnlyMatch) {
    return {
      count: Number.parseInt(countOnlyMatch[1], 10),
      topic: null,
    };
  }

  return { count: null, topic: null };
}

function normalizePromptTopic(rawTopic: string): string | null {
  const topic = rawTopic
    .replace(/\b(?:that|which|who)\b.*$/i, '')
    .replace(/\b(?:about|of|for)\b\s*$/i, '')
    .replace(/^[\s"'`]+|[\s"'`.,!?]+$/g, '')
    .trim();
  return topic || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Head + tail truncation. Preserves the earliest user message (carries the
 * session goal) and the most recent messages up to the cap, dropping the
 * middle. Inserts a placeholder marker so the model knows context was
 * shortened. System prompt is applied separately and is not counted here.
 */
function truncateHistory(messages: ChatMessage[], max: number): ChatMessage[] {
  if (messages.length <= max) return messages;

  const firstUserIdx = messages.findIndex((m) => m.role === 'user');
  const head: ChatMessage[] = firstUserIdx >= 0 ? [messages[firstUserIdx]] : [];
  let tailStart = Math.max(
    messages.length - (max - head.length - 1),
    firstUserIdx >= 0 ? firstUserIdx + 1 : 0,
  );

  // Avoid splitting tool call sequences: if the tail starts on a tool response,
  // walk backward to include the assistant message that spawned it.
  while (tailStart > 0 && tailStart < messages.length && messages[tailStart].role === 'tool') {
    tailStart--;
  }

  const tail = messages.slice(tailStart);
  const placeholder: ChatMessage = {
    role: 'system',
    content: `[${messages.length - head.length - tail.length} earlier message(s) truncated to stay within the model's context window.]`,
  };
  return [...head, placeholder, ...tail];
}

/**
 * Deterministic local-time stamp for a persisted message's `createdAt`.
 * Because each message's `createdAt` is immutable once stored, stamping user
 * messages here keeps the system prompt 100% static and preserves byte-identical
 * historical prefixes for provider KV / prompt caching.
 */
function formatMessageTimestamp(raw: Date | string | number | null | undefined): string | null {
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetStr = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} UTC${offsetStr}`
  );
}
