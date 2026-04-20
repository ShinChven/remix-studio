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
export class OpenAIChatProvider implements ChatProvider {
  protected client: OpenAI;

  constructor(apiKey: string, apiUrl?: string) {
    let finalBaseUrl = apiUrl || undefined;
    if (finalBaseUrl && !finalBaseUrl.includes('/v1') && !finalBaseUrl.includes('openai.azure.com') && !finalBaseUrl.includes('localhost') && !finalBaseUrl.includes('127.0.0.1')) {
      finalBaseUrl = `${finalBaseUrl.endsWith('/') ? finalBaseUrl.slice(0, -1) : finalBaseUrl}/v1`;
    }
    this.client = new OpenAI({ apiKey, baseURL: finalBaseUrl });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const messages = mapMessages(req.messages);
    const tools = req.tools.length > 0 ? req.tools.map(mapTool) : undefined;

    const response = await this.client.chat.completions.create(
      {
        model: req.modelId,
        messages,
        ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
        ...(typeof req.maxTokens === 'number' ? { max_tokens: req.maxTokens } : {}),
        ...(tools ? { tools, tool_choice: 'auto' as const } : {}),
      },
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
      }));

    return {
      text: message.content ?? '',
      toolCalls,
      stopReason: mapStopReason(choice.finish_reason, toolCalls.length > 0),
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
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

function mapMessages(messages: ChatMessage[]): any[] {
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
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        }));
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
