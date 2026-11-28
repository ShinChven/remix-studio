import { z } from 'zod';
import {
  AssistantRepository,
  type AssistantPendingConfirmationRecord,
  type AssistantSwarmAgentRecord,
  type AssistantSwarmAgentStatus,
  type AssistantSwarmRunRecord,
  type AssistantSwarmRunStatus,
  type AssistantSwarmToolScope,
} from '../db/assistant-repository';
import type { AssistantToolDefinition, ToolResult } from '../mcp/tool-definitions';
import type {
  AssistantRunner,
  AssistantStatusEvent,
  ScopedLoopOptions,
  SwarmCoordinatorToolProvider,
  TurnResult,
} from './assistant-runner';
import { buildSwarmWorkerSystemPrompt } from './system-prompt';

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const SWARM_ANNOTATIONS = {
  // Swarm orchestration & blackboard tools never mutate Remix Studio workspace
  // entities directly — workspace writes remain confirmation-gated separately.
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const SWARM_LIMITS = {
  MAX_CONCURRENT_WORKERS: 4,
  MAX_WORKERS_PER_RUN: 12,
  MAX_WORKER_ITERATIONS: 20,
  MAX_WORKER_TOOL_CALLS: 40,
  MAX_SWARM_WALL_CLOCK_MS: 10 * 60 * 1000,
};

/**
 * In-memory async mutex keyed by entity (`project:<id>`, `library:<id>`,
 * `post:<id>`, `campaign:<id>`). Serializes concurrent write mutations from
 * multiple swarm workers to the same entity — especially full-replacement
 * tools like `update_project` (`workflowItems`).
 */
class EntityMutexMap {
  private tails = new Map<string, Promise<void>>();

  async acquire(keys: string[]): Promise<() => void> {
    const unique = Array.from(new Set(keys)).sort();
    if (unique.length === 0) return () => {};

    const releases: Array<() => void> = [];
    for (const key of unique) {
      const prev = this.tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chained = prev.then(() => next);
      this.tails.set(key, chained);
      await prev;
      releases.push(() => {
        release();
        if (this.tails.get(key) === chained) {
          this.tails.delete(key);
        }
      });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (let i = releases.length - 1; i >= 0; i--) {
        releases[i]();
      }
    };
  }
}

/**
 * Extract entity lock keys from a write tool's arguments so concurrent workers
 * cannot race on the same workspace entity.
 */
export function extractEntityLockKeys(toolName: string, args: unknown): string[] {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
  const obj = args as Record<string, unknown>;
  const keys: string[] = [];
  const add = (prefix: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) keys.push(`${prefix}:${value.trim()}`);
  };
  add('project', obj.projectId);
  add('library', obj.library_id);
  add('library', obj.libraryId);
  add('campaign', obj.campaignId);
  add('post', obj.postId);
  if (keys.length === 0 && (toolName === 'create_library' || toolName === 'create_project_with_workflow' || toolName === 'create_campaign')) {
    // Creation of a brand-new entity has no existing ID to contend on.
    return [];
  }
  return keys;
}

/** Simple bounded concurrency semaphore for per-swarm worker execution. */
class ConcurrencyPool {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    if (signal?.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const idx = this.queue.indexOf(grant);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        };
        const grant = () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.queue.push(grant);
      });
    }
    this.running += 1;
    try {
      return await fn();
    } finally {
      this.running -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

interface WorkerRuntime {
  agent: AssistantSwarmAgentRecord;
  abortController: AbortController;
  promise: Promise<void> | null;
}

interface ActiveSwarmSession {
  swarmRunId: string;
  conversationId: string;
  userId: string;
  startedAt: number;
  pool: ConcurrencyPool;
  workers: Map<string, WorkerRuntime>;
  workersByName: Map<string, WorkerRuntime>;
}

function jsonResult(payload: unknown, isError = false): ToolResult {
  return {
    text: JSON.stringify(payload),
    structuredContent: typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { result: payload },
    ...(isError ? { isError: true } : {}),
  };
}

function summarizeWorkerResult(result: TurnResult): { status: AssistantSwarmAgentStatus; summary: string } {
  if (result.kind === 'final') {
    const raw = (result.finalMessage.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const summary = raw.length > 1200 ? `${raw.slice(0, 1197)}...` : (raw || 'Completed.');
    return { status: 'completed', summary };
  }
  if (result.kind === 'awaiting_confirmation') {
    return {
      status: 'awaiting_confirmation',
      summary: `Awaiting confirmation: ${result.confirmation.summary || result.confirmation.toolName}`,
    };
  }
  if (result.kind === 'stopped') {
    return { status: 'stopped', summary: 'Stopped at user request.' };
  }
  return { status: 'failed', summary: result.error || 'Worker failed.' };
}

export class SwarmOrchestrator implements SwarmCoordinatorToolProvider {
  private sessionsByConversation = new Map<string, ActiveSwarmSession>();
  private entityLocks = new EntityMutexMap();

  constructor(
    private repo: AssistantRepository,
    private runner: AssistantRunner,
  ) {}

  private acquireEntityLocks = (toolName: string, args: unknown): Promise<() => void> => {
    const keys = extractEntityLockKeys(toolName, args);
    return this.entityLocks.acquire(keys);
  };

  private createBlackboardTools(ctx: {
    swarmRunId: string;
    conversationId: string;
    authorAgentId?: string | null;
    authorName: string;
    allowWrite: boolean;
  }): AssistantToolDefinition[] {
    const readTool: AssistantToolDefinition = {
      name: 'read_blackboard',
      title: 'Read Blackboard',
      description: 'Read shared draft entries and artifacts written by the Coordinator or swarm workers for the current swarm run.',
      category: 'read',
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        key: z.string().optional().describe('Optional exact entry key to fetch. Omit to list all entries in this swarm run.'),
      },
      handler: async () => jsonResult({ entries: [] }),
    };
    readTool.handler = async (_userId, rawArgs) => {
      const args = (rawArgs ?? {}) as { key?: string };
      const entries = await this.repo.listBlackboardEntries(ctx.conversationId, ctx.swarmRunId);
      const filtered = args.key ? entries.filter((e) => e.key === args.key) : entries;
      return jsonResult({
        swarmRunId: ctx.swarmRunId,
        count: filtered.length,
        entries: filtered.map((e) => ({
          id: e.id,
          key: e.key,
          title: e.title,
          content: e.content,
          dataJson: e.dataJson,
          authorName: e.authorName,
          updatedAt: e.updatedAt,
        })),
      });
    };

    if (!ctx.allowWrite) return [readTool];

    const writeTool: AssistantToolDefinition = {
      name: 'write_blackboard',
      title: 'Write Blackboard',
      description: 'Save or update a shared draft or structured artifact on the swarm blackboard so the Coordinator and peer workers can read it.',
      category: 'read', // Never workspace-mutating; always allowed without confirmation.
      annotations: SWARM_ANNOTATIONS,
      inputSchema: {
        key: z.string().min(1).max(120).describe('Unique key for this entry within the swarm run (e.g. "prompts-batch-1", "campaign-outline").'),
        title: z.string().max(200).optional().describe('Short human-readable title.'),
        content: z.string().min(1).max(40000).describe('Markdown or plain text draft content.'),
        dataJson: z.unknown().optional().describe('Optional structured JSON payload.'),
      },
      handler: async (_userId, rawArgs) => {
        const args = rawArgs as { key: string; title?: string; content: string; dataJson?: unknown };
        const entry = await this.repo.upsertBlackboardEntry({
          swarmRunId: ctx.swarmRunId,
          conversationId: ctx.conversationId,
          key: args.key.trim(),
          title: args.title?.trim() || null,
          content: args.content,
          dataJson: args.dataJson,
          authorAgentId: ctx.authorAgentId ?? null,
          authorName: ctx.authorName,
        });
        return jsonResult({
          saved: true,
          entry: {
            id: entry.id,
            key: entry.key,
            title: entry.title,
            authorName: entry.authorName,
            updatedAt: entry.updatedAt,
          },
        });
      },
    };

    return [readTool, writeTool];
  }

  createCoordinatorTools(ctx: {
    userId: string;
    conversationId: string;
    defaultProviderId: string;
    defaultModelId: string;
    workerProviderId?: string | null;
    workerModelId?: string | null;
    abortSignal?: AbortSignal;
    onStatusEvent?: (event: AssistantStatusEvent) => void;
  }): AssistantToolDefinition[] {
    const emit = (event: AssistantStatusEvent) => {
      try { ctx.onStatusEvent?.(event); } catch { /* best-effort */ }
    };

    const getOrCreateSession = async (goal?: string): Promise<ActiveSwarmSession> => {
      const existing = this.sessionsByConversation.get(ctx.conversationId);
      if (existing) return existing;

      const runGoal = (goal || 'Multi-agent swarm task').trim().slice(0, 500);
      const run = await this.repo.createSwarmRun({
        conversationId: ctx.conversationId,
        goal: runGoal,
      });
      const session: ActiveSwarmSession = {
        swarmRunId: run.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        startedAt: Date.now(),
        pool: new ConcurrencyPool(SWARM_LIMITS.MAX_CONCURRENT_WORKERS),
        workers: new Map(),
        workersByName: new Map(),
      };
      this.sessionsByConversation.set(ctx.conversationId, session);
      emit({ type: 'swarm_started', swarmRunId: run.id, goal: run.goal });
      return session;
    };

    const launchWorker = (
      session: ActiveSwarmSession,
      runtime: WorkerRuntime,
      providerId: string,
      modelConfigId: string,
    ) => {
      const parentAbort = () => runtime.abortController.abort();
      if (ctx.abortSignal) {
        if (ctx.abortSignal.aborted) runtime.abortController.abort();
        else ctx.abortSignal.addEventListener('abort', parentAbort, { once: true });
      }

      const task = session.pool.run(runtime.abortController.signal, async () => {
        if (Date.now() - session.startedAt > SWARM_LIMITS.MAX_SWARM_WALL_CLOCK_MS) {
          runtime.agent = await this.repo.updateSwarmAgent(runtime.agent.id, {
            status: 'failed',
            summary: 'Swarm wall-clock time budget exceeded.',
          });
          emit({
            type: 'agent_completed',
            swarmRunId: session.swarmRunId,
            agentId: runtime.agent.id,
            agentName: runtime.agent.name,
            status: 'failed',
            summary: runtime.agent.summary,
          });
          return;
        }

        runtime.agent = await this.repo.updateSwarmAgent(runtime.agent.id, { status: 'running' });
        emit({
          type: 'agent_status_changed',
          swarmRunId: session.swarmRunId,
          agentId: runtime.agent.id,
          agentName: runtime.agent.name,
          status: 'running',
        });

        const loopOptions: ScopedLoopOptions = {
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          providerId,
          modelId: modelConfigId,
          abortSignal: runtime.abortController.signal,
          onStatusEvent: ctx.onStatusEvent,
          systemPromptOverride: buildSwarmWorkerSystemPrompt(runtime.agent.role, runtime.agent.toolScope),
          extraTools: this.createBlackboardTools({
            swarmRunId: session.swarmRunId,
            conversationId: ctx.conversationId,
            authorAgentId: runtime.agent.id,
            authorName: runtime.agent.name,
            allowWrite: runtime.agent.toolScope !== 'read',
          }),
          toolScope: runtime.agent.toolScope,
          swarmRunId: session.swarmRunId,
          swarmAgentId: runtime.agent.id,
          swarmAgentName: runtime.agent.name,
          entityLockAcquire: this.acquireEntityLocks,
          maxIterations: SWARM_LIMITS.MAX_WORKER_ITERATIONS,
          maxToolCalls: SWARM_LIMITS.MAX_WORKER_TOOL_CALLS,
          onTokenUsage: (inTok, outTok) => {
            runtime.agent.inputTokens += inTok;
            runtime.agent.outputTokens += outTok;
            void this.repo.addSwarmAgentTokens(runtime.agent.id, inTok, outTok).catch(() => {});
          },
        };

        const result = await this.runner.runScopedLoop(loopOptions);
        const { status, summary } = summarizeWorkerResult(result);
        runtime.agent = await this.repo.updateSwarmAgent(runtime.agent.id, { status, summary });
        emit({
          type: 'agent_completed',
          swarmRunId: session.swarmRunId,
          agentId: runtime.agent.id,
          agentName: runtime.agent.name,
          status,
          summary,
        });
      }).catch(async (err: any) => {
        const stopped = err?.name === 'AbortError' || runtime.abortController.signal.aborted;
        const status: AssistantSwarmAgentStatus = stopped ? 'stopped' : 'failed';
        const summary = stopped ? 'Stopped at user request.' : (err?.message || 'Worker failed');
        runtime.agent = await this.repo.updateSwarmAgent(runtime.agent.id, { status, summary });
        emit({
          type: 'agent_completed',
          swarmRunId: session.swarmRunId,
          agentId: runtime.agent.id,
          agentName: runtime.agent.name,
          status,
          summary,
        });
      }).finally(() => {
        ctx.abortSignal?.removeEventListener('abort', parentAbort);
      });

      runtime.promise = task;
    };

    const syncSwarmRunStatus = async (session: ActiveSwarmSession): Promise<AssistantSwarmRunStatus> => {
      const agents = Array.from(session.workers.values()).map((w) => w.agent);
      const anyRunning = agents.some((a) => a.status === 'queued' || a.status === 'running');
      const anyAwaiting = agents.some((a) => a.status === 'awaiting_confirmation');
      const anyFailed = agents.some((a) => a.status === 'failed');
      const allStopped = agents.length > 0 && agents.every((a) => a.status === 'stopped');

      let status: AssistantSwarmRunStatus;
      if (anyRunning) status = 'running';
      else if (anyAwaiting) status = 'awaiting_confirmation';
      else if (allStopped) status = 'stopped';
      else if (anyFailed && agents.every((a) => a.status === 'failed' || a.status === 'stopped')) status = 'failed';
      else status = 'completed';

      const completedAt = status === 'completed' || status === 'stopped' || status === 'failed' ? new Date() : null;
      await this.repo.updateSwarmRun(session.swarmRunId, { status, completedAt });
      if (completedAt) {
        emit({ type: 'swarm_completed', swarmRunId: session.swarmRunId, status });
        if (this.sessionsByConversation.get(ctx.conversationId) === session) {
          this.sessionsByConversation.delete(ctx.conversationId);
        }
      }
      return status;
    };

    const formatRosterPayload = async (session: ActiveSwarmSession) => {
      const pendingConfirmations = await this.repo.listActivePendingConfirmations(ctx.conversationId);
      const workerConfirmations = pendingConfirmations.filter((c) => c.swarmAgentId !== null);
      const blackboard = await this.repo.listBlackboardEntries(ctx.conversationId, session.swarmRunId);
      return {
        swarmRunId: session.swarmRunId,
        workers: Array.from(session.workers.values()).map(({ agent }) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          toolScope: agent.toolScope,
          status: agent.status,
          summary: agent.summary,
          inputTokens: agent.inputTokens,
          outputTokens: agent.outputTokens,
        })),
        pendingConfirmations: workerConfirmations.map((c) => ({
          id: c.id,
          agentId: c.swarmAgentId,
          agentName: c.swarmAgentName,
          toolName: c.toolName,
          summary: c.summary,
        })),
        blackboardKeys: blackboard.map((b) => ({ key: b.key, title: b.title, authorName: b.authorName })),
      };
    };

    const spawnWorkersTool: AssistantToolDefinition = {
      name: 'spawn_workers',
      title: 'Spawn Swarm Workers',
      description: 'Spawn 1 to 12 specialist worker agents in parallel to execute independent shards or role-specialized tasks. By default waits for all spawned workers to settle and returns their handoff summaries.',
      category: 'read',
      annotations: SWARM_ANNOTATIONS,
      inputSchema: {
        goal: z.string().min(1).max(500).optional().describe('High-level goal of this swarm run.'),
        wait: z.boolean().optional().describe('Whether to wait for the spawned workers to finish before returning (default: true).'),
        workers: z.array(
          z.object({
            name: z.string().min(1).max(48).describe('Short unique worker name, e.g. "prompt-writer-1" or "qa-reviewer".'),
            role: z.string().min(1).max(80).describe('Role title, e.g. "Prompt Engineer", "Copywriter", "Workflow Builder", "Reviewer".'),
            brief: z.string().min(1).max(16000).describe('Self-contained task instructions, IDs, constraints, and expected output format.'),
            toolScope: z.enum(['read', 'propose', 'write']).optional().describe('Capability scope (default: "propose").'),
            providerId: z.string().optional().describe('Optional provider ID override.'),
            modelConfigId: z.string().optional().describe('Optional model config ID override.'),
          }),
        ).min(1).max(SWARM_LIMITS.MAX_WORKERS_PER_RUN),
      },
      handler: async (_userId, rawArgs) => {
        const args = rawArgs as {
          goal?: string;
          wait?: boolean;
          workers: Array<{
            name: string;
            role: string;
            brief: string;
            toolScope?: AssistantSwarmToolScope;
            providerId?: string;
            modelConfigId?: string;
          }>;
        };

        const session = await getOrCreateSession(args.goal);
        if (session.workers.size + args.workers.length > SWARM_LIMITS.MAX_WORKERS_PER_RUN) {
          return jsonResult(
            { error: `Swarm worker limit (${SWARM_LIMITS.MAX_WORKERS_PER_RUN}) exceeded.` },
            true,
          );
        }

        const spawned: WorkerRuntime[] = [];
        for (const spec of args.workers) {
          const baseName = spec.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'worker';
          let uniqueName = baseName;
          let suffix = 2;
          while (session.workersByName.has(uniqueName)) {
            uniqueName = `${baseName}-${suffix++}`;
          }

          const providerId = spec.providerId || ctx.workerProviderId || ctx.defaultProviderId;
          const modelConfigId = spec.modelConfigId || ctx.workerModelId || ctx.defaultModelId;
          const toolScope: AssistantSwarmToolScope = spec.toolScope ?? 'propose';

          const agent = await this.repo.createSwarmAgent({
            swarmRunId: session.swarmRunId,
            name: uniqueName,
            role: spec.role.trim(),
            brief: spec.brief.trim(),
            providerId,
            modelConfigId,
            toolScope,
            status: 'queued',
          });

          // Seed the worker's isolated transcript with its assignment brief.
          await this.repo.appendMessage({
            conversationId: ctx.conversationId,
            swarmAgentId: agent.id,
            role: 'user',
            content: spec.brief.trim(),
          });

          const runtime: WorkerRuntime = {
            agent,
            abortController: new AbortController(),
            promise: null,
          };
          session.workers.set(agent.id, runtime);
          session.workersByName.set(agent.name, runtime);
          spawned.push(runtime);

          emit({
            type: 'agent_spawned',
            swarmRunId: session.swarmRunId,
            agentId: agent.id,
            agentName: agent.name,
            role: agent.role,
            toolScope: agent.toolScope,
            modelConfigId: agent.modelConfigId,
          });

          launchWorker(session, runtime, providerId, modelConfigId);
        }

        const shouldWait = args.wait !== false;
        if (shouldWait) {
          await Promise.allSettled(spawned.map((w) => w.promise).filter(Boolean));
          const runStatus = await syncSwarmRunStatus(session);
          return jsonResult({
            status: runStatus,
            ...(await formatRosterPayload(session)),
          });
        }

        return jsonResult({
          status: 'running',
          spawned: spawned.map((w) => ({ id: w.agent.id, name: w.agent.name, role: w.agent.role })),
          swarmRunId: session.swarmRunId,
        });
      },
    };

    const waitForWorkersTool: AssistantToolDefinition = {
      name: 'wait_for_workers',
      title: 'Wait for Swarm Workers',
      description: 'Wait for running workers in the current swarm run to finish (or pause for confirmation) and return their summaries.',
      category: 'read',
      annotations: READ_ANNOTATIONS,
      inputSchema: {
        workerNames: z.array(z.string()).optional().describe('Optional list of specific worker names to wait for. Omit to wait for all active workers.'),
      },
      handler: async (_userId, rawArgs) => {
        const session = this.sessionsByConversation.get(ctx.conversationId);
        if (!session) return jsonResult({ error: 'No active swarm run in this conversation.' }, true);
        const args = (rawArgs ?? {}) as { workerNames?: string[] };
        const targets = args.workerNames && args.workerNames.length > 0
          ? args.workerNames.map((n) => session.workersByName.get(n)).filter((w): w is WorkerRuntime => Boolean(w))
          : Array.from(session.workers.values());
        await Promise.allSettled(targets.map((w) => w.promise).filter(Boolean));
        const runStatus = await syncSwarmRunStatus(session);
        return jsonResult({
          status: runStatus,
          ...(await formatRosterPayload(session)),
        });
      },
    };

    const getSwarmStatusTool: AssistantToolDefinition = {
      name: 'get_swarm_status',
      title: 'Get Swarm Status',
      description: 'Inspect the current swarm roster, worker statuses, token usage, blackboard keys, and pending confirmations.',
      category: 'read',
      annotations: READ_ANNOTATIONS,
      inputSchema: {},
      handler: async () => {
        const session = this.sessionsByConversation.get(ctx.conversationId);
        if (session) {
          return jsonResult(await formatRosterPayload(session));
        }
        const runs = await this.repo.listSwarmRuns(ctx.conversationId, 1);
        const latest = runs[0];
        if (!latest) return jsonResult({ swarmRunId: null, workers: [], pendingConfirmations: [], blackboardKeys: [] });
        return jsonResult({
          swarmRunId: latest.id,
          status: latest.status,
          workers: latest.agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            toolScope: a.toolScope,
            status: a.status,
            summary: a.summary,
            inputTokens: a.inputTokens,
            outputTokens: a.outputTokens,
          })),
          blackboardKeys: latest.blackboardEntries.map((b) => ({
            key: b.key,
            title: b.title,
            authorName: b.authorName,
          })),
        });
      },
    };

    const messageWorkerTool: AssistantToolDefinition = {
      name: 'message_worker',
      title: 'Message Swarm Worker',
      description: 'Send follow-up instructions to an existing worker in the current swarm run and resume it.',
      category: 'read',
      annotations: SWARM_ANNOTATIONS,
      inputSchema: {
        workerName: z.string().min(1).describe('Name of the worker to message.'),
        message: z.string().min(1).max(16000).describe('Follow-up instruction for the worker.'),
        wait: z.boolean().optional().describe('Whether to wait for the worker to finish (default: true).'),
      },
      handler: async (_userId, rawArgs) => {
        const args = rawArgs as { workerName: string; message: string; wait?: boolean };
        const session = this.sessionsByConversation.get(ctx.conversationId);
        if (!session) return jsonResult({ error: 'No active swarm run in this conversation.' }, true);
        const runtime = session.workersByName.get(args.workerName);
        if (!runtime) return jsonResult({ error: `Worker '${args.workerName}' not found.` }, true);
        if (runtime.agent.status === 'running' || runtime.agent.status === 'queued') {
          return jsonResult({ error: `Worker '${args.workerName}' is still running.` }, true);
        }

        await this.repo.appendMessage({
          conversationId: ctx.conversationId,
          swarmAgentId: runtime.agent.id,
          role: 'user',
          content: args.message.trim(),
        });

        runtime.abortController = new AbortController();
        const providerId = runtime.agent.providerId || ctx.workerProviderId || ctx.defaultProviderId;
        const modelConfigId = runtime.agent.modelConfigId || ctx.workerModelId || ctx.defaultModelId;
        launchWorker(session, runtime, providerId, modelConfigId);

        if (args.wait !== false && runtime.promise) {
          await runtime.promise;
          const runStatus = await syncSwarmRunStatus(session);
          return jsonResult({
            status: runStatus,
            worker: {
              id: runtime.agent.id,
              name: runtime.agent.name,
              status: runtime.agent.status,
              summary: runtime.agent.summary,
            },
          });
        }
        return jsonResult({ sent: true, workerName: runtime.agent.name, status: 'running' });
      },
    };

    const stopWorkerTool: AssistantToolDefinition = {
      name: 'stop_worker',
      title: 'Stop Swarm Worker',
      description: 'Cancel a specific running worker in the current swarm run.',
      category: 'read',
      annotations: SWARM_ANNOTATIONS,
      inputSchema: {
        workerName: z.string().min(1).describe('Name of the worker to stop.'),
      },
      handler: async (_userId, rawArgs) => {
        const args = rawArgs as { workerName: string };
        const session = this.sessionsByConversation.get(ctx.conversationId);
        const runtime = session?.workersByName.get(args.workerName);
        if (!runtime) return jsonResult({ error: `Worker '${args.workerName}' not found.` }, true);
        runtime.abortController.abort();
        return jsonResult({ stopping: true, workerName: runtime.agent.name });
      },
    };

    // Blackboard tools for the Coordinator (attach to active session or latest swarm run).
    const coordBlackboardTools: AssistantToolDefinition[] = [
      {
        name: 'read_blackboard',
        title: 'Read Blackboard',
        description: 'Read shared draft entries and artifacts from the swarm blackboard.',
        category: 'read',
        annotations: READ_ANNOTATIONS,
        inputSchema: {
          key: z.string().optional().describe('Optional exact entry key to fetch.'),
        },
        handler: async (_userId, rawArgs) => {
          const args = (rawArgs ?? {}) as { key?: string };
          const session = this.sessionsByConversation.get(ctx.conversationId);
          const entries = await this.repo.listBlackboardEntries(ctx.conversationId, session?.swarmRunId);
          const filtered = args.key ? entries.filter((e) => e.key === args.key) : entries;
          return jsonResult({
            count: filtered.length,
            entries: filtered.map((e) => ({
              id: e.id,
              swarmRunId: e.swarmRunId,
              key: e.key,
              title: e.title,
              content: e.content,
              dataJson: e.dataJson,
              authorName: e.authorName,
              updatedAt: e.updatedAt,
            })),
          });
        },
      },
      {
        name: 'write_blackboard',
        title: 'Write Blackboard',
        description: 'Save or update a shared draft or structured artifact on the swarm blackboard.',
        category: 'read',
        annotations: SWARM_ANNOTATIONS,
        inputSchema: {
          key: z.string().min(1).max(120),
          title: z.string().max(200).optional(),
          content: z.string().min(1).max(40000),
          dataJson: z.unknown().optional(),
        },
        handler: async (_userId, rawArgs) => {
          const args = rawArgs as { key: string; title?: string; content: string; dataJson?: unknown };
          const session = await getOrCreateSession('Shared blackboard');
          const entry = await this.repo.upsertBlackboardEntry({
            swarmRunId: session.swarmRunId,
            conversationId: ctx.conversationId,
            key: args.key.trim(),
            title: args.title?.trim() || null,
            content: args.content,
            dataJson: args.dataJson,
            authorAgentId: null,
            authorName: 'Coordinator',
          });
          return jsonResult({ saved: true, key: entry.key, id: entry.id });
        },
      },
    ];

    return [
      spawnWorkersTool,
      waitForWorkersTool,
      getSwarmStatusTool,
      messageWorkerTool,
      stopWorkerTool,
      ...coordBlackboardTools,
    ];
  }

  /** Stop a specific worker by agentId (invoked from the Agent Side Panel UI). */
  stopWorkerById(conversationId: string, agentId: string): boolean {
    const session = this.sessionsByConversation.get(conversationId);
    const runtime = session?.workers.get(agentId);
    if (!runtime) return false;
    runtime.abortController.abort();
    return true;
  }

  /**
   * Phase 2: Resolve a single or batch of pending confirmations (including
   * worker-scoped confirmations) under per-entity write locks, resuming each
   * paused worker and updating the swarm run status.
   */
  async resolveConfirmations(input: {
    userId: string;
    conversationId: string;
    confirmationIds: string[];
    decision: 'confirm' | 'confirm_tool' | 'cancel';
    abortSignal?: AbortSignal;
    onStatusEvent?: (event: AssistantStatusEvent) => void;
  }): Promise<{
    resolved: Array<{ confirmationId: string; agentId: string | null; status: string; summary?: string }>;
  }> {
    const conversation = await this.repo.getConversation(input.userId, input.conversationId);
    if (!conversation) throw new Error('Conversation not found');

    const emit = (event: AssistantStatusEvent) => {
      try { input.onStatusEvent?.(event); } catch { /* best-effort */ }
    };

    const resolved: Array<{ confirmationId: string; agentId: string | null; status: string; summary?: string }> = [];

    // Load all requested confirmations and validate ownership.
    const confirmations: AssistantPendingConfirmationRecord[] = [];
    for (const id of input.confirmationIds) {
      const conf = await this.repo.getPendingConfirmation(id);
      if (conf && conf.conversationId === input.conversationId && conf.status === 'pending') {
        confirmations.push(conf);
      }
    }

    // Run worker confirmations concurrently (entity locks serialize overlapping writes).
    await Promise.all(confirmations.map(async (conf) => {
      if (!conf.swarmAgentId) {
        // Coordinator confirmation — delegate to standard runner path.
        const result = await this.runner.resumeAfterConfirmation({
          userId: input.userId,
          conversationId: input.conversationId,
          confirmationId: conf.id,
          decision: input.decision,
          abortSignal: input.abortSignal,
          onStatusEvent: input.onStatusEvent,
        });
        resolved.push({
          confirmationId: conf.id,
          agentId: null,
          status: result.kind,
        });
        return;
      }

      const agent = await this.repo.getSwarmAgent(conf.swarmAgentId);
      if (!agent) return;

      const providerId = agent.providerId || conversation.providerId;
      const modelId = agent.modelConfigId || conversation.modelConfigId;
      if (!providerId || !modelId) return;

      await this.repo.updateSwarmAgent(agent.id, { status: 'running' });
      emit({
        type: 'agent_status_changed',
        swarmRunId: agent.swarmRunId,
        agentId: agent.id,
        agentName: agent.name,
        status: 'running',
      });

      const loopOptions: ScopedLoopOptions = {
        userId: input.userId,
        conversationId: input.conversationId,
        providerId,
        modelId,
        abortSignal: input.abortSignal,
        onStatusEvent: input.onStatusEvent,
        systemPromptOverride: buildSwarmWorkerSystemPrompt(agent.role, agent.toolScope),
        extraTools: this.createBlackboardTools({
          swarmRunId: agent.swarmRunId,
          conversationId: input.conversationId,
          authorAgentId: agent.id,
          authorName: agent.name,
          allowWrite: agent.toolScope !== 'read',
        }),
        toolScope: agent.toolScope,
        swarmRunId: agent.swarmRunId,
        swarmAgentId: agent.id,
        swarmAgentName: agent.name,
        entityLockAcquire: this.acquireEntityLocks,
        maxIterations: SWARM_LIMITS.MAX_WORKER_ITERATIONS,
        maxToolCalls: SWARM_LIMITS.MAX_WORKER_TOOL_CALLS,
        onTokenUsage: (inTok, outTok) => {
          void this.repo.addSwarmAgentTokens(agent.id, inTok, outTok).catch(() => {});
        },
      };

      const result = await this.runner.resumeWorkerConfirmation({
        userId: input.userId,
        conversationId: input.conversationId,
        confirmation: conf,
        decision: input.decision,
        loopOptions,
      });

      const { status, summary } = summarizeWorkerResult(result);
      await this.repo.updateSwarmAgent(agent.id, { status, summary });
      emit({
        type: 'agent_completed',
        swarmRunId: agent.swarmRunId,
        agentId: agent.id,
        agentName: agent.name,
        status,
        summary,
      });

      // Refresh parent swarm run status.
      const run = await this.repo.getSwarmRun(agent.swarmRunId);
      if (run) {
        const anyRunning = run.agents.some((a) => a.status === 'queued' || a.status === 'running');
        const anyAwaiting = run.agents.some((a) => a.status === 'awaiting_confirmation');
        const nextStatus: AssistantSwarmRunStatus = anyRunning
          ? 'running'
          : anyAwaiting
            ? 'awaiting_confirmation'
            : 'completed';
        await this.repo.updateSwarmRun(run.id, {
          status: nextStatus,
          completedAt: nextStatus === 'completed' ? new Date() : null,
        });
        if (nextStatus === 'completed') {
          emit({ type: 'swarm_completed', swarmRunId: run.id, status: nextStatus });
        }
      }

      resolved.push({
        confirmationId: conf.id,
        agentId: agent.id,
        status,
        summary,
      });
    }));

    return { resolved };
  }
}
