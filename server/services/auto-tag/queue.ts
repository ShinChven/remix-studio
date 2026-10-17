import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import type { AutoTagRunStatus, AutoTagScope, ProviderType } from '../../../src/types';
import type { IRepository } from '../../db/repository';
import { normalizeAlbumTags } from '../../db/project-repository';
import { buildTextGenerator } from '../../generators/build-text-generator';
import type { TextGenerator } from '../../generators/text-generator';
import type { ProjectEventPublisher } from '../../live/project-live-hub';
import type { LiveEventPublisher } from '../../live/user-live-hub';
import { mediaKindForKey } from '../../media-share/media-types';
import { decrypt } from '../../utils/crypto';
import { stripToKey } from '../../utils/storage-keys';
import {
  AUTO_TAG_SYSTEM_PROMPT,
  AUTO_TAG_VOCABULARY_SIZE,
  buildAutoTagPrompt,
  parseAutoTagReply,
} from './prompt';
import { resolveAutoTagSettings } from './settings';

/** Longest side of the picture sent to the model; album thumbnails are this size. */
const IMAGE_MAX_DIMENSION = 768;
/** A request that has not answered by then frees its slot and counts as failed. */
const REQUEST_TIMEOUT_MS = 120_000;
/** How long the vocabulary of a collection is reused before it is read again. */
const VOCABULARY_TTL_MS = 30_000;
/** A finished run without failures is forgotten after this long. */
const FINISHED_RUN_TTL_MS = 10 * 60_000;

export type AutoTagKind = 'image' | 'text';

/** What an album item is tagged from, or null when it cannot be tagged yet (video, audio). */
export function albumItemAutoTagKind(
  item: { imageUrl?: string | null; textContent?: string | null },
  projectType?: string | null,
): AutoTagKind | null {
  const media = mediaKindForKey(item.imageUrl, projectType);
  if (media === 'image') return 'image';
  if (!media && item.textContent?.trim()) return 'text';
  return null;
}

/** What a library's items are tagged from, or null for libraries that cannot be tagged yet. */
export function libraryAutoTagKind(libraryType: string): AutoTagKind | null {
  return libraryType === 'image' || libraryType === 'text' ? libraryType : null;
}

export class AutoTagOffError extends Error {
  constructor() {
    super('Auto-tagging is turned off. Choose a model in Account → Preferences.');
  }
}

interface TagInput {
  kind: AutoTagKind;
  tags: string[];
  imageKeys: string[];
  text?: string;
}

interface RunState {
  userId: string;
  scope: AutoTagScope;
  language: string;
  pending: string[];
  running: Set<string>;
  total: number;
  completed: number;
  failures: Map<string, string>;
  vocabulary: string[];
  vocabularyAt: number;
  forgetTimer?: ReturnType<typeof setTimeout>;
}

interface UserState {
  runs: Map<string, RunState>;
  inFlight: number;
  pumping: boolean;
}

export interface AutoTagQueueDeps {
  prisma: PrismaClient;
  repository: Pick<IRepository, 'getAlbumTagCounts' | 'updateAlbumItemsTags'>;
  storage: { read(key: string): Promise<Buffer>; getBucketName(): string };
  projectEvents?: ProjectEventPublisher;
  liveEvents?: LiveEventPublisher;
  /** Replaceable for tests; defaults to the provider's real text generator. */
  buildGenerator?: (type: ProviderType, apiKey: string, apiUrl?: string | null) => TextGenerator;
}

function scopeKey(scope: AutoTagScope): string {
  return scope.kind === 'album' ? `album:${scope.projectId}` : `library:${scope.libraryId}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`The model did not answer within ${Math.round(ms / 1000)} seconds`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Tags album and library items with the vision model each user chose, holding
 * every user to their own concurrency limit across all of their albums and
 * libraries.
 *
 * The queue lives in memory. A restart drops what was waiting, which is safe
 * to pick up again: tags are only ever added, and a new run can skip the items
 * that already have some.
 */
export class AutoTagQueue {
  private users = new Map<string, UserState>();
  private buildGenerator: NonNullable<AutoTagQueueDeps['buildGenerator']>;

  constructor(private deps: AutoTagQueueDeps) {
    this.buildGenerator = deps.buildGenerator ?? buildTextGenerator;
  }

  /** Queue items for tagging. Items already waiting or being tagged are left where they are. */
  enqueue(userId: string, scope: AutoTagScope, itemIds: string[], language: string): AutoTagRunStatus {
    const user = this.userState(userId);
    const key = scopeKey(scope);
    let run = user.runs.get(key);
    if (!run || (run.pending.length === 0 && run.running.size === 0)) {
      if (run?.forgetTimer) clearTimeout(run.forgetTimer);
      run = {
        userId,
        scope,
        language,
        pending: [],
        running: new Set(),
        total: 0,
        completed: 0,
        failures: new Map(),
        vocabulary: [],
        vocabularyAt: 0,
      };
      user.runs.set(key, run);
    }
    run.language = language;

    const waiting = new Set(run.pending);
    for (const itemId of new Set(itemIds)) {
      if (waiting.has(itemId) || run.running.has(itemId)) continue;
      run.failures.delete(itemId);
      run.pending.push(itemId);
      run.total++;
    }

    void this.pump(userId);
    return this.toStatus(run);
  }

  /** Queue the run's failed items again. */
  retry(userId: string, scope: AutoTagScope, language: string): AutoTagRunStatus {
    const run = this.users.get(userId)?.runs.get(scopeKey(scope));
    if (!run || run.failures.size === 0) return this.status(userId, scope);
    return this.enqueue(userId, scope, [...run.failures.keys()], language);
  }

  /** Drop the items still waiting and forget the failures. Items already sent finish. */
  cancel(userId: string, scope: AutoTagScope): AutoTagRunStatus {
    const user = this.users.get(userId);
    const key = scopeKey(scope);
    const run = user?.runs.get(key);
    if (!user || !run) return this.status(userId, scope);
    run.total -= run.pending.length;
    run.pending = [];
    run.failures.clear();
    if (run.running.size === 0) {
      if (run.forgetTimer) clearTimeout(run.forgetTimer);
      user.runs.delete(key);
    }
    return this.status(userId, scope);
  }

  status(userId: string, scope: AutoTagScope): AutoTagRunStatus {
    const run = this.users.get(userId)?.runs.get(scopeKey(scope));
    if (!run) return { active: false, total: 0, completed: 0, pending: 0, running: 0, failures: [] };
    return this.toStatus(run);
  }

  private toStatus(run: RunState): AutoTagRunStatus {
    return {
      active: run.pending.length > 0 || run.running.size > 0,
      total: run.total,
      completed: run.completed,
      pending: run.pending.length,
      running: run.running.size,
      failures: [...run.failures].map(([itemId, error]) => ({ itemId, error })),
    };
  }

  private userState(userId: string): UserState {
    let user = this.users.get(userId);
    if (!user) {
      user = { runs: new Map(), inFlight: 0, pumping: false };
      this.users.set(userId, user);
    }
    return user;
  }

  /**
   * Start waiting items until the user's concurrency limit is reached. The
   * limit and the model are read again on every pump, so a change in
   * Preferences applies to the items that have not started yet.
   */
  private async pump(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user || user.pumping) return;
    user.pumping = true;
    try {
      const { settings, target } = await resolveAutoTagSettings(this.deps.prisma, userId);
      if (!target) {
        for (const run of user.runs.values()) {
          for (const itemId of run.pending) run.failures.set(itemId, new AutoTagOffError().message);
          run.pending = [];
          this.settle(user, run);
        }
        return;
      }
      while (user.inFlight < settings.concurrencyLimit) {
        const run = [...user.runs.values()].find((candidate) => candidate.pending.length > 0);
        if (!run) break;
        const itemId = run.pending.shift()!;
        run.running.add(itemId);
        user.inFlight++;
        void this.tagOne(run, itemId).finally(() => {
          user.inFlight--;
          run.running.delete(itemId);
          this.settle(user, run);
          void this.pump(userId);
        });
      }
    } catch (error) {
      // Nothing else would start the waiting items if none are in flight.
      console.error('[AutoTagQueue] pump failed:', error);
      setTimeout(() => void this.pump(userId), 5_000).unref?.();
    } finally {
      user.pumping = false;
    }
  }

  /** Forget a finished run without failures after a while; keep one with failures until it is handled. */
  private settle(user: UserState, run: RunState) {
    if (run.pending.length > 0 || run.running.size > 0 || run.failures.size > 0 || run.forgetTimer) return;
    const key = scopeKey(run.scope);
    run.forgetTimer = setTimeout(() => {
      if (user.runs.get(key) === run && run.pending.length === 0 && run.running.size === 0) user.runs.delete(key);
    }, FINISHED_RUN_TTL_MS);
    run.forgetTimer.unref?.();
  }

  private async tagOne(run: RunState, itemId: string): Promise<void> {
    try {
      const input = await this.loadInput(run, itemId);
      if (!input) {
        // Deleted while it waited: nothing to tag and nothing to report.
        run.total--;
        return;
      }

      const { target } = await resolveAutoTagSettings(this.deps.prisma, run.userId);
      if (!target) throw new AutoTagOffError();
      if (!target.provider.apiKeyEncrypted) throw new Error('The provider has no API key');
      const generator = this.buildGenerator(
        target.provider.type as ProviderType,
        decrypt(target.provider.apiKeyEncrypted),
        target.provider.apiUrl,
      );

      const result = await withTimeout(generator.generate({
        systemPrompt: AUTO_TAG_SYSTEM_PROMPT,
        prompt: buildAutoTagPrompt({
          kind: input.kind,
          language: run.language,
          vocabulary: await this.vocabulary(run),
          existingTags: input.tags,
          text: input.text,
        }),
        modelId: target.model.modelId,
        apiUrl: target.model.apiUrl,
        temperature: 0.2,
        maxTokens: 2048,
        refImagesBase64: input.kind === 'image' ? [await this.loadImage(input.imageKeys)] : undefined,
      }), REQUEST_TIMEOUT_MS);
      if (result.ok === false) throw new Error(result.error);

      const tags = parseAutoTagReply(result.text);
      if (tags.length === 0) throw new Error('The model replied without any tags');
      const saved = await this.addTags(run, itemId, tags);
      if (!saved) {
        run.total--;
        return;
      }
      run.completed++;
    } catch (error: any) {
      run.failures.set(itemId, String(error?.message || error || 'Auto-tagging failed').slice(0, 500));
    }
  }

  private async loadInput(run: RunState, itemId: string): Promise<TagInput | null> {
    const { prisma } = this.deps;
    if (run.scope.kind === 'album') {
      const item = await prisma.albumItem.findFirst({
        where: { id: itemId, projectId: run.scope.projectId, userId: run.userId },
        select: { imageUrl: true, thumbnailUrl: true, optimizedUrl: true, textContent: true, tags: true, project: { select: { type: true } } },
      });
      if (!item) return null;
      const kind = albumItemAutoTagKind(item, item.project.type);
      if (!kind) throw new Error('Only images and text can be auto-tagged');
      return {
        kind,
        tags: normalizeAlbumTags(item.tags),
        imageKeys: [item.thumbnailUrl, item.optimizedUrl, item.imageUrl].filter((v): v is string => Boolean(v)),
        text: item.textContent ?? undefined,
      };
    }

    const item = await prisma.libraryItem.findFirst({
      where: { id: itemId, libraryId: run.scope.libraryId, library: { userId: run.userId } },
      select: { content: true, title: true, thumbnailUrl: true, optimizedUrl: true, tags: true, library: { select: { type: true } } },
    });
    if (!item) return null;
    const kind = libraryAutoTagKind(item.library.type);
    if (!kind) throw new Error('Only images and text can be auto-tagged');
    return {
      kind,
      tags: normalizeAlbumTags(item.tags),
      imageKeys: [item.thumbnailUrl, item.optimizedUrl, item.content].filter((v): v is string => Boolean(v)),
      text: item.title?.trim() ? `${item.title.trim()}\n\n${item.content}` : item.content,
    };
  }

  /** The first of the item's files that can be read, as a PNG no larger than the model needs. */
  private async loadImage(values: string[]): Promise<string> {
    const bucket = this.deps.storage.getBucketName();
    let lastError: unknown;
    for (const value of values) {
      const key = stripToKey(value, bucket);
      if (!key || key.startsWith('http') || key.startsWith('data:')) continue;
      try {
        const buffer = await this.deps.storage.read(key);
        // Every text generator labels images as PNG, and some providers check
        // the label against the bytes, so whatever was stored is re-encoded.
        const png = await sharp(buffer)
          .rotate()
          .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        return png.toString('base64');
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError ? `Could not read the image: ${(lastError as Error).message}` : 'The item has no image file');
  }

  /** The tags the collection uses most, so a run keeps to one vocabulary. */
  private async vocabulary(run: RunState): Promise<string[]> {
    if (Date.now() - run.vocabularyAt < VOCABULARY_TTL_MS) return run.vocabulary;
    let counts: { tag: string; count: number }[];
    if (run.scope.kind === 'album') {
      counts = await this.deps.repository.getAlbumTagCounts(run.userId, run.scope.projectId);
    } else {
      const items = await this.deps.prisma.libraryItem.findMany({
        where: { libraryId: run.scope.libraryId, library: { userId: run.userId } },
        select: { tags: true },
      });
      const byTag = new Map<string, number>();
      for (const item of items) {
        for (const tag of normalizeAlbumTags(item.tags)) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
      }
      counts = [...byTag].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    }
    run.vocabulary = counts.slice(0, AUTO_TAG_VOCABULARY_SIZE).map((entry) => entry.tag);
    run.vocabularyAt = Date.now();
    return run.vocabulary;
  }

  /** Add tags to what the item has now, which may have changed while the model was answering. */
  private async addTags(run: RunState, itemId: string, tags: string[]): Promise<boolean> {
    if (run.scope.kind === 'album') {
      const { projectId } = run.scope;
      const { updated } = await this.deps.repository.updateAlbumItemsTags(run.userId, projectId, { itemIds: [itemId], add: tags });
      if (updated === 0) return false;
      this.deps.projectEvents?.notifyProjectChanged({ userId: run.userId, projectId, itemId, reason: 'album.tagged' });
      return true;
    }

    const { libraryId } = run.scope;
    const item = await this.deps.prisma.libraryItem.findFirst({
      where: { id: itemId, libraryId, library: { userId: run.userId } },
      select: { tags: true },
    });
    if (!item) return false;
    await this.deps.prisma.libraryItem.update({
      where: { id: itemId },
      data: { tags: normalizeAlbumTags([...normalizeAlbumTags(item.tags), ...tags]) },
    });
    this.deps.liveEvents?.publishChange(run.userId, { resource: 'library', action: 'updated', id: libraryId });
    return true;
  }
}
