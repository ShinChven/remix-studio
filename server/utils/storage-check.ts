import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';

/**
 * Calculates the current storage usage for a user.
 *
 * Uses the DB size fields maintained by generation/export workflows for cheap
 * quota enforcement during hot paths such as starting jobs.
 *
 * Uses SQL aggregates instead of materializing every user-owned row, with a
 * narrow S3 size fallback for legacy completed export tasks missing `size`.
 */
export async function getUserStorageUsage(
  userId: string,
  _storage: S3Storage,
  exportStorage: S3Storage,
  repository: IRepository
): Promise<number> {
  const usage = await repository.getStorageUsageAggregate(userId);
  let total = usage.projects + usage.campaigns + usage.libraries + usage.archives + usage.trash;

  const exportsMissingSize = await repository.getCompletedExportTasksMissingSize(userId);
  for (const task of exportsMissingSize) {
    if (!task.s3Key) continue;
    try {
      const size = await exportStorage.getSize(task.s3Key);
      if (size) total += size;
    } catch {
      // Ignore individual archive lookups, matching the legacy quota path.
    }
  }

  return total;
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
