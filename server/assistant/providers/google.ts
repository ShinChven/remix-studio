import crypto from 'crypto';
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
 * Google AI (Gemini) chat adapter. Uses the public Generative Language API.
 * VertexAI lives in a different auth world and is intentionally not covered
 * here yet.
 *
 * Gemini has no opaque tool-call id — it returns function calls by name
 * only. We synthesize a stable id per call so the rest of the runtime can
 * correlate results the same way as OpenAI/Anthropic.
 */
export class GoogleAIChatProvider implements ChatProvider {
  private apiKey: string;
  private apiBase: string;

  constructor(apiKey: string, apiUrl?: string) {
    this.apiKey = apiKey;
    const base = apiUrl || 'https://generativelanguage.googleapis.com';
    this.apiBase = base.endsWith('/') ? base.slice(0, -1) : base;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { systemInstruction, contents, toolCallNameById } = mapMessages(req.messages);
    const tools = req.tools.length > 0
      ? [{ functionDeclarations: req.tools.map(mapTool) }]
      : undefined;

    const payload: any = {
      contents,
      generationConfig: {
        ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
        ...(typeof req.maxTokens === 'number' ? { maxOutputTokens: req.maxTokens } : {}),
      },
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(tools ? { tools, toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
    };

    const url = `${this.apiBase}/v1beta/models/${encodeURIComponent(req.modelId)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: req.abortSignal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google AI chat HTTP ${res.status}: ${text}`);
    }

    const data: any = await res.json();
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Google AI blocked prompt: ${data.promptFeedback.blockReason}`);
    }

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Google AI chat: no candidates');

    let text = '';
    const toolCalls: ToolCall[] = [];
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        text += part.text;
      } else if (part.functionCall) {
        const id = `call_${crypto.randomUUID()}`;
        toolCalls.push({
          id,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    // Forward synthesized call ids so future turns can echo results with the
    // same id if the runner needs it.
    void toolCallNameById;

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(candidate.finishReason, toolCalls.length > 0),
      usage: data.usageMetadata ? {
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}

function mapTool(tool: Parameters<typeof toolParametersJsonSchema>[0]) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toolParametersJsonSchema(tool) as any,
  };
}

function mapMessages(messages: ChatMessage[]): {
  systemInstruction: string | undefined;
  contents: any[];
  toolCallNameById: Map<string, string>;
} {
  const systemParts: string[] = [];
  const contents: any[] = [];
  const toolCallNameById = new Map<string, string>();

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          toolCallNameById.set(tc.id, tc.name);
          parts.push({ functionCall: { name: tc.name, args: tc.arguments ?? {} } });
        }
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }
    if (m.role === 'tool') {
      // Gemini expects tool results as user-role functionResponse parts.
      let parsed: unknown;
      try { parsed = JSON.parse(m.content); } catch { parsed = { result: m.content }; }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: parsed } }],
      });
    }
  }

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
