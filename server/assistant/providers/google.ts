import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
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
 * Maps synthetic model IDs from the UI (like `gemini-3.1-flash-lite-preview`)
 * to ones that actually exist in the Google API (e.g., `gemini-2.5-flash`).
 * Resolves the 404 Not Found error using real internet knowledge.
 */
function resolveRealGeminiModelId(modelId: string): string {
  if (modelId.includes('3.1-flash-lite')) return 'gemini-3-flash-preview';
  if (modelId.includes('3.1-pro')) return 'gemini-3.1-pro-preview';
  if (modelId.includes('3.1-flash')) return 'gemini-3-flash-preview';
  if (modelId.includes('3-flash')) return 'gemini-3-flash-preview';
  // Fallbacks:
  if (modelId.includes('flash') && !modelId.includes('3.')) return 'gemini-3-flash-preview';
  if (modelId.includes('pro') && !modelId.includes('3.')) return 'gemini-3.1-pro-preview';
  return modelId;
}

/**
 * Google AI (Gemini) chat adapter. Uses the official @google/genai SDK.
 */
export class GoogleAIChatProvider implements ChatProvider {
  private ai: GoogleGenAI;

  constructor(apiKey: string, apiUrl?: string) {
    this.ai = new GoogleGenAI({
      apiKey,
      // The new SDK handles baseUrl internally if provided, but typically defaults correctly.
      ...(apiUrl ? { baseUrl: apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl } : {}),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { systemInstruction, contents, toolCallNameById } = mapMessages(req.messages);

    // Filter out unsupported keywords
    const tools = req.tools.length > 0
      ? [{ functionDeclarations: req.tools.map(mapTool) }]
      : undefined;

    const realModelId = resolveRealGeminiModelId(req.modelId);

    const config: any = {
      ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
      ...(typeof req.maxTokens === 'number' ? { maxOutputTokens: req.maxTokens } : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(tools ? { tools } : {}),
    };

    if (
      realModelId.includes('gemini-3') ||
      realModelId.includes('gemini-2.5') ||
      realModelId.includes('thinking')
    ) {
      config.thinkingConfig = { includeThoughts: true };
    }

    const shouldStreamThoughts = typeof req.onThought === 'function'
      && (
        realModelId.includes('gemini-3') ||
        realModelId.includes('gemini-2.5') ||
        realModelId.includes('thinking')
      );

    const res = shouldStreamThoughts
      ? await this.generateContentWithThoughtStreaming(realModelId, contents, config, req.onThought!)
      : await this.ai.models.generateContent({
        model: realModelId,
        contents,
        config,
      });

    const candidate = res.candidates?.[0];
    if (!candidate) {
      if (res.promptFeedback?.blockReason) {
        throw new Error(`Google AI blocked prompt: ${res.promptFeedback.blockReason}`);
      }
      throw new Error('Google AI chat: no candidates returned');
    }

    let text = '';
    const toolCalls: ToolCall[] = [];
    const parts = candidate.content?.parts ?? [];
    
    for (const part of parts) {
      if (part.text) {
        if ((part as any).thought) {
          text += `<think>\n${part.text}\n</think>\n\n`;
        } else {
          text += part.text;
        }
      } else if (part.functionCall) {
        const id = `call_${crypto.randomUUID()}`;
        toolCalls.push({
          id,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
          thoughtSignature: typeof part.thoughtSignature === 'string' ? part.thoughtSignature : undefined,
        });
      }
    }

    void toolCallNameById;

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(candidate.finishReason, toolCalls.length > 0),
      usage: res.usageMetadata ? {
        inputTokens: res.usageMetadata.promptTokenCount,
        outputTokens: res.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }

  private async generateContentWithThoughtStreaming(
    model: string,
    contents: any[],
    config: any,
    onThought: NonNullable<ChatRequest['onThought']>,
  ) {
    const stream = await this.ai.models.generateContentStream({
      model,
      contents,
      config,
    });

    let visibleText = '';
    let thoughtText = '';
    const toolCallsByKey = new Map<string, ToolCall>();
    let lastChunk: any = null;
    let lastThoughtTitle = '';

    for await (const chunk of stream) {
      lastChunk = chunk;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          if ((part as any).thought) {
            thoughtText = appendIncrementalText(thoughtText, part.text);
            const title = deriveThinkingTitle(thoughtText);
            if (title && title !== lastThoughtTitle) {
              lastThoughtTitle = title;
              onThought({ title, content: thoughtText });
            }
          } else {
            visibleText = appendIncrementalText(visibleText, part.text);
          }
          continue;
        }
        if (part.functionCall) {
          const key = JSON.stringify([
            part.functionCall.name ?? '',
            part.functionCall.args ?? {},
            part.thoughtSignature ?? '',
          ]);
          if (!toolCallsByKey.has(key)) {
            toolCallsByKey.set(key, {
              id: `call_${crypto.randomUUID()}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
              thoughtSignature: typeof part.thoughtSignature === 'string' ? part.thoughtSignature : undefined,
            });
          }
        }
      }
    }

    if (!lastChunk) {
      throw new Error('Google AI chat: no chunks returned');
    }

    const candidate = lastChunk.candidates?.[0];
    if (!candidate) {
      if (lastChunk.promptFeedback?.blockReason) {
        throw new Error(`Google AI blocked prompt: ${lastChunk.promptFeedback.blockReason}`);
      }
      throw new Error('Google AI chat: no candidates returned');
    }

    candidate.content = {
      ...(candidate.content ?? {}),
      parts: [
        ...(thoughtText ? [{ text: thoughtText, thought: true }] : []),
        ...(visibleText ? [{ text: visibleText }] : []),
        ...Array.from(toolCallsByKey.values()).map((call) => ({
          functionCall: { name: call.name, args: call.arguments ?? {} },
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        })),
      ],
    };

    return lastChunk;
  }
}

function appendIncrementalText(current: string, incoming: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;
  return current + incoming;
}

function deriveThinkingTitle(thoughtText: string): string {
  const markdownTitle = extractLastMarkdownTitle(thoughtText);
  if (markdownTitle) return markdownTitle;

  const normalized = thoughtText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#>\s]+/, '').trim())
    .filter(Boolean);
  const latestLine = normalized.at(-1);
  if (latestLine) return truncateTitle(latestLine);

  const sentenceParts = thoughtText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const latestSentence = sentenceParts.at(-1);
  if (latestSentence) return truncateTitle(latestSentence);

  return '';
}

function truncateTitle(title: string): string {
  return title.length > 96 ? `${title.slice(0, 93).trimEnd()}...` : title;
}

function extractLastMarkdownTitle(thoughtText: string): string {
  const titleMatches = Array.from(
    thoughtText.matchAll(/(?:^|\n)\s*\*\*([^*\n][^*\n]{0,200}?)\*\*\s*(?=\n|$)/g),
  );
  const lastBoldTitle = titleMatches.at(-1)?.[1]?.trim();
  if (lastBoldTitle) return truncateTitle(lastBoldTitle);

  const headingMatches = Array.from(
    thoughtText.matchAll(/(?:^|\n)\s*#{1,6}\s+([^\n#][^\n]{0,200}?)(?=\n|$)/g),
  );
  const lastHeadingTitle = headingMatches.at(-1)?.[1]?.trim();
  if (lastHeadingTitle) return truncateTitle(lastHeadingTitle);

  return '';
}

function mapTool(tool: Parameters<typeof toolParametersJsonSchema>[0]) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: stripAdditionalProperties(toolParametersJsonSchema(tool)) as any,
  };
}

/**
 * Recursively remove `additionalProperties` from a JSON Schema tree.
 * Gemini's API does not support this keyword.
 */
function stripAdditionalProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema };
  delete result.additionalProperties;

  if (result.properties && typeof result.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(result.properties as Record<string, unknown>)) {
      props[key] = val && typeof val === 'object' && !Array.isArray(val)
        ? stripAdditionalProperties(val as Record<string, unknown>)
        : val;
    }
    result.properties = props;
  }

  if (result.items && typeof result.items === 'object' && !Array.isArray(result.items)) {
    result.items = stripAdditionalProperties(result.items as Record<string, unknown>);
  }

  return result;
}

function mapMessages(messages: ChatMessage[]): {
  systemInstruction: string | undefined;
  contents: any[];
  toolCallNameById: Map<string, string>;
} {
  const systemParts: string[] = [];
  const contents: any[] = [];
  const toolCallNameById = new Map<string, string>();
  let pendingToolResponses: any[] = [];

  const flushPendingToolResponses = () => {
    if (pendingToolResponses.length === 0) return;
    contents.push({ role: 'user', parts: pendingToolResponses });
    pendingToolResponses = [];
  };

  for (const m of messages) {
    if (m.role === 'system') {
      flushPendingToolResponses();
      if (m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      flushPendingToolResponses();
      contents.push({ role: 'user', parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      flushPendingToolResponses();
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          toolCallNameById.set(tc.id, tc.name);
          const part: any = { functionCall: { name: tc.name, args: tc.arguments ?? {} } };
          if (typeof tc.thoughtSignature === 'string' && tc.thoughtSignature.length > 0) {
            part.thoughtSignature = tc.thoughtSignature;
          }
          parts.push(part);
        }
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }
    if (m.role === 'tool') {
      let parsed: unknown;
      try { parsed = JSON.parse(m.content); } catch { parsed = { result: m.content }; }
      pendingToolResponses.push({ functionResponse: { name: m.name, response: parsed } });
    }
  }

  flushPendingToolResponses();

  return {
    systemInstruction: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    contents,
    toolCallNameById,
  };
}

function mapStopReason(reason: string | null | undefined, hasToolCalls: boolean): ChatStopReason {
  if (hasToolCalls) return 'tool_use';
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    default:
      return 'error';
  }
}
