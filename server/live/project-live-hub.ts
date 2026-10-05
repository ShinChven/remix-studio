import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { UserRepository } from '../auth/user-repository';
import type { IRepository } from '../db/repository';
import { currentLiveOrigin } from './live-origin';
import {
  authenticateLiveRequest,
  HEARTBEAT_INTERVAL_MS,
  sweepLiveSockets,
  writeUpgradeError,
  type LiveSession,
} from './live-socket';

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
  | 'album.restored'
  | 'album.moved'
  | 'album.tagged';

export interface ProjectLiveEvent {
  type: 'project.changed';
  projectId: string;
  reason: ProjectLiveEventReason;
  jobId?: string;
  itemId?: string;
  /** Live client id of the browser tab whose request caused the change. */
  origin?: string;
  at: number;
}

export interface ProjectEventPublisher {
  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at' | 'origin'> & { userId: string }): void;
}

type SocketMeta = LiveSession & { projectId: string };

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

  notifyProjectChanged(event: Omit<ProjectLiveEvent, 'type' | 'at' | 'origin'> & { userId: string }) {
    const { userId, ...payload } = event;
    const sockets = this.socketsByProject.get(this.subscriptionKey(userId, event.projectId));
    if (!sockets || sockets.size === 0) return;

    const message = JSON.stringify({
      type: 'project.changed',
      ...payload,
      origin: currentLiveOrigin(),
      at: Date.now(),
    } satisfies ProjectLiveEvent);

    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private async authorize(request: IncomingMessage, projectId: string): Promise<SocketMeta | null> {
    const session = await authenticateLiveRequest(request, this.userRepository);
    if (!session) return null;

    const project = await this.repository.getProject(session.userId, projectId);
    if (!project) return null;

    return { ...session, projectId };
  }

  private heartbeat() {
    return sweepLiveSockets(this.wss.clients, this.socketMeta, this.userRepository, (ws) => this.removeSocket(ws));
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
