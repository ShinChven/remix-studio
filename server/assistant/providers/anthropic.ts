import Anthropic from '@anthropic-ai/sdk';
import {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatStopReason,
  ToolCall,
  toolParametersJsonSchema,
} from './types';
import type { ChatMessage } from './types';

/**
 * Anthropic (Claude) chat adapter.
 */
export class ClaudeChatProvider implements ChatProvider {
  private client: Anthropic;

  constructor(apiKey: string, apiUrl?: string) {
    this.client = new Anthropic({
      apiKey,
      ...(apiUrl ? { baseURL: apiUrl } : {}),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { system, messages } = splitSystemAndMessages(req.messages);
    const tools = req.tools.length > 0 ? req.tools.map(mapTool) : undefined;

    // Anthropic prompt caching requires explicit `cache_control` breakpoints
    // (evaluated in order: tools → system → messages). Placing breakpoints on
    // the last tool, the static system block, and the tail of `messages` lets
    // every subsequent tool-loop iteration and follow-up turn read the entire
    // prior prefix from KV cache.
    if (tools && tools.length > 0) {
      (tools[tools.length - 1] as any).cache_control = { type: 'ephemeral' };
    }
    const systemBlocks = system
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;
    attachTailCacheControl(messages);

    const response = await this.client.messages.create(
      {
        model: req.modelId,
        max_tokens: req.maxTokens ?? 2048,
        ...(typeof req.temperature === 'number' ? { temperature: clampTemperature(req.temperature) } : {}),
        ...(systemBlocks ? { system: systemBlocks } : {}),
        messages,
        ...(tools ? { tools } : {}),
      } as any,
      { signal: req.abortSignal },
    );

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    const rawUsage = response.usage as
      | (typeof response.usage & {
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        })
      | undefined;
    const cachedInputTokens = typeof rawUsage?.cache_read_input_tokens === 'number'
      ? rawUsage.cache_read_input_tokens
      : undefined;
    const cacheCreationInputTokens = typeof rawUsage?.cache_creation_input_tokens === 'number'
      ? rawUsage.cache_creation_input_tokens
      : undefined;
    const totalInputTokens = rawUsage
      ? (rawUsage.input_tokens ?? 0) + (cachedInputTokens ?? 0) + (cacheCreationInputTokens ?? 0)
      : undefined;

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(response.stop_reason, toolCalls.length > 0),
      usage: rawUsage ? {
        inputTokens: totalInputTokens,
        outputTokens: rawUsage.output_tokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
        ...(cacheCreationInputTokens !== undefined ? { cacheCreationInputTokens } : {}),
      } : undefined,
    };
  }
}

/**
 * Mark the final content block of the last message as an ephemeral cache
 * breakpoint so the conversation prefix stays cached across tool-loop
 * iterations and follow-up user turns.
 */
function attachTailCacheControl(messages: any[]): void {
  if (messages.length === 0) return;
  const last = messages[messages.length - 1];
  if (!Array.isArray(last?.content) || last.content.length === 0) return;
  const lastBlock = last.content[last.content.length - 1];
  if (lastBlock && typeof lastBlock === 'object') {
    lastBlock.cache_control = { type: 'ephemeral' };
  }
}

function mapTool(tool: Parameters<typeof toolParametersJsonSchema>[0]) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toolParametersJsonSchema(tool) as any,
  };
}

/**
 * Anthropic's API takes `system` as a top-level param (not a message role),
 * so we collapse all system messages into a single string. Multiple system
 * messages become a newline-joined block.
 */
function splitSystemAndMessages(messages: ChatMessage[]): { system: string | undefined; messages: any[] } {
  const systemParts: string[] = [];
  const out: any[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      const userContentBlocks: any[] = [];
      // Prepend inline images as Anthropic image content blocks
      if (m.images && m.images.length > 0) {
        for (const dataUri of m.images) {
          const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            userContentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: match[2],
              },
            });
          }
        }
      }
      if (m.content) {
        userContentBlocks.push({ type: 'text', text: m.content });
      }
      out.push({ role: 'user', content: userContentBlocks.length > 0 ? userContentBlocks : [{ type: 'text', text: '' }] });
      continue;
    }
    if (m.role === 'assistant') {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments ?? {},
          });
        }
      }
      // An assistant turn must have at least one block.
      if (blocks.length === 0) blocks.push({ type: 'text', text: '' });
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    if (m.role === 'tool') {
      // Anthropic expects tool results as user messages with tool_result blocks.
      // m.content already contains the serialized JSON string from wrapToolResult;
      // use it directly rather than re-stringifying toolResultJson.
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.toolCallId,
          content: [{ type: 'text', text: m.content }],
        }],
      });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: out,
  };
}

function mapStopReason(reason: string | null | undefined, hasToolCalls: boolean): ChatStopReason {
  if (hasToolCalls) return 'tool_use';
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'error';
  }
}

function clampTemperature(value: number): number {
  // Claude's API caps temperature at 1.0.
  return Math.max(0, Math.min(1, value));
}
