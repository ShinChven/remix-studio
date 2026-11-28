import { z } from 'zod';
import type { AssistantToolDefinition } from '../mcp/tool-definitions';

/**
 * `update_steps` — lets the in-app assistant display and update a live
 * checklist of steps when carrying out a multi-step task.
 *
 * Unlike `ask_user`, this tool never pauses the turn and requires no user
 * confirmation: it immediately records the latest step list and emits a
 * `steps_updated` status event so the chat UI updates in place.
 *
 * Only the in-app coordinator offers it: external MCP clients have their own
 * progress UI, and swarm workers report through the swarm panel instead.
 */

export const UPDATE_STEPS_TOOL_NAME = 'update_steps';

export const UPDATE_STEPS_LIMITS = {
  MIN_STEPS: 2,
  MAX_STEPS: 12,
  MAX_TITLE_LENGTH: 120,
};

export const assistantStepStatusSchema = z.enum([
  'pending',
  'in_progress',
  'done',
  'skipped',
  'failed',
]);

export const assistantStepItemSchema = z.object({
  title: z.string().trim().min(1).max(UPDATE_STEPS_LIMITS.MAX_TITLE_LENGTH)
    .describe('Short imperative title of the step (2–8 words), in plain user-facing language.'),
  status: assistantStepStatusSchema.describe('Current status of the step.'),
});

export const updateStepsInputShape = {
  steps: z.array(assistantStepItemSchema)
    .min(UPDATE_STEPS_LIMITS.MIN_STEPS)
    .max(UPDATE_STEPS_LIMITS.MAX_STEPS)
    .describe('The full ordered list of steps (2 to 12 items). Each call replaces the previous list.'),
};

export type AssistantStepStatus = z.infer<typeof assistantStepStatusSchema>;
export type AssistantStepItem = z.infer<typeof assistantStepItemSchema>;
export type UpdateStepsInput = z.infer<z.ZodObject<typeof updateStepsInputShape>>;

export function createUpdateStepsTool(): AssistantToolDefinition<typeof updateStepsInputShape> {
  return {
    name: UPDATE_STEPS_TOOL_NAME,
    title: 'Update task steps',
    description:
      'Show or update a compact step tracker in the chat when carrying out a multi-step task (3 or more distinct steps). '
      + 'Skip this tool for simple 1–2 step tasks, quick lookups, pure Q&A, or single-tool requests — never invent filler steps. '
      + 'Always send the full ordered list; each call replaces the previous list. '
      + 'Call it alongside the first tool call of a step so it adds no extra turn: mark the active step "in_progress", '
      + 'update completed steps to "done" as you advance, and call it once more with every step "done" (or "failed"/"skipped") '
      + 'before your final reply. Keep titles short, imperative, and user-facing (no tool names, IDs, or step numbers).',
    inputSchema: updateStepsInputShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    requiresConfirmation: false,
    handler: async (_userId, args) => {
      const steps = args.steps.map((step) => ({
        title: step.title.trim(),
        status: step.status,
      }));
      return {
        text: JSON.stringify({ ok: true, steps }),
        structuredContent: { ok: true, steps },
      };
    },
  };
}
