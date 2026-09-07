/**
 * Live registry of in-flight assistant turns.
 *
 * A turn used to live and die with the HTTP request that started it: the
 * runner was awaited inside the response stream, so a page refresh — or a
 * phone locking its screen — dropped the only handle on a loop that kept
 * running server-side, and the browser came back to a chat that looked idle
 * while tools were still firing.
 *
 * The hub decouples the two. A turn runs detached from any request; every
 * status event it emits is buffered with a sequence number and fanned out to
 * whichever clients are attached at that moment. A client that reconnects
 * asks for everything after the last sequence number it saw, so it catches up
 * on what it missed and then follows the turn live to its result.
 *
 * Finished turns linger briefly so a client that reconnects just after the
 * loop ended still collects the result frame instead of an empty stream.
 * Everything here is per-process, matching the runner's own single-process
 * concurrency guard; a restart loses in-flight turns, and clients fall back to
 * the persisted transcript.
 */

import type { AssistantStatusEvent } from './assistant-runner';

/** How long a finished turn's frames stay readable for late reconnects. */
const RETAIN_FINISHED_MS = 5 * 60_000;

/**
 * Cap on buffered status frames per turn. A long agentic loop can emit
 * thousands; keeping the newest few hundred is enough to describe what the
 * turn is doing now, which is all the progress line shows.
 */
const MAX_BUFFERED_FRAMES = 400;

export type TurnKind = 'message' | 'edit' | 'confirm';

/** One NDJSON line. `seq` orders frames so a reconnect can resume mid-turn. */
export type TurnFrame = { seq: number } & (
  | { type: 'status'; event: AssistantStatusEvent }
  | { type: 'result'; [key: string]: unknown }
  | { type: 'error'; error: string }
);

/** What a client needs to decide whether to reattach after a reload. */
export interface ActiveTurnInfo {
  kind: TurnKind;
  startedAt: number;
  lastSeq: number;
  /** Progress label at the moment of the snapshot, if the turn has emitted one. */
  lastEvent: AssistantStatusEvent | null;
}

export class TurnAlreadyRunningError extends Error {
  constructor(public readonly conversationId: string) {
    super('A turn is already running for this conversation');
    this.name = 'TurnAlreadyRunningError';
  }
}

type Subscriber = (frame: TurnFrame) => void;

class TurnRecord {
  readonly startedAt = Date.now();
  private seq = 0;
  /** Newest-last ring of status frames; the oldest are dropped past the cap. */
  private frames: TurnFrame[] = [];
  /** Kept out of the ring so it can never be evicted by later chatter. */
  private terminalFrame: TurnFrame | null = null;
  private lastEvent: AssistantStatusEvent | null = null;
  private subscribers = new Set<Subscriber>();
  private finishWaiters: Array<() => void> = [];
  finished = false;

  constructor(
    readonly conversationId: string,
    readonly userId: string,
    readonly kind: TurnKind,
  ) {}

  get lastSeq(): number {
    return this.seq;
  }

  info(): ActiveTurnInfo {
    return {
      kind: this.kind,
      startedAt: this.startedAt,
      lastSeq: this.seq,
      lastEvent: this.lastEvent,
    };
  }

  emitStatus(event: AssistantStatusEvent): void {
    this.lastEvent = event;
    const frame: TurnFrame = { seq: ++this.seq, type: 'status', event };
    this.frames.push(frame);
    if (this.frames.length > MAX_BUFFERED_FRAMES) this.frames.shift();
    this.fanOut(frame);
  }

  finish(payload: Record<string, unknown>): void {
    if (this.finished) return;
    this.finished = true;
    const frame = { seq: ++this.seq, ...payload } as TurnFrame;
    this.terminalFrame = frame;
    this.fanOut(frame);
    this.subscribers.clear();
    const waiters = this.finishWaiters;
    this.finishWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /**
   * Replay everything after `sinceSeq`, then follow live frames. Returns an
   * unsubscribe handle, or null when the turn is already over and its frames
   * have all been replayed.
   */
  subscribe(sinceSeq: number, onFrame: Subscriber): (() => void) | null {
    for (const frame of this.frames) {
      if (frame.seq > sinceSeq) onFrame(frame);
    }
    if (this.terminalFrame) {
      if (this.terminalFrame.seq > sinceSeq) onFrame(this.terminalFrame);
      return null;
    }
    this.subscribers.add(onFrame);
    return () => this.subscribers.delete(onFrame);
  }

  /** Resolves when the turn writes its terminal frame. */
  waitForFinish(): Promise<void> {
    if (this.finished) return Promise.resolve();
    return new Promise<void>((resolve) => this.finishWaiters.push(resolve));
  }

  private fanOut(frame: TurnFrame): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(frame);
      } catch {
        // A dead client must never break the turn or the other subscribers.
      }
    }
  }
}

export class AssistantTurnHub {
  private turns = new Map<string, TurnRecord>();

  /** The running turn for a conversation, or null when it is idle. */
  getActive(conversationId: string): ActiveTurnInfo | null {
    const record = this.turns.get(conversationId);
    if (!record || record.finished) return null;
    return record.info();
  }

  isActive(conversationId: string): boolean {
    return this.getActive(conversationId) !== null;
  }

  /**
   * Start a turn detached from the caller's request. The returned record is
   * what routes stream from; the work continues whether or not anyone is
   * listening.
   */
  start(input: {
    userId: string;
    conversationId: string;
    kind: TurnKind;
    /** Runs the turn. Its resolved value becomes the terminal NDJSON frame. */
    execute: (emit: (event: AssistantStatusEvent) => void) => Promise<Record<string, unknown>>;
  }): TurnRecord {
    if (this.isActive(input.conversationId)) {
      throw new TurnAlreadyRunningError(input.conversationId);
    }

    const record = new TurnRecord(input.conversationId, input.userId, input.kind);
    this.turns.set(input.conversationId, record);

    void (async () => {
      try {
        const payload = await input.execute((event) => record.emitStatus(event));
        record.finish(payload);
      } catch (e: any) {
        console.error('[AssistantTurnHub] Turn failed', e);
        record.finish({ type: 'error', error: e?.message || 'Failed to process turn' });
      } finally {
        this.scheduleEviction(input.conversationId, record);
      }
    })();

    return record;
  }

  /**
   * Attach to a conversation's turn: replays the frames the caller missed and
   * then follows it live. Returns null when there is no turn to attach to —
   * none running, and none finished recently enough to still be readable.
   *
   * `live` is false when the turn was already over: everything it had to say
   * has been replayed and `waitForFinish` resolves immediately.
   */
  attach(
    conversationId: string,
    sinceSeq: number,
    onFrame: Subscriber,
  ): { unsubscribe: () => void; waitForFinish: () => Promise<void>; live: boolean } | null {
    const record = this.turns.get(conversationId);
    if (!record) return null;
    const unsubscribe = record.subscribe(sinceSeq, onFrame);
    if (!unsubscribe) {
      return { unsubscribe: () => {}, waitForFinish: () => Promise.resolve(), live: false };
    }
    return { unsubscribe, waitForFinish: () => record.waitForFinish(), live: true };
  }

  /** Drop a conversation's turn record — used when the conversation is deleted. */
  discard(conversationId: string): void {
    this.turns.delete(conversationId);
  }

  private scheduleEviction(conversationId: string, record: TurnRecord): void {
    const timer = setTimeout(() => {
      if (this.turns.get(conversationId) === record) this.turns.delete(conversationId);
    }, RETAIN_FINISHED_MS);
    // Never hold the process open on a bookkeeping timer.
    if (typeof timer.unref === 'function') timer.unref();
  }
}

export type { TurnRecord };
