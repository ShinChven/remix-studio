import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { UserRepository } from '../auth/user-repository';
import { currentLiveOrigin } from './live-origin';
import {
  authenticateLiveRequest,
  HEARTBEAT_INTERVAL_MS,
  sweepLiveSockets,
  writeUpgradeError,
  type LiveSession,
} from './live-socket';
import type { ProjectEventPublisher, ProjectLiveEvent, ProjectLiveEventReason } from './project-live-hub';

const LIVE_PATH = '/api/live';

export type LiveResource = 'project' | 'library' | 'campaign' | 'post';
export type LiveResourceAction = 'created' | 'updated' | 'deleted';

export interface LiveResourceEvent {
  type: 'resource.changed';
  resource: LiveResource;
  action: LiveResourceAction;
  /** The changed record. Absent when one change spans several records. */
  id?: string;
  /** For posts: the campaign they belong to, when known. */
  campaignId?: string;
  /** Live client id of the browser tab whose request caused the change. */
  origin?: string;
  at: number;
}

export type LiveResourceChange = Omit<LiveResourceEvent, 'type' | 'origin' | 'at'>;

export interface LiveEventPublisher {
  publishChange(userId: string, change: LiveResourceChange): void;
}

// Project events the project list cares about: the project itself, and new or
// changed album items (the card shows the newest one). Job progress is left to
// the project's own channel.
const PROJECT_REASON_ACTIONS: Partial<Record<ProjectLiveEventReason, LiveResourceAction>> = {
  'project.created': 'created',
  'project.updated': 'updated',
  'project.deleted': 'deleted',
  'workflow.updated': 'updated',
  'job.completed': 'updated',
  'album.changed': 'updated',
  'album.deleted': 'updated',
  'album.renamed': 'updated',
  'album.restored': 'updated',
  'album.moved': 'updated',
  'album.tagged': 'updated',
};

/**
 * One WebSocket per signed-in browser tab at /api/live, carrying change
 * notices for the user's projects, libraries, campaigns and posts so list and
 * detail pages can refetch when something else (another tab, the assistant, an
 * MCP client, the post scheduler) changes them.
 *
 * Sockets are keyed by the user id of the session cookie they were opened
 * with, and every event is published for one user id, so a user only ever
 * hears about their own records. Events name what changed, never its content;
 * pages refetch through the authenticated REST API.
 */
export class UserLiveHub implements LiveEventPublisher, ProjectEventPublisher {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly socketsByUser = new Map<string, Set<WebSocket>>();
  private readonly socketMeta = new WeakMap<WebSocket, LiveSession>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private userRepository: UserRepository) {
    this.wss.on('connection', (ws) => {
      const meta = this.socketMeta.get(ws);
      if (!meta) {
        ws.close(1011, 'Missing connection metadata');
        return;
      }

      const sockets = this.socketsByUser.get(meta.userId) || new Set<WebSocket>();
      sockets.add(ws);
      this.socketsByUser.set(meta.userId, sockets);

      ws.on('pong', () => {
        const current = this.socketMeta.get(ws);
        if (current) current.isAlive = true;
      });
      ws.on('close', () => this.removeSocket(ws));
      ws.on('error', () => this.removeSocket(ws));

      ws.send(JSON.stringify({ type: 'connected', at: Date.now() }));
    });
  }

  attach(server: HttpServer) {
    server.on('upgrade', (request, socket, head) => {
      if (!isLivePath(request)) return;

      authenticateLiveRequest(request, this.userRepository).then((meta) => {
        if (!meta) {
          writeUpgradeError(socket, 401, 'Unauthorized');
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.socketMeta.set(ws, meta);
          this.wss.emit('connection', ws, request);
        });
      }).catch((error) => {
        console.error('[UserLiveHub] upgrade failed:', error);
        writeUpgradeError(socket, 500, 'Internal Server Error');
      });
    });

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        void sweepLiveSockets(this.wss.clients, this.socketMeta, this.userRepository, (ws) => this.removeSocket(ws));
      }, HEARTBEAT_INTERVAL_MS);
      this.heartbeatTimer.unref?.();
    }
  }

  publishChange(userId: string, change: LiveResourceChange) {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify({
      type: 'resource.changed',
      ...change,
      origin: currentLiveOrigin(),
      at: Date.now(),
    } satisfies LiveResourceEvent);

    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at' | 'origin'> & { userId: string }) {
    const action = PROJECT_REASON_ACTIONS[event.reason];
    if (!action) return;
    this.publishChange(event.userId, { resource: 'project', action, id: event.projectId });
  }

  private removeSocket(ws: WebSocket) {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    const sockets = this.socketsByUser.get(meta.userId);
    if (!sockets) return;

    sockets.delete(ws);
    if (sockets.size === 0) {
      this.socketsByUser.delete(meta.userId);
    }
  }
}

function isLivePath(request: IncomingMessage): boolean {
  if (!request.url) return false;
  try {
    return new URL(request.url, 'http://localhost').pathname === LIVE_PATH;
  } catch {
    return false;
  }
}
