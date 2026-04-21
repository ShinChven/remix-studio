import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { AssistantRepository } from '../db/assistant-repository';
import { AssistantRunner, AssistantStatusEvent, TurnResult } from '../assistant/assistant-runner';
import { ProviderRepository } from '../db/provider-repository';
import { ASSISTANT_SUPPORTED_PROVIDER_TYPES } from '../assistant/chat-provider-factory';
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
      const messages = await repo.listMessages(conversationId);
      return c.json({ conversation, messages });
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

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Transfer-Encoding', 'chunked');

    return stream(c, async (stream) => {
      try {
        const result = await runner.sendUserMessage({
          userId: user.userId,
          conversationId,
          content,
          onStatusEvent: (event) => {
            stream.write(JSON.stringify({ type: 'status', event }) + '\n');
          },
        });
        stream.write(JSON.stringify({ type: 'result', ...turnResultToJson(result, []) }) + '\n');
      } catch (e: any) {
        console.error('[POST /api/assistant/conversations/:id/messages]', e);
        const message = e?.message?.includes('concurrent')
          ? e.message
          : 'Failed to process message';
        stream.write(JSON.stringify({ type: 'error', error: message }) + '\n');
      }
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

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Transfer-Encoding', 'chunked');

    return stream(c, async (stream) => {
      try {
        await repo.deleteMessagesFrom(conversationId, messageId);

        const result = await runner.sendUserMessage({
          userId: user.userId,
          conversationId,
          content,
          onStatusEvent: (event) => {
            stream.write(JSON.stringify({ type: 'status', event }) + '\n');
          },
        });
        stream.write(JSON.stringify({ type: 'result', ...turnResultToJson(result, []) }) + '\n');
      } catch (e: any) {
        console.error('[POST /api/assistant/conversations/:id/messages/:messageId/edit]', e);
        const message = e?.message?.includes('concurrent')
          ? e.message
          : 'Failed to process message edit';
        stream.write(JSON.stringify({ type: 'error', error: message }) + '\n');
      }
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

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Transfer-Encoding', 'chunked');

    return stream(c, async (stream) => {
      try {
        const result = await runner.resumeAfterConfirmation({
          userId: user.userId,
          conversationId,
          confirmationId,
          decision,
          onStatusEvent: (event) => {
            stream.write(JSON.stringify({ type: 'status', event }) + '\n');
          },
        });
        stream.write(JSON.stringify({ type: 'result', ...turnResultToJson(result, []) }) + '\n');
      } catch (e: any) {
        console.error('[POST /api/assistant/conversations/:id/confirm]', e);
        const message = e?.message?.includes('concurrent')
          ? e.message
          : 'Failed to process confirmation';
        stream.write(JSON.stringify({ type: 'error', error: message }) + '\n');
      }
    });
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

  return router;
}
