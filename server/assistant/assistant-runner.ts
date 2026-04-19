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
import { resolveChatProvider } from './chat-provider-factory';
import type {
  ChatMessage,
  ChatProvider,
  ChatResponse,
  ChatStopReason,
  ToolCall,
} from './providers/types';
import { ASSISTANT_SYSTEM_PROMPT, wrapToolResult } from './system-prompt';

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
  decision: 'confirm' | 'cancel';
  abortSignal?: AbortSignal;
  onStatusEvent?: (event: AssistantStatusEvent) => void;
}

/** Simple in-memory per-user turn counter. Multi-process deployments would
 *  need a distributed lock; v1 runs in a single process. */
const activeTurnsByUser = new Map<string, number>();

export class AssistantRunner {
  private tools: AssistantToolDefinition[];
  private toolsByName: Map<string, AssistantToolDefinition>;

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
        return errorResult('Conversation is missing a provider or model selection');
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
        return errorResult('Conversation is missing a provider or model selection');
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
        return errorResult('Confirmation expired');
      }

      if (input.decision === 'cancel') {
        await this.repo.updatePendingConfirmationStatus(confirmation.id, 'cancelled');
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

      // Confirmed — execute the tool now, then continue the loop.
      await this.repo.updatePendingConfirmationStatus(confirmation.id, 'confirmed');

      const tool = this.toolsByName.get(confirmation.toolName);
      if (!tool) {
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
    const { userId, conversationId, providerId, modelId, abortSignal, onStatusEvent } = input;

    let providerHandle: { provider: ChatProvider };
    try {
      providerHandle = await resolveChatProvider(this.providerRepo, userId, providerId);
    } catch (e: any) {
      return errorResult(`Could not load chat provider: ${e?.message ?? 'unknown error'}`);
    }
    const { provider } = providerHandle;

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
          modelId,
          messages,
          tools: this.tools,
          abortSignal,
        });
      } catch (e: any) {
        console.error(`[Assistant] Provider error: conversation=${conversationId} iter=${iter} error=${e?.message}`);
        const partial = await this.recordProviderError(conversationId, e?.message ?? 'Provider call failed');
        return { kind: 'error', error: e?.message ?? 'Provider call failed', partialMessage: partial };
      }
      emit(onStatusEvent, { type: 'provider_call_finished', iteration: iter, stopReason: response.stopReason });

      // Persist the assistant message — we may later rewrite its `toolCalls`
      // to reflect the halt point, so keep the id.
      const assistantMessage = await this.repo.appendMessage({
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

        if (tool.requiresConfirmation) {
          // Rewrite the assistant message so its toolCalls array only lists
          // what we've already processed plus this halted call. Calls after
          // this one in the response are dropped — the model will re-plan
          // after the user decides.
          const trimmedToolCalls = [...processedCalls, call];
          await this.rewriteAssistantToolCalls(assistantMessage.id, trimmedToolCalls);
          const confirmation = await this.repo.createPendingConfirmation({
            conversationId,
            messageId: assistantMessage.id,
            toolCallId: call.id,
            toolName: call.name,
            toolArgsJson: parsed.value,
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

  private async rewriteAssistantToolCalls(messageId: string, toolCalls: ToolCall[]): Promise<void> {
    // Prisma's assistant message doesn't expose an update helper in our repo yet;
    // do a direct update via a small method on the repo. Fall back to inline.
    await (this.repo as any)['prisma']?.assistantMessage?.update?.({
      where: { id: messageId },
      data: { toolCalls: toolCalls as any },
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
    return [{ role: 'system', content: ASSISTANT_SYSTEM_PROMPT }, ...truncated];
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
  const tailStart = Math.max(
    messages.length - (max - head.length - 1),
    firstUserIdx + 1,
  );
  const tail = messages.slice(tailStart);
  const placeholder: ChatMessage = {
    role: 'system',
    content: `[${messages.length - head.length - tail.length} earlier message(s) truncated to stay within the model's context window.]`,
  };
  return [...head, placeholder, ...tail];
}
