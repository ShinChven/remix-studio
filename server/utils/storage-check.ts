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
 *  - Projects (album + workflow): DB size fields on each item
 *  - Campaigns: DB size fields on post media
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
  const exportTasks: any[] = [];

  // Sum sizes from known DB records
  for (const item of allItems) {
    const type = item._type;
    const itemSize = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);

    if (type === 'ALBUM' || type === 'LIBRARY_ITEM' || type === 'WORKFLOW_ITEM' || type === 'POST_MEDIA') {
      totalSize += itemSize;
    } else if (type === 'EXPORT') {
      exportTasks.push(item);
    }
  }

  // Trash items (already fetched separately)
  for (const item of trashItems) {
    totalSize += Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);
  }

  // Archives: S3 getSize lookup per completed export task
  for (const task of exportTasks) {
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
