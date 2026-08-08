/**
 * Project export entry points shared by the HTTP routes and the MCP/assistant
 * tools. Both surfaces queue the exact same archive jobs, so a bundle exported
 * by an agent is byte-for-byte the one the UI would have produced.
 */

import type { AlbumItem } from '../../src/types';
import type { IRepository } from '../db/repository';
import type { UserRepository } from '../auth/user-repository';
import type { S3Storage } from '../storage/s3-storage';
import type { ExportManager, ExportItem } from '../queue/export-manager';
import { buildProjectBundleManifest } from './project-bundle';
import { checkStorageLimit } from '../utils/storage-check';
import { normalizeWorkflowForStorage, stripToKey } from '../utils/storage-keys';
import type { PostWatermarkConfig } from '../utils/watermark';

export type ExportAssetVersion = 'raw' | 'optimized';

export interface ProjectExportDeps {
  repository: IRepository;
  userRepository: UserRepository;
  /** Media bucket the album/bundle files are read from. */
  storage: S3Storage;
  /** Bucket the finished archives are written to. */
  exportStorage: S3Storage;
  exportManager: ExportManager;
}

/** Carries the HTTP status the route layer should answer with. */
export class ProjectExportError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404) {
    super(message);
    this.name = 'ProjectExportError';
  }
}

export interface StartedProjectExport {
  taskId: string;
  projectId: string;
  projectName: string;
  /** Files queued into the archive. */
  itemCount: number;
  estimatedSize: number;
}

/** Everything in one project's album is exported unless `itemIds` narrows it. */
export async function startProjectAlbumExport(
  deps: ProjectExportDeps,
  userId: string,
  params: {
    projectId: string;
    itemIds?: string[];
    packageName?: string;
    exportVersion?: ExportAssetVersion;
    watermarkSettings?: PostWatermarkConfig;
  }
): Promise<StartedProjectExport> {
  const { repository, userRepository, storage, exportStorage, exportManager } = deps;
  const { projectId, itemIds, packageName, watermarkSettings } = params;
  const exportVersion: ExportAssetVersion = params.exportVersion === 'optimized' ? 'optimized' : 'raw';

  const project = await repository.getProject(userId, projectId);
  if (!project) throw new ProjectExportError(`Project "${projectId}" not found`, 404);
  if (watermarkSettings?.enabled && project.type !== 'image') {
    throw new ProjectExportError('Watermark export is only available for image projects', 400);
  }

  const albumPage = await repository.getProjectAlbum(userId, projectId, { limit: 999999 });
  const itemsToExport = itemIds ? albumPage.items.filter((item) => itemIds.includes(item.id)) : albumPage.items;
  if (itemsToExport.length === 0) throw new ProjectExportError('No items to export', 400);

  // Estimate the ZIP size using the selected asset version. Media files are already
  // compressed, so the ZIP will be roughly the sum of source sizes.
  const estimatedSize = (
    await Promise.all(
      itemsToExport.map(async (item) => {
        const key = exportVersion === 'optimized' && item.optimizedUrl ? item.optimizedUrl : item.imageUrl;
        const knownSize = exportVersion === 'optimized' && item.optimizedUrl
          ? item.optimizedSize || item.size
          : item.size;
        return knownSize || (await storage.getSize(key).catch(() => undefined)) || 5 * 1024 * 1024;
      })
    )
  ).reduce((acc, size) => acc + size, 0);

  const { allowed, currentUsage, limit } = await checkStorageLimit(
    userId,
    estimatedSize,
    userRepository,
    storage,
    exportStorage,
    repository
  );
  if (!allowed) {
    throw new ProjectExportError(
      `Storage limit exceeded. Cannot export album. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedSize / (1024 * 1024)).toFixed(1)}MB.`,
      403
    );
  }

  const taskId = await exportManager.startExport(userId, projectId, project.name, itemsToExport, packageName, {
    exportVersion,
    ...(watermarkSettings ? { watermarkSettings } : {}),
  });

  return {
    taskId,
    projectId,
    projectName: project.name,
    itemCount: itemsToExport.length,
    estimatedSize,
  };
}

/**
 * Package a whole project — settings, workflow, album and every media file they
 * reference — into one portable .zip that another installation can import.
 */
export async function startProjectBundleExport(
  deps: ProjectExportDeps,
  userId: string,
  params: { projectId: string; packageName?: string }
): Promise<StartedProjectExport> {
  const { repository, userRepository, storage, exportStorage, exportManager } = deps;
  const { projectId, packageName } = params;

  const project = await repository.getProject(userId, projectId);
  if (!project) throw new ProjectExportError(`Project "${projectId}" not found`, 404);

  const bucket = storage.getBucketName();
  const [workflow, albumPage] = await Promise.all([
    repository.getProjectWorkflow(userId, projectId),
    repository.getProjectAlbum(userId, projectId, { limit: 999999 }),
  ]);

  // The manifest has to carry bare storage keys to resolve them to files,
  // so anything stored as a presigned URL is stripped back down first.
  const manifest = buildProjectBundleManifest({
    project: { ...project, id: projectId },
    workflow: normalizeWorkflowForStorage(workflow, bucket),
    album: albumPage.items.map((item) => ({
      ...item,
      imageUrl: stripToKey(item.imageUrl, bucket) || item.imageUrl,
      thumbnailUrl: stripToKey(item.thumbnailUrl, bucket),
      optimizedUrl: stripToKey(item.optimizedUrl, bucket),
      imageContexts: item.imageContexts?.map((v) => stripToKey(v, bucket) || v),
      videoContexts: item.videoContexts?.map((v) => stripToKey(v, bucket) || v),
      audioContexts: item.audioContexts?.map((v) => stripToKey(v, bucket) || v),
    })),
  });

  // Resolve real sizes for the quota estimate, and drop entries whose file
  // has gone missing so the archiver never stalls on a dead key.
  const mediaItems: ExportItem[] = [];
  let estimatedSize = 0;
  for (const entry of manifest.media) {
    if (!entry.sourceKey) continue;
    const size = entry.size ?? (await storage.getSize(entry.sourceKey).catch(() => undefined));
    if (size == null && !(await storage.exists(entry.sourceKey).catch(() => false))) {
      console.warn(`[ProjectExport] Skipping missing file ${entry.sourceKey}`);
      continue;
    }
    entry.size = size;
    estimatedSize += size ?? 5 * 1024 * 1024;
    mediaItems.push({
      id: entry.path,
      jobId: '',
      prompt: '',
      imageUrl: entry.sourceKey,
      size,
      createdAt: Date.now(),
      exportName: entry.path,
    } as AlbumItem & { exportName: string });
  }

  // Keep the manifest honest about what the archive actually contains.
  const packedPaths = new Set(mediaItems.map((item) => item.exportName));
  manifest.media = manifest.media.filter((entry) => packedPaths.has(entry.path));

  const { allowed, currentUsage, limit } = await checkStorageLimit(
    userId,
    estimatedSize,
    userRepository,
    storage,
    exportStorage,
    repository
  );
  if (!allowed) {
    throw new ProjectExportError(
      `Storage limit exceeded. Cannot export project. Remaining: ${((limit - currentUsage) / (1024 * 1024)).toFixed(1)}MB. Required: ~${(estimatedSize / (1024 * 1024)).toFixed(1)}MB.`,
      403
    );
  }

  const taskId = await exportManager.startExport(
    userId,
    projectId,
    project.name,
    mediaItems,
    packageName || `${project.name}_Project`,
    {
      sourceType: 'project-bundle',
      bundleManifest: manifest,
    }
  );

  return {
    taskId,
    projectId,
    projectName: project.name,
    itemCount: mediaItems.length,
    estimatedSize,
  };
}
