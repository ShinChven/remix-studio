import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';

/**
 * Each browser tab sends a random id in this header. Live events caused by
 * that tab's own request carry the id back as `origin`, so the tab can skip
 * refetching what it already shows, while every other tab (and every change
 * made through MCP) still refreshes.
 */
export const LIVE_CLIENT_HEADER = 'x-live-client';

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type OriginScope = { clientId: string; open: boolean };

const originStorage = new AsyncLocalStorage<OriginScope>();

export const liveOriginMiddleware: MiddlewareHandler = async (c, next) => {
  // The assistant acts for the user the way an external MCP client does, so
  // its changes reach every tab, including the one running the chat.
  if (c.req.path.startsWith('/api/assistant')) return next();

  const clientId = c.req.header(LIVE_CLIENT_HEADER)?.trim();
  if (!clientId || !CLIENT_ID_PATTERN.test(clientId)) return next();

  const scope: OriginScope = { clientId, open: true };
  try {
    await originStorage.run(scope, next);
  } finally {
    // Work the request started (a queued job, a poll) inherits this context
    // and can outlive it; what it changes later is not this tab's own edit.
    scope.open = false;
  }
};

/** The live client id of the request being handled, if any. */
export function currentLiveOrigin(): string | undefined {
  const scope = originStorage.getStore();
  return scope?.open ? scope.clientId : undefined;
}
