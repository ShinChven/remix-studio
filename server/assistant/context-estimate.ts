import type { ChatMessage, ToolCall } from './providers/types';

/**
 * Rough token counts for the parts of a chat request. Providers report only one
 * input total, so the parts are estimated here and the caller scales them to the
 * total the model last reported.
 */

/** Approximate tokens per attached image; providers bill 250–1,600 for a 1024px image. */
export const IMAGE_TOKEN_ESTIMATE = 1000;
/** Per-message framing (role markers, separators). */
const MESSAGE_OVERHEAD = 4;

const WIDE_CHAR = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u;

/** About one token per CJK character and per four characters of other text. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  let wide = 0;
  let other = 0;
  for (const char of text) {
    if (WIDE_CHAR.test(char)) wide++;
    else other++;
  }
  return Math.ceil(wide + other / 4);
}

export interface ContextCategories {
  systemPrompt: number;
  tools: number;
  userMessages: number;
  assistantMessages: number;
  toolResults: number;
  images: number;
}

export interface ToolDefinitionEstimate {
  name: string;
  tokens: number;
}

export function estimateToolDefinitions(
  tools: { name: string; description: string }[],
  schemaOf: (tool: any) => unknown,
): ToolDefinitionEstimate[] {
  return tools
    .map((tool) => ({
      name: tool.name,
      tokens: estimateTokens(JSON.stringify({ name: tool.name, description: tool.description, parameters: schemaOf(tool) })) + MESSAGE_OVERHEAD,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function toolCallsText(toolCalls: ToolCall[] | undefined): string {
  if (!toolCalls || toolCalls.length === 0) return '';
  return toolCalls.map((call) => `${call.name}${JSON.stringify(call.arguments ?? {})}`).join('\n');
}

/** Splits the messages of a request into categories. Tool definitions are added by the caller. */
export function estimateMessages(messages: ChatMessage[]): Omit<ContextCategories, 'tools'> & { imageCount: number } {
  const result = { systemPrompt: 0, userMessages: 0, assistantMessages: 0, toolResults: 0, images: 0, imageCount: 0 };
  for (const message of messages) {
    const tokens = estimateTokens(message.content) + MESSAGE_OVERHEAD;
    switch (message.role) {
      case 'system':
        result.systemPrompt += tokens;
        break;
      case 'user': {
        result.userMessages += tokens;
        const imageCount = message.images?.length ?? 0;
        result.imageCount += imageCount;
        result.images += imageCount * IMAGE_TOKEN_ESTIMATE;
        break;
      }
      case 'assistant':
        result.assistantMessages += tokens + estimateTokens(toolCallsText(message.toolCalls));
        break;
      case 'tool':
        result.toolResults += tokens;
        break;
      default:
        break;
    }
  }
  return result;
}

export function sumCategories(categories: ContextCategories): number {
  return Object.values(categories).reduce((sum, value) => sum + value, 0);
}
