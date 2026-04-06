import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';

/**
 * Calculates the current storage usage for a user.
 *
 * Uses the same DB-first strategy as GET /api/storage/analysis to ensure
 * quota enforcement and the dashboard display always agree.
 *
 * Size breakdown:
 *  - Projects (album + drafts + workflow): DB size fields on each item
 *  - Libraries: DB size fields on each library item
 *  - Trash: DB size fields on each trash item
 *  - Archives (exports): S3 HeadObject on each completed export task's s3Key
 *
 * S3 is NOT scanned for the main bucket — DB fields are authoritative.
 */
export async function getUserStorageUsage(
  userId: string,
  storage: S3Storage,
  exportStorage: S3Storage,
  repository: IRepository
): Promise<number> {
  const [allItems, trashItems] = await Promise.all([
    repository.getAllUserItems(userId),
    repository.getTrashItems(userId),
  ]);

  let totalSize = 0;

  // Sum sizes from known DB records
  for (const item of allItems) {
    const sk = item.sk || '';
    const isProjectContent =
      sk.includes('#ALBUM#') ||
      sk.includes('#JOB#') ||
      sk.includes('#WF#');
    const isLibraryItem = sk.startsWith('LIBRARY#') && sk.includes('#ITEM#');

    if (isProjectContent || isLibraryItem) {
      totalSize += (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
    }
  }

  // Trash items (fetched separately since getTrashItems is its own method)
  for (const item of trashItems) {
    totalSize += (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
  }

  // Archives: S3 HeadObject per completed export task (no size field in DB)
  const exportTasksResult = await repository.getAllExportTasks(userId, 1000);
  for (const task of exportTasksResult.items) {
    if (task.status === 'completed' && task.s3Key) {
      try {
        const size = await exportStorage.getSize(task.s3Key);
        if (size) totalSize += size;
      } catch (e) {
        // Ignore individual lookup failures
      }
    }
  }

  return totalSize;
}

export async function checkStorageLimit(
  userId: string,
  incomingSizeBytes: number,
  userRepository: UserRepository,
  storage: S3Storage,
  exportStorage: S3Storage,
  repository: IRepository
): Promise<{ allowed: boolean; currentUsage: number; limit: number }> {
  const user = await userRepository.findById(userId);
  const limit = user?.storageLimit || 5 * 1024 * 1024 * 1024; // Default 5GB

  const currentUsage = await getUserStorageUsage(userId, storage, exportStorage, repository);

  return {
    allowed: currentUsage + incomingSizeBytes <= limit,
    currentUsage,
    limit,
  };
}
