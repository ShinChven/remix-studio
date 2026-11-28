import { z } from 'zod';
import type { AssistantToolDefinition } from '../mcp/tool-definitions';

/**
 * `ask_user` — the assistant asks the user one or more multiple-choice
 * questions and waits for the answers.
 *
 * The tool never runs a handler: the runner sees the call, pauses the turn
 * with the assistant message marked `awaiting_input`, and the chat shows the
 * questions above its composer. The user's answers come back as this call's
 * tool result when the turn resumes. Replying in the chat instead dismisses
 * the questions, and the model is told so.
 *
 * Only the in-app assistant offers it: an external MCP client has its own way
 * to ask, and a swarm worker has nobody watching to answer.
 */

export const ASK_USER_TOOL_NAME = 'ask_user';

export const ASK_USER_LIMITS = {
  MAX_QUESTIONS: 4,
  MIN_OPTIONS: 2,
  MAX_OPTIONS: 6,
  MAX_OTHER_LENGTH: 2000,
};

const optionSchema = z.object({
  label: z.string().trim().min(1).max(80).describe('What the user picks, in a few words.'),
  description: z.string().trim().max(240).optional().describe('One line on what picking this means.'),
});

export const askUserQuestionSchema = z.object({
  question: z.string().trim().min(1).max(400).describe('The full question, ending with a question mark.'),
  header: z.string().trim().max(24).optional().describe('A one- or two-word label for the question, shown as its tab.'),
  options: z.array(optionSchema)
    .min(ASK_USER_LIMITS.MIN_OPTIONS)
    .max(ASK_USER_LIMITS.MAX_OPTIONS)
    .describe('The choices. Put the one you recommend first. Do not add an "Other" choice: the user can always type their own answer.'),
  multiSelect: z.boolean().optional().describe('True when the user may pick more than one option.'),
});

export const askUserInputShape = {
  questions: z.array(askUserQuestionSchema)
    .min(1)
    .max(ASK_USER_LIMITS.MAX_QUESTIONS)
    .describe('One to four questions, asked together.'),
};

export type AskUserInput = z.infer<z.ZodObject<typeof askUserInputShape>>;
export type AskUserQuestion = z.infer<typeof askUserQuestionSchema>;

/** What the user sent back for one question. */
export interface AskUserAnswer {
  /** Labels of the options picked, in the order they were offered. */
  selected: string[];
  /** Free text typed into the "Other" field, when the user wrote one. */
  other?: string;
}

export const askUserAnswersSchema = z.array(z.object({
  selected: z.array(z.string().max(80)).max(ASK_USER_LIMITS.MAX_OPTIONS),
  other: z.string().trim().max(ASK_USER_LIMITS.MAX_OTHER_LENGTH).optional(),
})).max(ASK_USER_LIMITS.MAX_QUESTIONS);

export function createAskUserTool(): AssistantToolDefinition<typeof askUserInputShape> {
  return {
    name: ASK_USER_TOOL_NAME,
    title: 'Ask the user',
    description:
      'Ask the user one to four multiple-choice questions and wait for the answers. '
      + 'Use it only when you cannot go on without a decision that is the user\'s to make '
      + '(which of several resources, which of a few approaches, a preference with no sensible default). '
      + 'The chat shows the options above the message box; the user can pick one, several (multiSelect), '
      + 'or type their own answer, and the answers come back as this tool\'s result. '
      + 'Do not use it to ask permission for a change (changes are confirmed separately), '
      + 'for something you can look up with another tool, or for an open question better asked in plain text. '
      + 'Call it alone, as the last thing in your reply.',
    inputSchema: askUserInputShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    category: 'read',
    requiresConfirmation: false,
    handler: async () => ({
      text: JSON.stringify({ error: 'ask_user is answered by the user, not run as a tool.' }),
      isError: true,
    }),
  };
}

/**
 * The tool result the model reads once the user has answered. Each answer is
 * paired with its question so the model never has to match them up by index.
 */
export function buildAskUserResult(
  questions: AskUserQuestion[],
  answers: AskUserAnswer[],
): Record<string, unknown> {
  return {
    answered: true,
    answers: questions.map((q, index) => {
      const answer = answers[index] ?? { selected: [] };
      const offered = new Set(q.options.map((o) => o.label));
      const selected = q.options
        .map((o) => o.label)
        .filter((label) => answer.selected.includes(label) && offered.has(label));
      const other = answer.other?.trim();
      return {
        question: q.question,
        selected: q.multiSelect ? selected : selected.slice(0, 1),
        ...(other ? { other } : {}),
        ...(selected.length === 0 && !other ? { skipped: true } : {}),
      };
    }),
  };
}

export const ASK_USER_SKIPPED_RESULT = {
  answered: false,
  skipped: true,
  message: 'The user skipped these questions. Go on with your best judgement, and say which assumption you made.',
};

export const ASK_USER_DISMISSED_RESULT = {
  answered: false,
  dismissed: true,
  message: 'The user did not answer these questions and replied in the chat instead. Read their next message as the answer.',
};
