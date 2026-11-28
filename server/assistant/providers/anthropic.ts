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
    const tools: any[] = req.tools.length > 0 ? req.tools.map(mapTool) : [];

    // Anthropic prompt caching requires explicit `cache_control` breakpoints
    // (evaluated in order: tools → system → messages). Placing breakpoints on
    // the last regular tool, the static system block, and the tail of `messages`
    // lets every subsequent tool-loop iteration and follow-up turn read the
    // entire prior prefix from KV cache.
    if (tools.length > 0) {
      tools[tools.length - 1].cache_control = { type: 'ephemeral' };
    }
    if (req.webSearch) {
      // Cap per-turn searches to 3 to keep costs predictable.
      tools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      });
    }
    const finalTools = tools.length > 0 ? tools : undefined;
    const systemBlocks = system
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;
    attachTailCacheControl(messages);

    const includeThoughts = req.includeThoughts ?? typeof req.onThought === 'function';
    const canEnableThinking = includeThoughts
      && supportsAdaptiveThinking(req.modelId)
      && !hasUnsignedToolLoopInCurrentTurn(req.messages);
    const allowTemperature = !canEnableThinking && supportsSamplingTemperature(req.modelId);
    const maxTokens = canEnableThinking
      ? Math.max(req.maxTokens ?? 8192, 4096)
      : (req.maxTokens ?? 4096);

    const params: any = {
      model: req.modelId,
      max_tokens: maxTokens,
      ...(allowTemperature && typeof req.temperature === 'number'
        ? { temperature: clampTemperature(req.temperature) }
        : {}),
      ...(canEnableThinking ? { thinking: { type: 'adaptive', display: 'summarized' } } : {}),
      ...(systemBlocks ? { system: systemBlocks } : {}),
      messages,
      ...(finalTools ? { tools: finalTools } : {}),
    };

    const shouldStreamThoughts = typeof req.onThought === 'function'
      && (canEnableThinking || alwaysThinksModel(req.modelId));

    const response = shouldStreamThoughts
      ? await this.createMessageWithThoughtStreaming(params, req.abortSignal, req.onThought!)
      : await this.client.messages.create(params, { signal: req.abortSignal });

    let text = '';
    const toolCalls: ToolCall[] = [];
    const thinkingBlocks: any[] = [];
    const sources: Array<{ title: string; url: string }> = [];
    const seenUrls = new Set<string>();
    for (const block of response.content as any[]) {
      if (block.type === 'thinking') {
        if (typeof block.thinking === 'string' && block.thinking.trim()) {
          text += `<think>\n${block.thinking}\n</think>\n\n`;
        }
        if (typeof block.signature === 'string' && block.signature) {
          thinkingBlocks.push({
            type: 'thinking',
            thinking: typeof block.thinking === 'string' ? block.thinking : '',
            signature: block.signature,
          });
        }
      } else if (block.type === 'redacted_thinking' && typeof block.data === 'string') {
        thinkingBlocks.push({ type: 'redacted_thinking', data: block.data });
      } else if (block.type === 'text') {
        text += block.text;
        if (Array.isArray(block.citations)) {
          for (const cite of block.citations) {
            if (typeof cite?.url === 'string' && !seenUrls.has(cite.url)) {
              seenUrls.add(cite.url);
              sources.push({ title: String(cite.title || cite.url), url: cite.url });
            }
          }
        }
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }
    if (toolCalls.length > 0 && thinkingBlocks.length > 0) {
      // Preserve signed thinking blocks on the first tool call so multi-turn
      // tool-use loops can echo them back verbatim as Anthropic requires.
      toolCalls[0].thoughtSignature = JSON.stringify(thinkingBlocks);
    }
    if (toolCalls.length === 0 && sources.length > 0) {
      const links = sources.slice(0, 8).map((s) => `[${s.title.replace(/[\[\]]/g, '')}](${s.url})`).join(' · ');
      text = `${text.trimEnd()}\n\n---\n**Sources:** ${links}`;
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

  private async createMessageWithThoughtStreaming(
    params: any,
    abortSignal: AbortSignal | undefined,
    onThought: NonNullable<ChatRequest['onThought']>,
  ): Promise<Anthropic.Message> {
    const stream = this.client.messages.stream(params, { signal: abortSignal });
    let thoughtText = '';
    let lastThoughtTitle = '';
    stream.on('thinking', (delta: string) => {
      if (!delta) return;
      thoughtText += delta;
      const title = deriveThinkingTitle(thoughtText);
      if (title && title !== lastThoughtTitle) {
        lastThoughtTitle = title;
        onThought({ title, content: thoughtText });
      }
    });
    return stream.finalMessage();
  }
}

function alwaysThinksModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return (
    id.startsWith('claude-fable-5') ||
    id.startsWith('claude-opus-5') ||
    id.startsWith('claude-sonnet-5') ||
    id.startsWith('claude-haiku-5')
  );
}

function supportsAdaptiveThinking(modelId: string): boolean {
  return /^claude-(?:fable-5|opus-5|sonnet-5|haiku-5)/i.test(modelId);
}

function supportsSamplingTemperature(modelId: string): boolean {
  return !alwaysThinksModel(modelId);
}

function parseStoredThinkingBlocks(signature: string | undefined): any[] {
  if (!signature || !signature.startsWith('[')) return [];
  try {
    const parsed = JSON.parse(signature);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b) =>
        b &&
        typeof b === 'object' &&
        ((b.type === 'thinking' && typeof b.signature === 'string') ||
          (b.type === 'redacted_thinking' && typeof b.data === 'string')),
    );
  } catch {
    return [];
  }
}

/**
 * Anthropic requires every assistant `tool_use` block in the current turn to
 * include its original signed `thinking` block when thinking is enabled.
 * If an older message in the current turn lacks a stored signature, skip
 * enabling explicit thinking for this call so the API won't 400.
 */
function hasUnsignedToolLoopInCurrentTurn(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') return false;
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks = parseStoredThinkingBlocks(m.toolCalls[0]?.thoughtSignature);
      if (blocks.length === 0) return true;
    }
  }
  return false;
}

function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

function deriveThinkingTitle(thought: string): string {
  const boldMatches = Array.from(thought.matchAll(/\*\*([^*\n]{3,90})\*\*/g));
  const lastBold = boldMatches[boldMatches.length - 1]?.[1]?.trim();
  if (lastBold) return lastBold;
  const firstLine = thought
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length >= 4);
  if (!firstLine) return 'Thinking...';
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
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
      const thinkingBlocks = parseStoredThinkingBlocks(m.toolCalls?.[0]?.thoughtSignature);
      if (thinkingBlocks.length > 0) {
        blocks.push(...thinkingBlocks);
      }
      const cleanText = m.content ? stripThinkTags(m.content) : '';
      if (cleanText) blocks.push({ type: 'text', text: cleanText });
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
