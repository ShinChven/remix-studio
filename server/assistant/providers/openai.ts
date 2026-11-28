import crypto from 'crypto';
import OpenAI from 'openai';
import {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatStopReason,
  ToolCall,
  toolParametersJsonSchema,
  safeParseJsonArgs,
} from './types';
import type { ChatMessage } from './types';

/**
 * OpenAI chat adapter. Also used by `grok.ts` because xAI's Grok API is
 * OpenAI-compatible; the Grok adapter subclasses this one with a different
 * default base URL.
 */
/**
 * GPT-5, GPT-6 and the o-series reject `max_tokens` outright and require
 * `max_completion_tokens`. Everything else — including OpenAI-compatible
 * third-party endpoints reached via a custom base URL — takes `max_tokens`.
 */
function outputTokenParam(modelId: string, maxTokens: number): Record<string, number> {
  const id = modelId.toLowerCase();
  const usesCompletionTokens = /^(gpt-[56]|o[1-9])/.test(id);
  return usesCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
}

/** OpenAI enforces a 64-character limit on `prompt_cache_key`. */
function normalizePromptCacheKey(key: string): string {
  if (key.length <= 64) return key;
  return crypto.createHash('sha256').update(key).digest('hex');
}

export class OpenAIChatProvider implements ChatProvider {
  protected client: OpenAI;
  private isOfficialOpenAI: boolean;

  /**
   * Extra request-body fields for OpenAI-compatible endpoints that need one
   * (MiniMax uses it to keep the model's reasoning out of `content`).
   */
  protected extraBody(): Record<string, unknown> {
    return {};
  }

  /**
   * Whether the endpoint accepts OpenAI's `prompt_cache_key` parameter.
   * Restrict to official OpenAI endpoints so third-party OpenAI-compatible
   * gateways (Grok, Kimi, DashScope, MiniMax, APIMart, custom proxies) don't
   * reject an unknown field; they still benefit from automatic prefix caching.
   */
  protected supportsPromptCacheKey(): boolean {
    return this.constructor === OpenAIChatProvider && this.isOfficialOpenAI;
  }

  constructor(apiKey: string, apiUrl?: string) {
    let finalBaseUrl = apiUrl || undefined;
    if (finalBaseUrl && !finalBaseUrl.includes('/v1') && !finalBaseUrl.includes('openai.azure.com') && !finalBaseUrl.includes('localhost') && !finalBaseUrl.includes('127.0.0.1')) {
      finalBaseUrl = `${finalBaseUrl.endsWith('/') ? finalBaseUrl.slice(0, -1) : finalBaseUrl}/v1`;
    }
    this.isOfficialOpenAI = !finalBaseUrl || /https?:\/\/api\.openai\.com(\/|$)/i.test(finalBaseUrl);
    this.client = new OpenAI({ apiKey, baseURL: finalBaseUrl });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (
      (this.supportsPromptCacheKey() && (req.webSearch || /^gpt-6/i.test(req.modelId))) ||
      /^gpt-6\.2-(?:astra|sol)(?:-|$)/i.test(req.modelId)
    ) {
      return this.chatWithResponses(req);
    }
    const kimiK31 = /^kimi-k3\.1-pro/i.test(req.modelId);
    const messages = mapMessages(req.messages, kimiK31);
    const tools = req.tools.length > 0 ? req.tools.map(mapTool) : undefined;

    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: req.modelId,
      messages,
      ...(typeof req.temperature === 'number' && !/^(gpt-6|qwen4-max|kimi-k3\.1-pro)/i.test(req.modelId) ? { temperature: req.temperature } : {}),
      ...(typeof req.maxTokens === 'number' ? outputTokenParam(req.modelId, req.maxTokens) : {}),
      ...(tools ? { tools, tool_choice: 'auto' as const } : {}),
    };

    const cacheBody = req.cacheKey && this.supportsPromptCacheKey()
      ? { prompt_cache_key: normalizePromptCacheKey(req.cacheKey) }
      : {};

    const response = await this.client.chat.completions.create(
      { ...params, ...cacheBody, ...this.extraBody() } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      { signal: req.abortSignal },
    );

    const choice = response.choices[0];
    if (!choice) throw new Error('OpenAI chat: no choices in response');

    const message = choice.message;
    const toolCalls: ToolCall[] = (message.tool_calls ?? [])
      .filter((tc: any) => tc.type === 'function')
      .map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJsonArgs(tc.function.arguments),
        ...(kimiK31 ? { kimiRawArguments: tc.function.arguments } : {}),
      }));
    const reasoningContent = (message as typeof message & { reasoning_content?: string }).reasoning_content;
    if (kimiK31 && toolCalls[0] && typeof reasoningContent === 'string') {
      toolCalls[0].kimiReasoningContent = reasoningContent;
    }

    const rawUsage = response.usage as
      | (typeof response.usage & {
          prompt_tokens_details?: { cached_tokens?: number };
          cached_tokens?: number;
        })
      | undefined;
    const cachedInputTokens =
      typeof rawUsage?.prompt_tokens_details?.cached_tokens === 'number'
        ? rawUsage.prompt_tokens_details.cached_tokens
        : typeof rawUsage?.cached_tokens === 'number'
          ? rawUsage.cached_tokens
          : undefined;

    return {
      text: message.content ?? '',
      toolCalls,
      stopReason: mapStopReason(choice.finish_reason, toolCalls.length > 0),
      usage: rawUsage ? {
        inputTokens: rawUsage.prompt_tokens,
        outputTokens: rawUsage.completion_tokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      } : undefined,
    };
  }

  /**
   * Uses OpenAI's Responses API for native Web Search and for GPT-6+ models
   * (preserving encrypted reasoning items across tool loops and extracting URL citations).
   */
  private async chatWithResponses(req: ChatRequest): Promise<ChatResponse> {
    const tools: any[] = [
      ...(req.webSearch ? [{ type: 'web_search', search_context_size: 'medium' }] : []),
      ...req.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: toolParametersJsonSchema(tool),
        strict: false,
      })),
    ];
    const response: any = await (this.client as any).responses.create({
      model: req.modelId,
      input: mapResponsesInput(req.messages),
      store: false,
      include: ['reasoning.encrypted_content'],
      ...(req.maxTokens !== undefined ? { max_output_tokens: req.maxTokens } : {}),
      ...(req.cacheKey && this.supportsPromptCacheKey()
        ? { prompt_cache_key: normalizePromptCacheKey(req.cacheKey) }
        : {}),
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    }, { signal: req.abortSignal });

    const toolCalls: ToolCall[] = [];
    const reasoning: NonNullable<ToolCall['openAIReasoning']> = [];
    let text = '';
    const sources: Array<{ title: string; url: string }> = [];
    const seenUrls = new Set<string>();

    for (const item of response.output ?? []) {
      if (item.type === 'reasoning' && item.encrypted_content) {
        reasoning.push({ id: item.id, encryptedContent: item.encrypted_content });
      } else if (item.type === 'function_call') {
        toolCalls.push({ id: item.call_id || item.id, name: item.name, arguments: safeParseJsonArgs(item.arguments) });
      } else if (item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            text += part.text;
            if (Array.isArray(part.annotations)) {
              for (const ann of part.annotations) {
                if (ann?.type === 'url_citation' && typeof ann.url === 'string' && !seenUrls.has(ann.url)) {
                  seenUrls.add(ann.url);
                  sources.push({ title: String(ann.title || ann.url), url: ann.url });
                }
              }
            }
          }
        }
      }
    }
    if (toolCalls[0] && reasoning.length) toolCalls[0].openAIReasoning = reasoning;

    if (!text && typeof response.output_text === 'string') {
      text = response.output_text;
    }
    if (toolCalls.length === 0 && sources.length > 0) {
      const links = sources.slice(0, 8).map((s) => `[${s.title.replace(/[\[\]]/g, '')}](${s.url})`).join(' · ');
      text = `${text.trimEnd()}\n\n---\n**Sources:** ${links}`;
    }

    const usage = response.usage;
    const cachedInputTokens = typeof usage?.input_tokens_details?.cached_tokens === 'number'
      ? usage.input_tokens_details.cached_tokens
      : undefined;

    return {
      text,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use'
        : response.incomplete_details?.reason === 'max_output_tokens' || response.status === 'incomplete' ? 'max_tokens'
        : response.status === 'completed' ? 'end_turn' : 'error',
      usage: usage ? {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
      } : undefined,
    };
  }
}

function mapResponsesInput(messages: ChatMessage[]): OpenAI.Responses.ResponseInput {
  const input: OpenAI.Responses.ResponseInput = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content });
    } else if (message.role === 'assistant') {
      for (const call of message.toolCalls || []) {
        for (const item of call.openAIReasoning || []) {
          input.push({ type: 'reasoning', id: item.id, encrypted_content: item.encryptedContent, summary: [] });
        }
      }
      if (message.content) input.push({ role: 'assistant', content: message.content });
      for (const call of message.toolCalls || []) {
        input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments ?? {}) });
      }
    } else if (message.role === 'user' && message.images?.length) {
      const content: OpenAI.Responses.ResponseInputContent[] = message.images.map((image_url) => ({
        type: 'input_image', image_url, detail: 'auto',
      }));
      if (message.content) content.push({ type: 'input_text', text: message.content });
      input.push({ role: 'user', content });
    } else {
      input.push({ role: message.role, content: message.content });
    }
  }
  return input;
}

function mapTool(tool: Parameters<typeof toolParametersJsonSchema>[0]) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toolParametersJsonSchema(tool) as any,
    },
  };
}

function mapMessages(messages: ChatMessage[], preserveKimiReasoning: boolean): any[] {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      // If there are images, use the content array format
      if (m.images && m.images.length > 0) {
        const contentParts: any[] = [];
        // Prepend images as image_url blocks
        for (const dataUri of m.images) {
          contentParts.push({ type: 'image_url', image_url: { url: dataUri } });
        }
        if (m.content) {
          contentParts.push({ type: 'text', text: m.content });
        }
        out.push({ role: 'user', content: contentParts });
      } else {
        out.push({ role: 'user', content: m.content });
      }
    } else if (m.role === 'assistant') {
      const entry: any = { role: 'assistant', content: m.content || null };
      if (m.toolCalls && m.toolCalls.length > 0) {
        entry.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: (preserveKimiReasoning && tc.kimiRawArguments) || JSON.stringify(tc.arguments ?? {}) },
        }));
        if (preserveKimiReasoning) {
          const reasoning = m.toolCalls.find((tc) => tc.kimiReasoningContent)?.kimiReasoningContent;
          if (reasoning) entry.reasoning_content = reasoning;
        }
      }
      out.push(entry);
    } else if (m.role === 'tool') {
      // m.content already contains the serialized JSON string from wrapToolResult.
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    }
  }
  return out;
}

function mapStopReason(reason: string | null | undefined, hasToolCalls: boolean): ChatStopReason {
  if (hasToolCalls) return 'tool_use';
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'error';
  }
}
