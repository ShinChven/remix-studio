import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket } from 'ws';
import { verifyToken, type JwtPayload } from '../auth/auth';
import type { UserRepository } from '../auth/user-repository';

/**
 * Plumbing shared by the live WebSocket hubs: cookie authentication on
 * upgrade, and the heartbeat that drops dead sockets and re-checks sessions.
 */

export const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_RECHECK_INTERVAL_MS = 5 * 60_000;

/** The signed-in session a live socket was opened with. */
export type LiveSession = {
  userId: string;
  sessionVersion: number;
  isAlive: boolean;
  lastAuthCheckAt: number;
  expiresAt?: number;
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function writeUpgradeError(socket: Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/** Resolve the upgrade request's session cookie to an active user, or null. */
export async function authenticateLiveRequest(
  request: IncomingMessage,
  userRepository: UserRepository,
): Promise<LiveSession | null> {
  const token = parseCookies(request.headers.cookie).token;
  if (!token) return null;

  let payload: JwtPayload & { exp?: number };
  try {
    payload = verifyToken(token) as JwtPayload & { exp?: number };
  } catch {
    return null;
  }

  const user = await userRepository.findById(payload.userId);
  if (!user || user.status === 'disabled') return null;
  if ((user.sessionVersion ?? 0) !== payload.sessionVersion) return null;

  return {
    userId: payload.userId,
    sessionVersion: payload.sessionVersion,
    isAlive: true,
    lastAuthCheckAt: Date.now(),
    expiresAt: payload.exp ? payload.exp * 1000 : undefined,
  };
}

async function isSessionStillValid(userRepository: UserRepository, session: LiveSession): Promise<boolean> {
  const user = await userRepository.findById(session.userId);
  return !!user && user.status !== 'disabled' && (user.sessionVersion ?? 0) === session.sessionVersion;
}

/**
 * One heartbeat pass: terminate sockets that missed the last ping, close those
 * whose session expired or was revoked (sign-out, password change, disabled
 * account), and ping the rest.
 */
export async function sweepLiveSockets<Meta extends LiveSession>(
  clients: Iterable<WebSocket>,
  socketMeta: WeakMap<WebSocket, Meta>,
  userRepository: UserRepository,
  removeSocket: (ws: WebSocket) => void,
) {
  const now = Date.now();
  for (const ws of clients) {
    const meta = socketMeta.get(ws);
    if (!meta) {
      ws.terminate();
      continue;
    }

    if (!meta.isAlive) {
      ws.terminate();
      removeSocket(ws);
      continue;
    }

    if (meta.expiresAt && now >= meta.expiresAt) {
      ws.close(4001, 'Session expired');
      removeSocket(ws);
      continue;
    }

    if (now - meta.lastAuthCheckAt >= AUTH_RECHECK_INTERVAL_MS) {
      meta.lastAuthCheckAt = now;
      if (!(await isSessionStillValid(userRepository, meta))) {
        ws.close(4001, 'Session expired');
        removeSocket(ws);
        continue;
      }
    }

    meta.isAlive = false;
    ws.ping();
  }
}
