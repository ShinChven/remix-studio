import { z } from 'zod';
import type { AssistantToolDefinition } from '../../mcp/tool-definitions';

/**
 * Provider-agnostic chat interface for the assistant runtime.
 *
 * Distinct from `server/generators/text-generator.ts` on purpose: that path
 * is one-shot prompt-in/text-out for queued generation; this one models a
 * full chat turn with message history, tool calls, tool results, and a
 * stop reason.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  thoughtSignature?: string;
}

export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  tools: AssistantToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export type ChatStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: ChatStopReason;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ChatProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

/**
 * Convert a tool's Zod shape into a JSON Schema object suitable for each
 * provider's tool declarations. We strip `$schema` and other wrapper fields
 * so the payload is a direct JSONSchema object.
 */
export function toolParametersJsonSchema(tool: AssistantToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(z.object(tool.inputSchema) as any, { target: 'draft-7' } as any) as any;
  const { $schema, definitions, ...rest } = schema ?? {};
  if (!rest.type) rest.type = 'object';
  if (!rest.properties) rest.properties = {};
  return rest;
}

/**
 * Parse a JSON string safely into an object; returns `{}` on failure so the
 * runner can still reason about the call even if the model emitted malformed
 * args. Adapters use this when a provider returns stringified arguments.
 */
export function safeParseJsonArgs(raw: string | null | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
