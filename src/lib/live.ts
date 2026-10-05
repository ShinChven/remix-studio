/**
 * The signed-in user's change feed: one WebSocket per tab at /api/live,
 * shared by every page that wants to refetch when its records change
 * elsewhere (another tab, the assistant, an MCP client, the post scheduler).
 *
 * Events only name what changed; pages refetch through the REST API.
 */

export type LiveResource = 'project' | 'library' | 'campaign' | 'post';

export interface LiveResourceEvent {
  type: 'resource.changed';
  resource: LiveResource;
  action: 'created' | 'updated' | 'deleted';
  /** The changed record. Absent when one change spans several records. */
  id?: string;
  /** For posts: the campaign they belong to, when known. */
  campaignId?: string;
  /** Live client id of the tab whose request caused the change. */
  origin?: string;
  at: number;
}

/** Sent after a dropped socket reconnects: changes in the gap were missed. */
export interface LiveResyncSignal {
  type: 'resync';
}

export type LiveMessage = LiveResourceEvent | LiveResyncSignal;

/** Request header carrying this tab's live client id. */
export const LIVE_CLIENT_HEADER = 'X-Live-Client';

function createClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // randomUUID is missing outside secure contexts (plain http on a LAN).
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Random id for this tab. Requests carry it, and the events they cause come
 * back tagged with it, so a page can skip refetching its own edits.
 */
export const LIVE_CLIENT_ID = createClientId();

// Navigating between two live pages swaps one subscriber for the next; keep
// the socket through that instead of reconnecting.
const IDLE_CLOSE_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

type LiveListener = (message: LiveMessage) => void;

const listeners = new Set<LiveListener>();
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let idleCloseTimer: number | null = null;
let reconnectAttempt = 0;
let hasConnected = false;

function emit(message: LiveMessage) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(message);
    } catch (error) {
      console.error('Live update listener failed:', error);
    }
  }
}

function connect() {
  if (socket || listeners.size === 0) return;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}/api/live`);
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    reconnectAttempt = 0;
    if (hasConnected) emit({ type: 'resync' });
    hasConnected = true;
  };

  ws.onmessage = (event) => {
    if (socket !== ws) return;
    try {
      const data = JSON.parse(event.data);
      if (data?.type === 'resource.changed') emit(data as LiveResourceEvent);
    } catch (error) {
      console.error('Failed to parse live update:', error);
    }
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (listeners.size === 0) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function disconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const ws = socket;
  socket = null;
  hasConnected = false;
  reconnectAttempt = 0;
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
  }
}

/** Listen to the change feed, opening the shared socket if needed. */
export function subscribeLive(listener: LiveListener): () => void {
  listeners.add(listener);
  if (idleCloseTimer !== null) {
    window.clearTimeout(idleCloseTimer);
    idleCloseTimer = null;
  }
  if (!socket && reconnectTimer === null) connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || idleCloseTimer !== null) return;
    idleCloseTimer = window.setTimeout(() => {
      idleCloseTimer = null;
      if (listeners.size === 0) disconnect();
    }, IDLE_CLOSE_MS);
  };
}
