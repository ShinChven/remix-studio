import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken, type JwtPayload } from '../auth/auth';
import type { UserRepository } from '../auth/user-repository';
import type { IRepository } from '../db/repository';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_RECHECK_INTERVAL_MS = 5 * 60_000;

export type ProjectLiveEventReason =
  | 'connected'
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'workflow.updated'
  | 'jobs.changed'
  | 'job.updated'
  | 'job.completed'
  | 'job.failed'
  | 'job.deleted'
  | 'queue.started'
  | 'queue.cleared'
  | 'album.changed'
  | 'album.deleted'
  | 'album.renamed'
  | 'album.restored';

export interface ProjectLiveEvent {
  type: 'project.changed';
  projectId: string;
  reason: ProjectLiveEventReason;
  jobId?: string;
  itemId?: string;
  at: number;
}

export interface ProjectEventPublisher {
  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at'> & { userId: string }): void;
}

type SocketMeta = {
  userId: string;
  projectId: string;
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

function getProjectIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    const match = parsed.pathname.match(/^\/api\/projects\/([^/]+)\/live$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeUpgradeError(socket: Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export class ProjectLiveHub implements ProjectEventPublisher {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly socketsByProject = new Map<string, Set<WebSocket>>();
  private readonly socketMeta = new WeakMap<WebSocket, SocketMeta>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repository: IRepository,
    private userRepository: UserRepository
  ) {
    this.wss.on('connection', (ws, request) => {
      const meta = this.socketMeta.get(ws);
      if (!meta) {
        ws.close(1011, 'Missing connection metadata');
        return;
      }

      const key = this.subscriptionKey(meta.userId, meta.projectId);
      const sockets = this.socketsByProject.get(key) || new Set<WebSocket>();
      sockets.add(ws);
      this.socketsByProject.set(key, sockets);

      ws.on('pong', () => {
        const current = this.socketMeta.get(ws);
        if (current) current.isAlive = true;
      });
      ws.on('close', () => this.removeSocket(ws));
      ws.on('error', () => this.removeSocket(ws));

      ws.send(JSON.stringify({
        type: 'project.changed',
        projectId: meta.projectId,
        reason: 'connected',
        at: Date.now(),
      } satisfies ProjectLiveEvent));

      console.log(`[ProjectLiveHub] connected ${request.socket.remoteAddress || 'client'} user=${meta.userId} project=${meta.projectId}`);
    });
  }

  attach(server: HttpServer) {
    server.on('upgrade', (request, socket, head) => {
      const projectId = getProjectIdFromUrl(request.url);
      if (!projectId) return;

      this.authorize(request, projectId).then((meta) => {
        if (!meta) {
          writeUpgradeError(socket, 401, 'Unauthorized');
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.socketMeta.set(ws, meta);
          this.wss.emit('connection', ws, request);
        });
      }).catch((error) => {
        console.error('[ProjectLiveHub] upgrade failed:', error);
        writeUpgradeError(socket, 500, 'Internal Server Error');
      });
    });

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        void this.heartbeat();
      }, HEARTBEAT_INTERVAL_MS);
      this.heartbeatTimer.unref?.();
    }
  }

  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at'> & { userId: string }) {
    const { userId, ...payload } = event;
    const sockets = this.socketsByProject.get(this.subscriptionKey(userId, event.projectId));
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify({
      type: 'project.changed',
      ...payload,
      at: Date.now(),
    } satisfies ProjectLiveEvent);

    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private async authorize(request: IncomingMessage, projectId: string): Promise<SocketMeta | null> {
    const token = parseCookies(request.headers.cookie).token;
    if (!token) return null;

    let payload: JwtPayload & { exp?: number };
    try {
      payload = verifyToken(token) as JwtPayload & { exp?: number };
    } catch {
      return null;
    }

    const user = await this.userRepository.findById(payload.userId);
    if (!user || user.status === 'disabled') return null;
    if ((user.sessionVersion ?? 0) !== payload.sessionVersion) return null;

    const project = await this.repository.getProject(payload.userId, projectId);
    if (!project) return null;

    return {
      userId: payload.userId,
      projectId,
      sessionVersion: payload.sessionVersion,
      isAlive: true,
      lastAuthCheckAt: Date.now(),
      expiresAt: payload.exp ? payload.exp * 1000 : undefined,
    };
  }

  private async heartbeat() {
    const now = Date.now();
    for (const ws of this.wss.clients) {
      const meta = this.socketMeta.get(ws);
      if (!meta) {
        ws.terminate();
        continue;
      }

      if (!meta.isAlive) {
        ws.terminate();
        this.removeSocket(ws);
        continue;
      }

      if (meta.expiresAt && now >= meta.expiresAt) {
        ws.close(4001, 'Session expired');
        this.removeSocket(ws);
        continue;
      }

      if (now - meta.lastAuthCheckAt >= AUTH_RECHECK_INTERVAL_MS) {
        meta.lastAuthCheckAt = now;
        const stillAuthorized = await this.isStillAuthorized(meta);
        if (!stillAuthorized) {
          ws.close(4001, 'Session expired');
          this.removeSocket(ws);
          continue;
        }
      }

      meta.isAlive = false;
      ws.ping();
    }
  }

  private async isStillAuthorized(meta: SocketMeta): Promise<boolean> {
    const user = await this.userRepository.findById(meta.userId);
    return !!user && user.status !== 'disabled' && (user.sessionVersion ?? 0) === meta.sessionVersion;
  }

  private removeSocket(ws: WebSocket) {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    const key = this.subscriptionKey(meta.userId, meta.projectId);
    const sockets = this.socketsByProject.get(key);
    if (!sockets) return;

    sockets.delete(ws);
    if (sockets.size === 0) {
      this.socketsByProject.delete(key);
    }
  }

  private subscriptionKey(userId: string, projectId: string) {
    return `${userId}:${projectId}`;
  }
}
