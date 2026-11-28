import type { AssistantSwarmPreset } from '../api';

export const DEFAULT_SWARM_PRESETS: AssistantSwarmPreset[] = [
  {
    id: 'builtin-prompt-shards',
    name: 'Prompt Batch Shards',
    description: 'Split a large prompt generation request across 3 parallel Prompt Engineers and 1 QA Reviewer.',
    goalTemplate: 'Generate a curated batch of prompts across distinct themes and review them for quality.',
    workers: [
      {
        name: 'prompt-shard-1',
        role: 'Prompt Engineer',
        brief: 'Draft the first third of the requested prompts with vivid visual detail and save them to the blackboard under "shard-1".',
        toolScope: 'propose',
      },
      {
        name: 'prompt-shard-2',
        role: 'Prompt Engineer',
        brief: 'Draft the second third of the requested prompts with distinct compositions/lighting and save them to the blackboard under "shard-2".',
        toolScope: 'propose',
      },
      {
        name: 'prompt-shard-3',
        role: 'Prompt Engineer',
        brief: 'Draft the final third of the requested prompts and save them to the blackboard under "shard-3".',
        toolScope: 'propose',
      },
      {
        name: 'qa-reviewer',
        role: 'Reviewer / QA',
        brief: 'Read all prompt shards from the blackboard, check for duplicates and constraint compliance, and summarize any fixes.',
        toolScope: 'read',
      },
    ],
  },
  {
    id: 'builtin-campaign-copy',
    name: 'Campaign Copy & QA',
    description: 'Inspect album outputs, draft platform-tailored X and Threads posts in parallel, and review tone.',
    goalTemplate: 'Draft platform-specific campaign posts based on our latest album outputs.',
    workers: [
      {
        name: 'album-scout',
        role: 'Media Researcher',
        brief: 'Inspect recent project albums and tags, then save the best media candidates and context to the blackboard under "media-picks".',
        toolScope: 'propose',
      },
      {
        name: 'copywriter-x',
        role: 'Copywriter (X)',
        brief: 'Draft punchy, high-engagement X/Twitter post copy options and save them to the blackboard under "copy-x".',
        toolScope: 'propose',
      },
      {
        name: 'copywriter-threads',
        role: 'Copywriter (Threads)',
        brief: 'Draft conversational Threads post copy options and save them to the blackboard under "copy-threads".',
        toolScope: 'propose',
      },
    ],
  },
  {
    id: 'builtin-project-audit',
    name: 'Workspace Audit Team',
    description: 'Audit libraries, project workflows, and queue health in parallel (read-only).',
    goalTemplate: 'Audit our workspace libraries, active projects, and queue status, and highlight issues or optimizations.',
    workers: [
      {
        name: 'library-auditor',
        role: 'Library Auditor',
        brief: 'Inspect text and media libraries, check naming/tagging consistency, and summarize findings.',
        toolScope: 'read',
      },
      {
        name: 'workflow-auditor',
        role: 'Workflow Builder',
        brief: 'Inspect active projects and their workflows, checking model configs and queue/failure counts.',
        toolScope: 'read',
      },
    ],
  },
];

export function formatSwarmPresetPrompt(preset: AssistantSwarmPreset): string {
  const workerLines = preset.workers
    .map((w) => `- **${w.name}** (${w.role}, scope: \`${w.toolScope}\`): ${w.brief}`)
    .join('\n');
  return `/agents Use the "${preset.name}" team.\n\nGoal: ${preset.goalTemplate || preset.description}\n\nSuggested agents:\n${workerLines}\n\nDetails: `;
}
