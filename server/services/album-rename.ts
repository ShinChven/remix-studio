import type { AlbumItem, Job, Project } from '../../src/types';
import type { IRepository } from '../db/repository';
import { isMissingObjectError, type S3Storage } from '../storage/s3-storage';
import { mapWithConcurrency } from '../utils/concurrency';
import { stripToKey } from '../utils/storage-keys';

const RENAME_CONCURRENCY = 8;
const PROBE_CONCURRENCY = 16;

const FILE_FIELDS = ['imageUrl', 'thumbnailUrl', 'optimizedUrl'] as const;
type FileField = typeof FILE_FIELDS[number];

// S3 copy sources and served file URLs carry keys unencoded, so a key holding
// one of these stops resolving.
const UNSAFE_FILENAME_CHARS = /[%?#\u0000-\u001f\u007f]/;

export type AlbumRenameErrorCode = 'invalid_input' | 'project_not_found' | 'item_not_found' | 'filename_conflict';

export class AlbumRenameError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409, readonly code: AlbumRenameErrorCode) {
    super(message);
    this.name = 'AlbumRenameError';
  }
}

const invalidInput = (message: string) => new AlbumRenameError(message, 400, 'invalid_input');
const filenameConflict = (message: string) => new AlbumRenameError(message, 409, 'filename_conflict');

/** The file name at the end of a storage key, or of a URL that was never reduced to a key. */
export function basenameFromKey(value: string | undefined): string {
  if (!value) return '';
  if (!/^https?:\/\//.test(value)) return value.slice(value.lastIndexOf('/') + 1);
  const path = value.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function splitFilename(filename: string, fallbackExt?: string): { base: string; ext: string } {
  const trimmed = filename.trim();
  const match = trimmed.match(/^(.*?)(\.[^.\/\\]+)$/);
  if (match && match[1]) return { base: match[1], ext: match[2].slice(1) };
  return { base: trimmed, ext: fallbackExt || '' };
}

/** A prefix as typed, without the trailing "_" that joins it to the rest of a name. */
export function trimPrefix(prefix: string | undefined): string {
  return (prefix ?? '').trim().replace(/_+$/, '');
}

/** A prefix as generated file names carry it: only [a-zA-Z0-9-_] survive. */
export function toFilenamePrefix(prefix: string | undefined): string {
  return trimPrefix(prefix).replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function replaceFilenamePrefix(
  currentBase: string,
  options: { oldPrefix?: string; newPrefix: string },
): { nextBase: string; status: 'renamed' | 'unchanged' | 'skipped' } {
  const cleanOld = trimPrefix(options.oldPrefix);
  const safeOld = toFilenamePrefix(options.oldPrefix);
  const safeNew = toFilenamePrefix(options.newPrefix);
  const lowerBase = currentBase.toLowerCase();

  if (cleanOld) {
    const candidates = Array.from(new Set([cleanOld, safeOld].filter(Boolean)));
    for (const candidate of candidates) {
      const prefixWithSep = `${candidate.toLowerCase()}_`;
      if (lowerBase.startsWith(prefixWithSep)) {
        const rest = currentBase.slice(prefixWithSep.length);
        if (!rest && !safeNew) {
          return { nextBase: currentBase, status: 'skipped' };
        }
        const nextBase = safeNew ? (rest ? `${safeNew}_${rest}` : safeNew) : rest;
        return {
          nextBase,
          status: nextBase === currentBase ? 'unchanged' : 'renamed',
        };
      }
      if (lowerBase === candidate.toLowerCase() && safeNew) {
        return {
          nextBase: safeNew,
          status: safeNew === currentBase ? 'unchanged' : 'renamed',
        };
      }
    }
    if (safeNew && (lowerBase.startsWith(`${safeNew.toLowerCase()}_`) || lowerBase === safeNew.toLowerCase())) {
      return { nextBase: currentBase, status: 'unchanged' };
    }
    return { nextBase: currentBase, status: 'skipped' };
  }

  if (!safeNew) {
    return { nextBase: currentBase, status: 'skipped' };
  }
  if (lowerBase.startsWith(`${safeNew.toLowerCase()}_`) || lowerBase === safeNew.toLowerCase()) {
    return { nextBase: currentBase, status: 'unchanged' };
  }
  return {
    nextBase: `${safeNew}_${currentBase}`,
    status: 'renamed',
  };
}

export interface RenameAlbumItemsOptions {
  /** Explicit per-item filename renames (mutually exclusive with prefix mode). */
  updates?: Array<{ itemId: string; filename: string }>;
  /** Prefix mode: new prefix to apply. Omitted or "" strips oldPrefix. */
  newPrefix?: string;
  /** Prefix mode: existing prefix to replace. When omitted, newPrefix is prepended. */
  oldPrefix?: string;
  /** Scope for prefix mode: explicit item IDs, or all items matching filters. */
  itemIds?: string[];
  all?: boolean;
  aspectRatios?: string[];
  tags?: string[];
  tagMatch?: 'all' | 'any';
  q?: string;
}

export interface RenamedAlbumItemSummary {
  id: string;
  oldFilename: string;
  newFilename: string;
  storageKey: string | null;
}

export interface RenameAlbumItemsResult {
  project: Project;
  renamed: number;
  unchanged: number;
  skipped: number;
  /** Renames that failed. Nothing new is started after the first one. */
  failed: Array<{ id: string; filename: string; error: string }>;
  notAttempted: number;
  items: RenamedAlbumItemSummary[];
  updatedAlbumItems: AlbumItem[];
}

interface KeyMove {
  field: FileField;
  from: string;
  to: string;
}

interface PlannedItemRename {
  item: AlbumItem;
  currentName: string;
  requestedBase: string;
  normalizedFilename: string;
  /** Empty when the name stays as it is. */
  moves: KeyMove[];
}

function isStoredKey(key: string | undefined): key is string {
  return !!key && !key.startsWith('http') && !key.startsWith('data:');
}

/**
 * The storage objects that follow an item's rename: its file, and the
 * `<base>.thumb.jpg` / `<base>.opt.jpg` derivatives stored next to it.
 */
function planKeyMoves(item: AlbumItem, bucket: string, currentBase: string, nextBase: string): KeyMove[] {
  const moves: KeyMove[] = [];
  for (const field of FILE_FIELDS) {
    const key = stripToKey(item[field], bucket);
    if (!isStoredKey(key)) continue;
    const slash = key.lastIndexOf('/');
    const name = key.slice(slash + 1);
    if (!name.startsWith(currentBase)) continue;
    const suffix = name.slice(currentBase.length);
    if (suffix && !suffix.startsWith('.')) continue;
    moves.push({ field, from: key, to: `${key.slice(0, slash + 1)}${nextBase}${suffix}` });
  }
  return moves;
}

export async function renameAlbumItems(
  deps: { repository: IRepository; storage: S3Storage },
  userId: string,
  projectId: string,
  options: RenameAlbumItemsOptions,
): Promise<RenameAlbumItemsResult> {
  const { repository, storage } = deps;
  const bucket = storage.getBucketName();

  const project = await repository.getProject(userId, projectId);
  if (!project) throw new AlbumRenameError('Project not found', 404, 'project_not_found');

  const allItems = await repository.getAllProjectAlbumItems(userId, projectId);
  const itemById = new Map(allItems.map((item) => [item.id, item]));

  const plannedById = new Map<string, PlannedItemRename>();
  let skipped = 0;
  const planRename = (item: AlbumItem, currentName: string, currentBase: string, nextBase: string) => {
    plannedById.set(item.id, {
      item,
      currentName,
      requestedBase: nextBase,
      normalizedFilename: `${nextBase}${currentName.slice(currentBase.length)}`,
      moves: nextBase === currentBase ? [] : planKeyMoves(item, bucket, currentBase, nextBase),
    });
  };

  if (options.updates && options.updates.length > 0) {
    for (const entry of options.updates) {
      const itemId = entry.itemId?.trim();
      const requested = entry.filename?.trim() ?? '';
      if (!itemId) throw invalidInput('Item id is required');
      if (!requested) throw invalidInput('Filename is required');
      if (/[\/\\]/.test(requested)) throw invalidInput('Filename cannot contain path separators');
      if (UNSAFE_FILENAME_CHARS.test(requested)) throw invalidInput('Filename cannot contain %, ?, # or control characters');

      const item = itemById.get(itemId);
      if (!item) throw new AlbumRenameError(`Album item "${itemId}" not found`, 404, 'item_not_found');

      const mainKey = stripToKey(item.imageUrl, bucket);
      const currentName = basenameFromKey(mainKey);
      const currentParts = splitFilename(currentName, item.format);
      if (!isStoredKey(mainKey) || !currentParts.base) {
        throw invalidInput(`Album item "${itemId}" has no stored file to rename`);
      }
      const requestedParts = splitFilename(requested, currentParts.ext);
      if (!requestedParts.base) throw invalidInput('Filename cannot be empty');

      planRename(item, currentName, currentParts.base, requestedParts.base);
    }
  } else if (options.newPrefix !== undefined || options.oldPrefix !== undefined) {
    const newPrefix = options.newPrefix ?? '';
    const cleanNew = trimPrefix(newPrefix);
    const cleanOld = trimPrefix(options.oldPrefix);
    if (!cleanNew && !cleanOld) {
      throw invalidInput('Provide a non-empty new_prefix, or an old_prefix to strip');
    }
    if (/[\/\\]/.test(cleanNew) || /[\/\\]/.test(cleanOld)) {
      throw invalidInput('Prefix cannot contain path separators');
    }

    let targets: AlbumItem[];
    if (options.all) {
      const hasFilters = Boolean(
        (options.aspectRatios && options.aspectRatios.length > 0) ||
        (options.tags && options.tags.length > 0) ||
        (options.q && options.q.trim()),
      );
      if (hasFilters) {
        const scoped = await repository.getProjectAlbum(userId, projectId, {
          limit: 999999,
          aspectRatios: options.aspectRatios,
          tags: options.tags,
          tagMatch: options.tagMatch,
          q: options.q,
        });
        targets = scoped.items;
      } else {
        targets = allItems;
      }
    } else {
      const ids = Array.from(new Set((options.itemIds ?? []).map((id) => id.trim()).filter(Boolean)));
      if (ids.length === 0) {
        throw invalidInput('Provide item_ids or set all_items to true');
      }
      targets = [];
      for (const id of ids) {
        const item = itemById.get(id);
        if (!item) throw new AlbumRenameError(`Album item "${id}" not found`, 404, 'item_not_found');
        targets.push(item);
      }
    }

    for (const item of targets) {
      const mainKey = stripToKey(item.imageUrl, bucket);
      const currentName = basenameFromKey(mainKey);
      const currentBase = splitFilename(currentName, item.format).base;
      if (!isStoredKey(mainKey) || !currentBase) {
        skipped += 1;
        continue;
      }
      const replaced = replaceFilenamePrefix(currentBase, { oldPrefix: options.oldPrefix, newPrefix });
      if (replaced.status === 'skipped') {
        skipped += 1;
        continue;
      }
      planRename(item, currentName, currentBase, replaced.nextBase);
    }
  } else {
    throw invalidInput('Provide updates, or a new or old prefix');
  }

  const plans = Array.from(plannedById.values());
  const changedPlans = plans.filter((plan) => plan.moves.length > 0);
  const changedIds = new Set(changedPlans.map((plan) => plan.item.id));
  const singleUpdate = options.updates?.length === 1;

  // No two album items may share a name once the batch is applied. Names that
  // already clash are left alone unless this batch renames one of them.
  const ownersByName = new Map<string, { name: string; ids: string[] }>();
  for (const item of allItems) {
    const name = (plannedById.get(item.id)?.normalizedFilename ?? basenameFromKey(stripToKey(item.imageUrl, bucket))).trim();
    if (!name) continue;
    const entry = ownersByName.get(name.toLowerCase()) ?? { name, ids: [] };
    entry.ids.push(item.id);
    ownersByName.set(name.toLowerCase(), entry);
  }
  for (const { name, ids } of ownersByName.values()) {
    if (ids.length > 1 && ids.some((id) => changedIds.has(id))) {
      throw filenameConflict(singleUpdate ? 'Filename already exists in this album' : `Filename "${name}" already exists in this album`);
    }
  }

  // Every object a rename writes must be free: not a file another item still
  // uses (a swap or chain has to go one step at a time), not claimed twice in
  // this batch, and not already in the bucket.
  const keyOwners = new Map<string, string>();
  for (const item of allItems) {
    for (const field of FILE_FIELDS) {
      const key = stripToKey(item[field], bucket);
      if (isStoredKey(key)) keyOwners.set(key.toLowerCase(), item.id);
    }
  }
  const claimed = new Map<string, string>();
  for (const plan of changedPlans) {
    for (const move of plan.moves) {
      const lower = move.to.toLowerCase();
      const owner = keyOwners.get(lower);
      if (owner && owner !== plan.item.id) {
        throw filenameConflict(`"${basenameFromKey(move.to)}" is still used by another album item; rename that item first`);
      }
      const claimant = claimed.get(lower);
      if (claimant && claimant !== plan.item.id) {
        throw filenameConflict(`Two album items would both be renamed to "${basenameFromKey(move.to)}"`);
      }
      claimed.set(lower, plan.item.id);
    }
  }
  const takenKeys = await mapWithConcurrency(
    changedPlans.flatMap((plan) => plan.moves.map((move) => move.to)),
    PROBE_CONCURRENCY,
    async (key) => {
      try {
        await storage.getObjectForServe(key, { head: true });
        return key;
      } catch (e) {
        if (isMissingObjectError(e)) return null;
        throw e;
      }
    },
  );
  const takenKey = takenKeys.find(Boolean);
  if (takenKey) {
    throw filenameConflict(`A file named "${basenameFromKey(takenKey)}" already exists in this project's storage`);
  }

  // Fetch originating jobs so their storage keys and filenames stay in sync
  const jobIds = Array.from(
    new Set(
      changedPlans
        .map((plan) => plan.item.jobId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const jobs = jobIds.length > 0
    ? await repository.getProjectJobsByIds(userId, projectId, jobIds)
    : [];
  const jobById = new Map<string, Job>(jobs.map((job) => [job.id, job]));

  // Copy first, repoint the row, and only then delete the old objects, so a
  // failure part way leaves the item on files that still exist.
  const renameItemFiles = async (plan: PlannedItemRename): Promise<AlbumItem> => {
    const { item } = plan;
    const done: KeyMove[] = [];
    const files: Partial<Pick<AlbumItem, FileField>> = {};
    try {
      for (const move of plan.moves) {
        try {
          await storage.copy(move.from, move.to);
        } catch (e) {
          if (!isMissingObjectError(e)) throw e;
          if (move.field === 'imageUrl') throw new Error('The stored file is missing');
          // A derivative that is already gone keeps the key it had.
          continue;
        }
        done.push(move);
        files[move.field] = move.to;
      }
      const saved = await repository.updateAlbumItemFiles(userId, projectId, item.id, files, { ifImageUrl: item.imageUrl });
      if (!saved) throw new Error('The item changed or was removed during the rename');
    } catch (e) {
      await Promise.all(done.map((move) => storage.delete(move.to).catch(() => undefined)));
      throw e;
    }

    let keepOldFiles = false;
    const job = item.jobId ? jobById.get(item.jobId) : undefined;
    if (job && job.status !== 'processing') {
      const movedTo = new Map(done.map((move) => [move.from, move.to]));
      const jobUpdates: Partial<Job> = {};
      for (const field of FILE_FIELDS) {
        const next = movedTo.get(stripToKey(job[field], bucket) ?? '');
        if (next) jobUpdates[field] = next;
      }
      if (jobUpdates.imageUrl) jobUpdates.filename = plan.requestedBase;
      if (Object.keys(jobUpdates).length > 0) {
        try {
          await repository.updateJob(userId, projectId, job.id, jobUpdates);
        } catch (e) {
          // The job still points at the old objects, so they stay.
          keepOldFiles = true;
          console.warn(`[album-rename] Could not repoint job ${job.id} after renaming album item ${item.id}:`, e);
        }
      }
    }

    if (!keepOldFiles) {
      await Promise.all(done.map((move) => storage.delete(move.from).catch((e) => {
        console.warn(`[album-rename] Could not delete ${move.from} after renaming album item ${item.id}:`, e);
      })));
    }
    return { ...item, ...files };
  };

  const updatedById = new Map<string, AlbumItem>();
  const failed: RenameAlbumItemsResult['failed'] = [];
  await mapWithConcurrency(changedPlans, RENAME_CONCURRENCY, async (plan) => {
    // After a failure, start nothing new: the caller hears about it with the
    // album in a state it can describe.
    if (failed.length > 0) return;
    try {
      updatedById.set(plan.item.id, await renameItemFiles(plan));
    } catch (e) {
      failed.push({ id: plan.item.id, filename: plan.currentName, error: e instanceof Error ? e.message : String(e) });
    }
  });

  const items: RenamedAlbumItemSummary[] = [];
  for (const plan of changedPlans) {
    const updatedItem = updatedById.get(plan.item.id);
    if (!updatedItem) continue;
    items.push({
      id: plan.item.id,
      oldFilename: plan.currentName,
      newFilename: plan.normalizedFilename,
      storageKey: updatedItem.imageUrl || null,
    });
  }

  return {
    project,
    renamed: updatedById.size,
    unchanged: plans.length - changedPlans.length,
    skipped,
    failed,
    notAttempted: changedPlans.length - updatedById.size - failed.length,
    items,
    updatedAlbumItems: plans.map((plan) => updatedById.get(plan.item.id) ?? plan.item),
  };
}
