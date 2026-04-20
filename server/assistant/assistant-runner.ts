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
  createAssistantToolDefinitions,
} from '../mcp/tool-definitions';
import { summarizeToolEffect, toolRequiresConfirmation } from '../mcp/tool-confirmation';
import { resolveChatProvider } from './chat-provider-factory';
import type {
  ChatMessage,
  ChatProvider,
  ChatResponse,
  ChatStopReason,
  ToolCall,
} from './providers/types';
import { ASSISTANT_SYSTEM_PROMPT, wrapToolResult } from './system-prompt';
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
  MAX_ITERATIONS: 8,
  MAX_TOOL_CALLS: 16,
  MAX_PARALLEL_TOOLS: 4,
  MAX_TURN_GAP_MS: 60_000,
  PROVIDER_TIMEOUT_MS: 30_000,
  TOOL_TIMEOUT_MS: 15_000,
  RECENT_CALL_WINDOW: 6,
  PER_USER_CONCURRENT: 2,
  PROVIDER_RETRY_COUNT: 1,
  PROVIDER_RETRY_BACKOFF_MS: 500,
  CONFIRMATION_TTL_MS: 10 * 60 * 1000,
  MAX_HISTORY_MESSAGES: 80,
};

export type AssistantStatusEvent =
  | { type: 'provider_call_started'; iteration: number }
  | { type: 'provider_thinking'; iteration: number; title: string; content?: string }
  | { type: 'provider_call_finished'; iteration: number; stopReason: ChatStopReason }
  | { type: 'tool_call_started'; call: ToolCall }
  | { type: 'tool_call_finished'; call: ToolCall; isError: boolean }
  | { type: 'confirmation_required'; call: ToolCall; confirmationId: string }
  | { type: 'circuit_open'; reason: string };

export type TurnResult =
  | { kind: 'final'; finalMessage: AssistantMessageRecord }
  | {
      kind: 'awaiting_confirmation';
      assistantMessage: AssistantMessageRecord;
      confirmation: AssistantPendingConfirmationRecord;
    }
  | { kind: 'error'; error: string; partialMessage?: AssistantMessageRecord };

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

export class AssistantRunner {
  private tools: AssistantToolDefinition[];
  private toolsByName: Map<string, AssistantToolDefinition>;
  private sessionApprovedToolsByConversation = new Map<string, Set<string>>();

  constructor(
    private repo: AssistantRepository,
    private providerRepo: ProviderRepository,
    toolDeps: ToolDependencies,
  ) {
    this.tools = createAssistantToolDefinitions(toolDeps);
    this.toolsByName = new Map(this.tools.map((t) => [t.name, t]));
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
    let lastFinalMessage: AssistantMessageRecord | undefined;

    for (let iter = 0; iter < ASSISTANT_LIMITS.MAX_ITERATIONS; iter++) {
      if (abortSignal?.aborted) {
        return { kind: 'error', error: 'Turn aborted by client', partialMessage: lastFinalMessage };
      }

      if (Date.now() - lastTurnEnd > ASSISTANT_LIMITS.MAX_TURN_GAP_MS) {
        emit(onStatusEvent, { type: 'circuit_open', reason: 'turn_gap_exceeded' });
        const partial = await this.recordCircuitStop(conversationId, 'Turn paused — exceeded time budget between model turns.');
        return { kind: 'error', error: 'Turn gap exceeded', partialMessage: partial };
      }

      // Rebuild chat history from DB on every iteration — keeps the truncation
      // policy simple and ensures confirmation/resume paths see fresh state.
      const messages = await this.buildChatHistory(conversationId);

      emit(onStatusEvent, { type: 'provider_call_started', iteration: iter });
      let response: ChatResponse;
      try {
        response = await this.callProviderWithRetry(provider, {
          modelId: realModelId,
          messages,
          tools: this.tools,
          abortSignal,
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
        console.error(`[Assistant] Provider error: conversation=${conversationId} iter=${iter} error=${e?.message}`);
        const partial = await this.recordProviderError(conversationId, e?.message ?? 'Provider call failed');
        return { kind: 'error', error: e?.message ?? 'Provider call failed', partialMessage: partial };
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
      lastFinalMessage = assistantMessage;

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
      for (const call of response.toolCalls) {
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
            await this.repo.appendMessage({
              conversationId,
              role: 'tool',
              toolCallId: call.id,
              toolName: call.name,
              toolArgsJson: call.arguments,
              content: wrapToolResult(call.name, JSON.stringify({ error: errMsg }), { error: true }),
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

  private async buildChatHistory(conversationId: string): Promise<ChatMessage[]> {
    const records = await this.repo.listMessages(conversationId);
    const body: ChatMessage[] = [];
    for (const m of records) {
      if (m.status === 'awaiting_confirmation') continue; // skip halted-turn stubs
      if (m.role === 'user') body.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
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
        });
      }
    }

    const truncated = truncateHistory(body, ASSISTANT_LIMITS.MAX_HISTORY_MESSAGES);
    const systemPrompt = ASSISTANT_SYSTEM_PROMPT.replace('{{CURRENT_DATETIME}}', new Date().toLocaleString());
    return [{ role: 'system', content: systemPrompt }, ...truncated];
  }

  private async callProviderWithRetry(
    provider: ChatProvider,
    req: Parameters<ChatProvider['chat']>[0],
  ): Promise<ChatResponse> {
    let lastError: any;
    for (let attempt = 0; attempt <= ASSISTANT_LIMITS.PROVIDER_RETRY_COUNT; attempt++) {
      try {
        return await withTimeout(
          provider.chat(req),
          ASSISTANT_LIMITS.PROVIDER_TIMEOUT_MS,
          'Provider call timed out',
        );
      } catch (e: any) {
        lastError = e;
        if (!isRetryableProviderError(e) || attempt === ASSISTANT_LIMITS.PROVIDER_RETRY_COUNT) throw e;
        await sleep(ASSISTANT_LIMITS.PROVIDER_RETRY_BACKOFF_MS * (attempt + 1));
      }
    }
    throw lastError;
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

    const idsToResolve: { id: string; type: 'project' | 'library' }[] = [];
    if (typeof obj.library_id === 'string') idsToResolve.push({ id: obj.library_id, type: 'library' });
    if (typeof obj.libraryId === 'string') idsToResolve.push({ id: obj.libraryId, type: 'library' });
    if (typeof obj.projectId === 'string') idsToResolve.push({ id: obj.projectId, type: 'project' });

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
    /\bbatch_create_prompts\b/,
    /\bcreate_project_with_workflow\b/,
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
