import crypto from 'crypto';
import { z } from 'zod';
import type { AssistantToolDefinition, ToolResult } from './tool-definitions';

const CONFIRMATION_FIELD_DESCRIPTIONS = {
  confirmed:
    'Set to true only after the user explicitly approves this exact action. When false or omitted, the server returns a confirmation preview without executing the tool.',
  confirmationHash:
    'Echo back the confirmationHash returned by the preview call. The server verifies it matches the exact normalized arguments before executing the tool.',
} as const;

export const MCP_CONFIRMATION_CONTROL_FIELDS = {
  confirmed: z.boolean().optional().describe(CONFIRMATION_FIELD_DESCRIPTIONS.confirmed),
  confirmationHash: z.string().min(1).optional().describe(CONFIRMATION_FIELD_DESCRIPTIONS.confirmationHash),
} satisfies z.ZodRawShape;

type ConfirmableTool = Pick<
  AssistantToolDefinition,
  'name' | 'title' | 'category' | 'annotations' | 'inputSchema' | 'requiresConfirmation'
>;

type ExternalResolution =
  | { kind: 'execute'; input: unknown }
  | { kind: 'return'; result: ToolResult };

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripConfirmationFields(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const { confirmed: _confirmed, confirmationHash: _confirmationHash, ...rest } = value;
  return rest;
}

function confirmationHashFor(toolName: string, args: unknown): string {
  const normalized = stableStringify(args);
  return crypto.createHash('sha256').update(`${toolName}\x00${normalized}`).digest('hex');
}

export function summarizeToolEffect(
  tool: Pick<AssistantToolDefinition, 'name' | 'title' | 'category'>,
  args: unknown,
): string {
  const objectArgs = isPlainObject(args) ? args : {};

  switch (tool.name) {
    case 'create_library':
      return `Create a text library named "${String(objectArgs.name ?? '')}".`;
    case 'create_prompt':
      return `Create one prompt in library "${String(objectArgs.library_id ?? '')}".`;
    case 'batch_create_prompts': {
      const count = Array.isArray(objectArgs.items) ? objectArgs.items.length : 0;
      return `Create ${count} prompt${count === 1 ? '' : 's'} in library "${String(objectArgs.library_id ?? '')}".`;
    }
    case 'create_project_with_workflow': {
      const workflowCount = Array.isArray(objectArgs.workflowItems) ? objectArgs.workflowItems.length : 0;
      return `Create a ${String(objectArgs.type ?? 'new')} project named "${String(objectArgs.name ?? '')}" with ${workflowCount} workflow item${workflowCount === 1 ? '' : 's'}.`;
    }
    default:
      return tool.category === 'destructive'
        ? `Run destructive tool "${tool.title}".`
        : `Run write tool "${tool.title}".`;
  }
}

function confirmationPreview(tool: ConfirmableTool, normalizedArgs: unknown): ToolResult {
  const confirmationHash = confirmationHashFor(tool.name, normalizedArgs);
  const payload = {
    requiresConfirmation: true,
    confirmationLevel: tool.category === 'destructive' ? 'destructive' : 'write',
    tool: {
      name: tool.name,
      title: tool.title,
      category: tool.category,
    },
    summary: summarizeToolEffect(tool, normalizedArgs),
    normalizedArguments: normalizedArgs,
    confirmationHash,
    message:
      `Review this action with the user. To execute it, re-call ${tool.name} with the exact same arguments plus confirmed: true and the returned confirmationHash.`,
  };

  return {
    text: JSON.stringify(payload, null, 2),
    structuredContent: payload,
  };
}

function confirmationError(message: string): ToolResult {
  return {
    text: JSON.stringify({ error: message }),
    structuredContent: { error: message },
    isError: true,
  };
}

export function toolRequiresConfirmation(tool: ConfirmableTool): boolean {
  if (typeof tool.requiresConfirmation === 'boolean') return tool.requiresConfirmation;
  return tool.category !== 'read' || tool.annotations.readOnlyHint === false;
}

export function getTransportInputSchema(tool: ConfirmableTool): z.ZodRawShape {
  if (!toolRequiresConfirmation(tool)) return tool.inputSchema;
  return {
    ...tool.inputSchema,
    ...MCP_CONFIRMATION_CONTROL_FIELDS,
  };
}

export function resolveExternalToolCall(tool: ConfirmableTool, input: unknown): ExternalResolution {
  const normalizedArgs = stripConfirmationFields(input);
  if (!toolRequiresConfirmation(tool)) {
    return { kind: 'execute', input: normalizedArgs };
  }

  const rawInput = isPlainObject(input) ? input : {};
  const confirmed = rawInput.confirmed === true;
  const providedHash =
    typeof rawInput.confirmationHash === 'string' && rawInput.confirmationHash.trim()
      ? rawInput.confirmationHash.trim()
      : null;

  if (!confirmed) {
    return { kind: 'return', result: confirmationPreview(tool, normalizedArgs) };
  }

  if (!providedHash) {
    return {
      kind: 'return',
      result: confirmationError(
        `Tool ${tool.name} requires a confirmationHash from a prior preview call before it can execute.`,
      ),
    };
  }

  const expectedHash = confirmationHashFor(tool.name, normalizedArgs);
  if (providedHash !== expectedHash) {
    return {
      kind: 'return',
      result: confirmationError(
        `Tool ${tool.name} confirmationHash did not match the supplied arguments. Re-run the preview step and confirm the exact same arguments.`,
      ),
    };
  }

  return { kind: 'execute', input: normalizedArgs };
}
