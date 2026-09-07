import { Hono } from 'hono';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { AssistantRepository } from '../db/assistant-repository';
import { AssistantRunner, AssistantStatusEvent, TurnResult } from '../assistant/assistant-runner';
import { ProviderRepository } from '../db/provider-repository';
import { ASSISTANT_SUPPORTED_PROVIDER_TYPES } from '../assistant/chat-provider-factory';
import { AssistantTurnHub, TurnAlreadyRunningError, TurnKind } from '../assistant/assistant-turn-hub';
import { transcribeAudioWithGemini } from '../assistant/providers/google';

type Variables = { user: JwtPayload };

function turnResultToJson(result: TurnResult, statusEvents: AssistantStatusEvent[]) {
  if (result.kind === 'final') {
    return {
      kind: 'final' as const,
      message: result.finalMessage,
      statusEvents,
    };
  }
  if (result.kind === 'awaiting_confirmation') {
    return {
      kind: 'awaiting_confirmation' as const,
      message: result.assistantMessage,
      confirmation: result.confirmation,
      statusEvents,
    };
  }
  return {
    kind: 'error' as const,
    error: result.error,
    message: result.partialMessage ?? null,
    statusEvents,
  };
}

export function createAssistantRouter(
  repo: AssistantRepository,
  runner: AssistantRunner,
  providerRepo: ProviderRepository,
) {
  const router = new Hono<{ Variables: Variables }>();

  /**
   * Turns run detached from the request that started them, so a refresh or a
   * dropped connection never abandons an agentic loop mid-flight. Requests
   * only subscribe to the frames a turn produces.
   */
  const turnHub = new AssistantTurnHub();

  /** Parse `?since=` — the last frame sequence number a client already has. */
  function parseSince(raw: string | undefined): number {
    const value = Number(raw ?? '0');
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  /**
   * Stream a conversation's turn frames as NDJSON, replaying whatever the
   * client missed since `sinceSeq` and then following the turn to its result.
   * Writing `idle` rather than an empty body tells a reconnecting client the
   * turn is over and it should just reload the transcript.
   */
  function streamTurnFrames(c: Context, conversationId: string, sinceSeq: number) {
    c.header('Content-Type', 'application/x-ndjson');
    c.header('Transfer-Encoding', 'chunked');

    return stream(c, async (s) => {
      let wroteAny = false;
      const write = (frame: unknown) => {
        if (s.aborted || s.closed) return;
        // Hono swallows write failures; a client that went away mid-turn just
        // stops receiving frames, and the turn itself carries on regardless.
        void s.write(JSON.stringify(frame) + '\n');
        wroteAny = true;
      };

      const attached = turnHub.attach(conversationId, sinceSeq, write);
      if (!attached) {
        write({ type: 'idle' });
        return;
      }
      // Whichever comes first: the turn finishes, or the client hangs up. The
      // turn is never waited on beyond the connection that is watching it.
      let releaseOnAbort: () => void = () => {};
      const aborted = new Promise<void>((resolve) => { releaseOnAbort = resolve; });
      s.onAbort(() => {
        attached.unsubscribe();
        releaseOnAbort();
      });
      try {
        await Promise.race([attached.waitForFinish(), aborted]);
      } finally {
        attached.unsubscribe();
        releaseOnAbort();
      }
      if (!wroteAny && !s.aborted) write({ type: 'idle' });
    });
  }

  /**
   * Start a detached turn and stream it. A conversation already running one
   * answers 409 with its live state so the client attaches instead of racing.
   */
  async function startTurn(
    c: Context,
    input: {
      userId: string;
      conversationId: string;
      kind: TurnKind;
      logLabel: string;
      fallbackError: string;
      run: (onStatusEvent: (event: AssistantStatusEvent) => void) => Promise<TurnResult>;
    },
  ) {
    // Ownership is checked before the turn is registered: the hub's slot is
    // keyed by conversation, so an unauthorized caller must not be able to
    // occupy someone else's.
    const conversation = await repo.getConversation(input.userId, input.conversationId);
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

    try {
      turnHub.start({
        userId: input.userId,
        conversationId: input.conversationId,
        kind: input.kind,
        execute: async (emit) => {
          try {
            const result = await input.run(emit);
            return { type: 'result', ...turnResultToJson(result, []) };
          } catch (e: any) {
            console.error(input.logLabel, e);
            const message = e?.message?.includes('concurrent') ? e.message : input.fallbackError;
            return { type: 'error', error: message };
          }
        },
      });
    } catch (e) {
      if (e instanceof TurnAlreadyRunningError) {
        return c.json(
          {
            error: 'A turn is already running in this conversation',
            activeTurn: turnHub.getActive(input.conversationId),
          },
          409,
        );
      }
      throw e;
    }
    return streamTurnFrames(c, input.conversationId, 0);
  }

  // ─── List conversations ───
  router.get('/api/assistant/conversations', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const cursor = c.req.query('cursor') || undefined;
      const limit = Math.min(Math.max(Number(c.req.query('limit') || '50'), 1), 200);
      const includeArchived = c.req.query('includeArchived') === 'true';
      const conversations = await repo.listConversations(user.userId, { cursor, limit, includeArchived });
      return c.json({ conversations });
    } catch (e) {
      console.error('[GET /api/assistant/conversations]', e);
      return c.json({ error: 'Failed to list conversations' }, 500);
    }
  });

  // ─── Search conversation history (offset-paginated, content-aware) ───
  router.get('/api/assistant/history', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const query = c.req.query('q') || undefined;
      const page = Math.max(Number(c.req.query('page') || '1'), 1);
      const pageSize = Math.min(Math.max(Number(c.req.query('pageSize') || '20'), 1), 100);
      const includeArchived = c.req.query('includeArchived') === 'true';
      const result = await repo.searchConversations(user.userId, { query, page, pageSize, includeArchived });
      return c.json(result);
    } catch (e) {
      console.error('[GET /api/assistant/history]', e);
      return c.json({ error: 'Failed to search conversations' }, 500);
    }
  });

  // ─── Create conversation ───
  router.post('/api/assistant/conversations', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const title = typeof body?.title === 'string' ? body.title.trim() || undefined : undefined;
      const providerId = typeof body?.providerId === 'string' ? body.providerId : undefined;
      const modelConfigId = typeof body?.modelConfigId === 'string' ? body.modelConfigId : undefined;
      const conversation = await repo.createConversation({
        userId: user.userId,
        title,
        providerId,
        modelConfigId,
      });
      return c.json({ conversation }, 201);
    } catch (e) {
      console.error('[POST /api/assistant/conversations]', e);
      return c.json({ error: 'Failed to create conversation' }, 500);
    }
  });

  // ─── Get conversation + messages ───
  router.get('/api/assistant/conversations/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const conversation = await repo.getConversation(user.userId, conversationId);
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
      const [messages, resources, pendingConfirmation] = await Promise.all([
        repo.listMessages(conversationId),
        repo.listConversationResources(conversationId),
        repo.findActivePendingConfirmation(conversationId),
      ]);
      // `activeTurn` and `pendingConfirmation` are what a reloaded tab needs to
      // pick a conversation back up: one says a loop is still running and where
      // to resume its event stream, the other restores the confirm/cancel card.
      return c.json({
        conversation,
        messages,
        resources,
        pendingConfirmation,
        activeTurn: turnHub.getActive(conversationId),
      });
    } catch (e) {
      console.error('[GET /api/assistant/conversations/:id]', e);
      return c.json({ error: 'Failed to get conversation' }, 500);
    }
  });

  // ─── Update conversation ───
  router.patch('/api/assistant/conversations/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const body = await c.req.json();
      const updates: {
        title?: string;
        providerId?: string | null;
        modelConfigId?: string | null;
        archived?: boolean;
      } = {};
      if (typeof body?.title === 'string') updates.title = body.title.trim();
      if (body?.providerId !== undefined) updates.providerId = body.providerId;
      if (body?.modelConfigId !== undefined) updates.modelConfigId = body.modelConfigId;
      if (typeof body?.archived === 'boolean') updates.archived = body.archived;
      const conversation = await repo.updateConversation(user.userId, conversationId, updates);
      return c.json({ conversation });
    } catch (e: any) {
      if (e?.message === 'Conversation not found') return c.json({ error: 'Conversation not found' }, 404);
      console.error('[PATCH /api/assistant/conversations/:id]', e);
      return c.json({ error: 'Failed to update conversation' }, 500);
    }
  });

  // ─── Summarize conversation title ───
  router.post('/api/assistant/conversations/:id/summarize', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const title = await runner.summarizeConversation(user.userId, conversationId);
      if (!title) return c.json({ error: 'Summarization failed' }, 500);
      return c.json({ title });
    } catch (e: any) {
      if (e?.message === 'Conversation not found') return c.json({ error: 'Conversation not found' }, 404);
      console.error('[POST /api/assistant/conversations/:id/summarize]', e);
      return c.json({ error: 'Failed to summarize conversation' }, 500);
    }
  });

  // ─── Delete conversation ───

  router.delete('/api/assistant/conversations/:id', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      await repo.deleteConversation(user.userId, conversationId);
      runner.clearConversationSessionApproval(conversationId);
      turnHub.discard(conversationId);
      return c.json({ success: true });
    } catch (e: any) {
      if (e?.message === 'Conversation not found') return c.json({ error: 'Conversation not found' }, 404);
      console.error('[DELETE /api/assistant/conversations/:id]', e);
      return c.json({ error: 'Failed to delete conversation' }, 500);
    }
  });

  // ─── Send message ───
  router.post('/api/assistant/conversations/:id/messages', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const conversationId = c.req.param('id');
    const body = await c.req.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) return c.json({ error: 'Message content is required' }, 400);

    return await startTurn(c, {
      userId: user.userId,
      conversationId,
      kind: 'message',
      logLabel: '[POST /api/assistant/conversations/:id/messages]',
      fallbackError: 'Failed to process message',
      run: (onStatusEvent) => runner.sendUserMessage({
        userId: user.userId,
        conversationId,
        content,
        onStatusEvent,
      }),
    });
  });

  // ─── Edit user message and resume ───
  router.post('/api/assistant/conversations/:id/messages/:messageId/edit', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const conversationId = c.req.param('id');
    const messageId = c.req.param('messageId');
    const body = await c.req.json();
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!content) return c.json({ error: 'Message content is required' }, 400);

    return await startTurn(c, {
      userId: user.userId,
      conversationId,
      kind: 'edit',
      logLabel: '[POST /api/assistant/conversations/:id/messages/:messageId/edit]',
      fallbackError: 'Failed to process message edit',
      run: async (onStatusEvent) => {
        await repo.deleteMessagesFrom(conversationId, messageId);
        return runner.sendUserMessage({
          userId: user.userId,
          conversationId,
          content,
          onStatusEvent,
        });
      },
    });
  });

  // ─── Confirm / cancel pending tool ───
  router.post('/api/assistant/conversations/:id/confirm', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const conversationId = c.req.param('id');
    const body = await c.req.json();
    const confirmationId = typeof body?.confirmationId === 'string' ? body.confirmationId : '';
    const decision = body?.decision === 'cancel'
      ? 'cancel' as const
      : body?.decision === 'confirm_tool'
        ? 'confirm_tool' as const
      : body?.decision === 'confirm_session'
        ? 'confirm_tool' as const
        : 'confirm' as const;
    if (!confirmationId) return c.json({ error: 'confirmationId is required' }, 400);

    return await startTurn(c, {
      userId: user.userId,
      conversationId,
      kind: 'confirm',
      logLabel: '[POST /api/assistant/conversations/:id/confirm]',
      fallbackError: 'Failed to process confirmation',
      run: (onStatusEvent) => runner.resumeAfterConfirmation({
        userId: user.userId,
        conversationId,
        confirmationId,
        decision,
        onStatusEvent,
      }),
    });
  });

  // ─── Reattach to an in-flight turn ───
  // A reloaded page (or one whose connection dropped) resumes the running turn
  // here: everything after `since` is replayed, then the stream follows the
  // turn live to its result. `{"type":"idle"}` means there is nothing running.
  router.get('/api/assistant/conversations/:id/turn', authMiddleware, async (c) => {
    const user = c.get('user') as JwtPayload;
    const conversationId = c.req.param('id');
    const conversation = await repo.getConversation(user.userId, conversationId);
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
    return streamTurnFrames(c, conversationId, parseSince(c.req.query('since')));
  });

  // ─── Transcribe recorded audio to text (Gemini Flash Lite) ───
  router.post('/api/assistant/transcribe-audio', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const body = await c.req.json();
      const providerId = typeof body?.providerId === 'string' ? body.providerId : '';
      const audioBase64 = typeof body?.audioBase64 === 'string' ? body.audioBase64 : '';
      const mimeType = typeof body?.mimeType === 'string' && body.mimeType ? body.mimeType : 'audio/webm';

      if (!providerId || !audioBase64) {
        return c.json({ error: 'providerId and audioBase64 are required' }, 400);
      }

      const record = await providerRepo.getProvider(user.userId, providerId);
      if (!record) return c.json({ error: 'Provider not found' }, 404);
      if (record.type !== 'GoogleAI') {
        return c.json({ error: 'Audio transcription requires a Google AI provider' }, 400);
      }

      const apiKey = await providerRepo.getDecryptedApiKey(user.userId, providerId);
      if (!apiKey) return c.json({ error: 'Provider is missing an API key' }, 400);

      const text = await transcribeAudioWithGemini(apiKey, record.apiUrl, audioBase64, mimeType);
      return c.json({ text });
    } catch (e: any) {
      console.error('[POST /api/assistant/transcribe-audio]', e);
      return c.json({ error: e?.message || 'Failed to transcribe audio' }, 500);
    }
  });

  // ─── List assistant-capable providers ───
  router.get('/api/assistant/providers', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const allProviders = await providerRepo.listProviders(user.userId);
      const capable = allProviders.filter((p) =>
        ASSISTANT_SUPPORTED_PROVIDER_TYPES.includes(p.type as any),
      );
      return c.json({ providers: capable });
    } catch (e) {
      console.error('[GET /api/assistant/providers]', e);
      return c.json({ error: 'Failed to list assistant providers' }, 500);
    }
  });

  // ─── List assistant tools ───
  router.get('/api/assistant/tools', authMiddleware, async (c) => {
    try {
      return c.json({ tools: runner.listToolMetadata() });
    } catch (e) {
      console.error('[GET /api/assistant/tools]', e);
      return c.json({ error: 'Failed to list assistant tools' }, 500);
    }
  });

  // ─── Per-conversation tool approval preferences ───
  router.get('/api/assistant/conversations/:id/approved-tools', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const tools = await runner.getApprovedTools(user.userId, conversationId);
      return c.json({ tools });
    } catch (e: any) {
      if (e?.message === 'Conversation not found') return c.json({ error: 'Conversation not found' }, 404);
      console.error('[GET /api/assistant/conversations/:id/approved-tools]', e);
      return c.json({ error: 'Failed to load approved tools' }, 500);
    }
  });

  router.put('/api/assistant/conversations/:id/approved-tools', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const body = await c.req.json().catch(() => null);
      const toolsInput = Array.isArray(body?.tools)
        ? body.tools.filter((name: unknown): name is string => typeof name === 'string')
        : null;
      if (!toolsInput) {
        return c.json({ error: 'tools must be an array of strings' }, 400);
      }
      const tools = await runner.setApprovedTools(user.userId, conversationId, toolsInput);
      return c.json({ tools });
    } catch (e: any) {
      if (e?.message === 'Conversation not found') return c.json({ error: 'Conversation not found' }, 404);
      console.error('[PUT /api/assistant/conversations/:id/approved-tools]', e);
      return c.json({ error: 'Failed to update approved tools' }, 500);
    }
  });

  // ─── Resources referenced by a conversation ───
  router.get('/api/assistant/conversations/:id/resources', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const conversation = await repo.getConversation(user.userId, conversationId);
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
      const resources = await repo.listConversationResources(conversationId);
      return c.json({ resources });
    } catch (e) {
      console.error('[GET /api/assistant/conversations/:id/resources]', e);
      return c.json({ error: 'Failed to list conversation resources' }, 500);
    }
  });

  router.delete('/api/assistant/conversations/:id/resources/:resourceId', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const conversationId = c.req.param('id');
      const conversation = await repo.getConversation(user.userId, conversationId);
      if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
      await repo.deleteConversationResource(conversationId, c.req.param('resourceId'));
      return c.json({ success: true });
    } catch (e: any) {
      if (e?.message === 'Resource not found') return c.json({ error: 'Resource not found' }, 404);
      console.error('[DELETE /api/assistant/conversations/:id/resources/:resourceId]', e);
      return c.json({ error: 'Failed to remove conversation resource' }, 500);
    }
  });

  return router;
}
