/**
 * Unpacks uploaded project bundles into new projects.
 *
 * The HTTP layer streams the uploaded .zip straight into the export bucket and
 * inserts a pending row; this worker claims it, pulls the archive down to a
 * temp file, reads `project.json`, uploads every media entry into the new
 * project's storage prefix, and writes the workflow and album rows with the
 * keys remapped. Shape mirrors ExportManager: single claim loop, heartbeats,
 * and a reaper for workers that vanish mid-import.
 */

import crypto from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { S3Storage } from '../storage/s3-storage';
import { IRepository } from '../db/repository';
import { UserRepository } from '../auth/user-repository';
import { getUserStorageUsage } from '../utils/storage-check';
import type { AlbumItem, Project, WorkflowItem } from '../../src/types';
import {
  PROJECT_BUNDLE_MANIFEST_ENTRY,
  ProjectBundleError,
  bundlePathToFilename,
  isBundleMediaPath,
  isSafeBundlePath,
  parseProjectBundleManifest,
  type ProjectBundleManifest,
} from '../services/project-bundle';

/** Only one import unpacks at a time — each is I/O heavy. */
const MAX_CONCURRENT_IMPORTS = 1;

const HEARTBEAT_INTERVAL_MS = 10_000;
const REAPER_INTERVAL_MS = 60_000;

/** Keep failed imports around for a day so the error stays visible. */
const TTL_24H = () => new Date(Date.now() + 86_400_000);
/** Finished imports stay a week; the uploaded zip is deleted immediately. */
const TTL_7D = () => new Date(Date.now() + 7 * 86_400_000);

/** Refuse absurd manifests rather than melting the database. */
const MAX_WORKFLOW_ITEMS = 5_000;
const MAX_ALBUM_ITEMS = 50_000;

export interface ProjectImportTask {
  id: string;
  userId: string;
  fileName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  projectId?: string;
  projectName?: string;
  current: number;
  total: number;
  size?: number;
  s3Key?: string;
  error?: string;
  createdAt: number;
}

type ZipFile = yauzl.ZipFile;
type ZipEntry = yauzl.Entry;

function openZip(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err, zipFile) => {
      if (err || !zipFile) return reject(err ?? new Error('Failed to open archive'));
      resolve(zipFile);
    });
  });
}

/** Read every entry header once; the archive stays open for random access. */
function readEntries(zipFile: ZipFile): Promise<Map<string, ZipEntry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, ZipEntry>();
    zipFile.on('entry', (entry: ZipEntry) => {
      // Directory entries end in '/' and carry no data.
      if (!entry.fileName.endsWith('/')) entries.set(entry.fileName, entry);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', reject);
    zipFile.readEntry();
  });
}

function openEntryStream(zipFile: ZipFile, entry: ZipEntry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error(`Failed to read ${entry.fileName}`));
      resolve(stream as unknown as Readable);
    });
  });
}

async function readEntryToBuffer(zipFile: ZipFile, entry: ZipEntry): Promise<Buffer> {
  const stream = await openEntryStream(zipFile, entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'ogg': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}

export class ProjectImportManager {
  private readonly workerId = crypto.randomUUID();
  private running = 0;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private reaperTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private repository: IRepository,
    private imageStorage: S3Storage,
    private exportStorage: S3Storage,
    private userRepository: UserRepository
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Storage key the uploaded archive is parked at until the worker runs. */
  static uploadKey(userId: string, taskId: string): string {
    return `${userId}/project-imports/${taskId}/bundle.zip`;
  }

  /** Register an uploaded bundle and wake the loop. */
  async enqueue(input: {
    userId: string;
    taskId: string;
    fileName?: string;
    s3Key: string;
    size?: number;
  }): Promise<void> {
    await this.repository.saveProjectImportTask(input.userId, input.taskId, {
      fileName: input.fileName,
      status: 'pending',
      current: 0,
      total: 0,
      size: input.size,
      s3Key: input.s3Key,
      createdAt: Date.now(),
    });
    this.scheduleLoop(0);
  }

  // ─── Worker loop ──────────────────────────────────────────────────────────

  startWorkerLoop(): void {
    this.scheduleLoop(0);
    this.reaperTimer = setInterval(() => this.reap(), REAPER_INTERVAL_MS);
    console.log(`[ProjectImportManager] Worker loop started (worker=${this.workerId})`);
  }

  stopWorkerLoop(): void {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (this.reaperTimer) clearInterval(this.reaperTimer);
  }

  private scheduleLoop(delayMs: number): void {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(), delayMs);
  }

  private async loop(): Promise<void> {
    if (this.running >= MAX_CONCURRENT_IMPORTS) {
      this.scheduleLoop(5_000);
      return;
    }

    const task = await this.repository.claimNextProjectImportTask(this.workerId).catch((e) => {
      console.error('[ProjectImportManager] claimNextProjectImportTask error:', e);
      return null;
    });

    if (!task) {
      this.scheduleLoop(5_000);
      return;
    }

    this.running++;
    this.runImportTask(task).finally(() => {
      this.running--;
      this.scheduleLoop(0);
    });
  }

  private async reap(): Promise<void> {
    try {
      const count = await this.repository.reapStaleProjectImportTasks(5);
      if (count > 0) {
        console.log(`[ProjectImportManager] Reaped ${count} stale import task(s)`);
        this.scheduleLoop(0);
      }
    } catch (e) {
      console.error('[ProjectImportManager] Reaper error:', e);
    }
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────

  private async runImportTask(task: any): Promise<void> {
    const { id: taskId, userId, s3Key, fileName } = task;
    console.log(`[ProjectImportManager] Starting import ${taskId} (user=${userId}, file=${fileName ?? 'bundle.zip'})`);

    const heartbeat = setInterval(() => {
      this.repository.heartbeatProjectImportTask(taskId).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    let tempFile: string | null = null;
    let zipFile: ZipFile | null = null;

    try {
      if (!s3Key) throw new Error('Uploaded bundle is missing');

      // 1. Pull the archive down. yauzl needs random access, so it has to land
      //    on disk before we can read the central directory.
      tempFile = path.join(os.tmpdir(), `remix-import-${taskId}.zip`);
      // Uploaded bundles are parked in the export bucket alongside generated
      // archives, so the quota accounting already covers them.
      const download = await this.exportStorage.readStream(s3Key);
      await pipeline(download, fs.createWriteStream(tempFile));

      zipFile = await openZip(tempFile);
      const entries = await readEntries(zipFile);

      const manifestEntry = entries.get(PROJECT_BUNDLE_MANIFEST_ENTRY);
      if (!manifestEntry) {
        throw new ProjectBundleError(`Archive has no ${PROJECT_BUNDLE_MANIFEST_ENTRY} — is this a project bundle?`);
      }

      const manifestRaw = await readEntryToBuffer(zipFile, manifestEntry);
      let manifest: ProjectBundleManifest;
      try {
        manifest = parseProjectBundleManifest(JSON.parse(manifestRaw.toString('utf-8')));
      } catch (e) {
        if (e instanceof ProjectBundleError) throw e;
        throw new ProjectBundleError('project.json could not be parsed');
      }

      if (manifest.workflow.length > MAX_WORKFLOW_ITEMS || manifest.album.length > MAX_ALBUM_ITEMS) {
        throw new ProjectBundleError('Bundle is too large to import');
      }

      // 2. Only media the manifest actually references gets unpacked, so a
      //    tampered archive cannot smuggle extra files into storage.
      const wanted = this.collectReferencedPaths(manifest);
      const mediaEntries: Array<{ bundlePath: string; entry: ZipEntry }> = [];
      for (const bundlePath of wanted) {
        if (!isSafeBundlePath(bundlePath)) {
          throw new ProjectBundleError(`Archive contains an unsafe path: ${bundlePath}`);
        }
        const entry = entries.get(bundlePath);
        if (entry) mediaEntries.push({ bundlePath, entry });
        else console.warn(`[ProjectImportManager] ${taskId}: ${bundlePath} referenced but missing from the archive`);
      }

      // 3. Quota check against the uncompressed media, before writing anything.
      const totalBytes = mediaEntries.reduce((sum, { entry }) => sum + (entry.uncompressedSize ?? 0), 0);
      const user = await this.userRepository.findById(userId);
      const limit = user?.storageLimit ?? 5 * 1024 * 1024 * 1024;
      const currentUsage = await getUserStorageUsage(userId, this.imageStorage, this.exportStorage, this.repository);
      if (currentUsage + totalBytes > limit) {
        throw new Error(
          `Storage quota exceeded: this bundle needs ${((currentUsage + totalBytes - limit) / (1024 * 1024)).toFixed(1)} MB more than you have left`
        );
      }

      await this.updateTask(userId, taskId, {
        status: 'processing',
        current: 0,
        total: mediaEntries.length,
        projectName: manifest.project.name,
      });

      // 4. Create the project shell first so uploaded media has a home; the
      //    workflow and album land once every file is in place.
      const projectId = crypto.randomUUID();
      await this.repository.createProject(userId, {
        ...manifest.project,
        id: projectId,
        name: manifest.project.name,
        createdAt: Date.now(),
        workflow: [],
        jobs: [],
        album: [],
      } as Project);

      await this.updateTask(userId, taskId, { projectId, projectName: manifest.project.name });

      // 5. Unpack media into the project's storage prefix.
      const keyMap = new Map<string, string>();
      const usedKeys = new Set<string>();
      let done = 0;

      for (const { bundlePath, entry } of mediaEntries) {
        let filename = bundlePathToFilename(bundlePath);
        let candidate = `${userId}/${projectId}/${filename}`;
        let suffix = 1;
        while (usedKeys.has(candidate)) {
          candidate = `${userId}/${projectId}/${suffix}_${filename}`;
          suffix++;
        }
        usedKeys.add(candidate);

        const stream = await openEntryStream(zipFile, entry);
        await this.imageStorage.uploadStream(candidate, stream, contentTypeFor(filename));
        keyMap.set(bundlePath, candidate);

        done++;
        if (done % 10 === 0 || done === mediaEntries.length) {
          await this.updateTask(userId, taskId, { current: done });
        }
      }

      // 6. Rewrite every bundle path to the key it was unpacked to.
      const workflow = this.remapWorkflow(manifest.workflow, keyMap);
      if (workflow.length > 0) {
        await this.repository.updateProject(userId, projectId, { workflow });
      }

      const album = this.remapAlbum(manifest.album, keyMap);
      for (const item of album) {
        await this.repository.addAlbumItem(userId, projectId, item);
      }

      await this.updateTask(userId, taskId, {
        status: 'completed',
        current: mediaEntries.length,
        total: mediaEntries.length,
        projectId,
        projectName: manifest.project.name,
        expiresAt: TTL_7D(),
      });

      console.log(
        `[ProjectImportManager] ${taskId}: imported "${manifest.project.name}" as ${projectId} ` +
        `(${mediaEntries.length} files, ${album.length} album items)`
      );
    } catch (err: any) {
      console.error(`[ProjectImportManager] ${taskId} error:`, err);
      await this.updateTask(userId, taskId, {
        status: 'failed',
        error: err?.message ?? 'Import failed',
        expiresAt: TTL_24H(),
      });
    } finally {
      clearInterval(heartbeat);
      if (zipFile) {
        try { zipFile.close(); } catch { /* already closed */ }
      }
      if (tempFile) {
        await fs.promises.unlink(tempFile).catch(() => {});
      }
      // The uploaded archive has served its purpose either way — leaving it
      // behind would silently eat the user's quota.
      if (s3Key) {
        await this.exportStorage.delete(s3Key).catch((e) => {
          console.warn(`[ProjectImportManager] Failed to delete uploaded bundle ${s3Key}:`, e);
        });
      }
      await this.updateTask(userId, taskId, { s3Key: null });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Every bundle path the manifest points at, de-duplicated. */
  private collectReferencedPaths(manifest: ProjectBundleManifest): string[] {
    const paths = new Set<string>();
    const add = (value: unknown) => {
      if (isBundleMediaPath(value as string)) paths.add(value as string);
    };

    for (const item of manifest.workflow) {
      add(item.value);
      add(item.thumbnailUrl);
      add(item.optimizedUrl);
    }
    for (const item of manifest.album) {
      add(item.imageUrl);
      add(item.thumbnailUrl);
      add(item.optimizedUrl);
      item.imageContexts?.forEach(add);
      item.videoContexts?.forEach(add);
      item.audioContexts?.forEach(add);
    }
    return Array.from(paths);
  }

  /** Bundle path → new storage key; anything else is left as it was. */
  private remapValue(value: string | undefined, keyMap: Map<string, string>): string | undefined {
    if (!value) return value;
    if (!isBundleMediaPath(value)) return value;
    return keyMap.get(value);
  }

  private remapContexts(values: string[] | undefined, keyMap: Map<string, string>): string[] | undefined {
    if (!values?.length) return undefined;
    const mapped = values
      .map((value) => this.remapValue(value, keyMap))
      .filter((value): value is string => Boolean(value));
    return mapped.length > 0 ? mapped : undefined;
  }

  private remapWorkflow(items: WorkflowItem[], keyMap: Map<string, string>): WorkflowItem[] {
    return items.map((item, index) => ({
      ...item,
      // Fresh ids: the source installation's ids mean nothing here.
      id: crypto.randomUUID(),
      order: typeof item.order === 'number' ? item.order : index,
      value: this.remapValue(item.value, keyMap) ?? '',
      thumbnailUrl: this.remapValue(item.thumbnailUrl, keyMap),
      optimizedUrl: this.remapValue(item.optimizedUrl, keyMap),
    }));
  }

  private remapAlbum(items: AlbumItem[], keyMap: Map<string, string>): AlbumItem[] {
    return items
      .map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        // The originating jobs aren't carried over, so the album item stands
        // alone; keeping a dangling job id would only confuse "reuse".
        jobId: '',
        imageUrl: this.remapValue(item.imageUrl, keyMap) ?? '',
        thumbnailUrl: this.remapValue(item.thumbnailUrl, keyMap),
        optimizedUrl: this.remapValue(item.optimizedUrl, keyMap),
        imageContexts: this.remapContexts(item.imageContexts, keyMap),
        videoContexts: this.remapContexts(item.videoContexts, keyMap),
        audioContexts: this.remapContexts(item.audioContexts, keyMap),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      }))
      // A media item whose file didn't make it into the archive would render
      // as a broken tile; text items legitimately have no file.
      .filter((item) => Boolean(item.imageUrl) || Boolean(item.textContent));
  }

  private async updateTask(userId: string, taskId: string, updates: Record<string, unknown>): Promise<void> {
    try {
      const existing = await this.repository.getProjectImportTask(userId, taskId);
      if (!existing) return;
      await this.repository.saveProjectImportTask(userId, taskId, { ...existing, ...updates });
    } catch (e) {
      console.error(`[ProjectImportManager] Failed to update task ${taskId}:`, e);
    }
  }
}
