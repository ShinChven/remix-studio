import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';

export async function getUserStorageUsage(userId: string, storage: S3Storage, exportStorage: S3Storage, repository: IRepository): Promise<number> {
  // 1. All objects in main storage for this user
  const allObjects = await storage.listObjectsWithMetadata(`${userId}/`);
  const mainUsage = allObjects.reduce((sum, obj) => sum + (obj.size || 0), 0);

  // 2. All export tasks for this user to get archive usage
  const exportTasksResult = await repository.getAllExportTasks(userId, 1000);
  let exportUsage = 0;
  for (const task of exportTasksResult.items) {
    if (task.status === 'completed' && task.downloadUrl) {
      try {
        const url = new URL(task.downloadUrl);
        const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
        const size = await exportStorage.getSize(key);
        if (size) exportUsage += size;
      } catch (e) {
        // Ignore errors for individual files
      }
    }
  }

  return mainUsage + exportUsage;
}

export async function checkStorageLimit(
  userId: string, 
  incomingSizeBytes: number, 
  userRepository: UserRepository,
  storage: S3Storage, 
  exportStorage: S3Storage, 
  repository: IRepository
): Promise<{ allowed: boolean; currentUsage: number; limit: number }> {
  // Fetch latest limit from DB
  const user = await userRepository.findById(userId);
  const storageLimit = user?.storageLimit;

  // Default to 5GB if not set (mirroring the repository default)
  const limit = storageLimit || 5 * 1024 * 1024 * 1024;
  
  const currentUsage = await getUserStorageUsage(userId, storage, exportStorage, repository);
  
  if (currentUsage + incomingSizeBytes > limit) {
    return { allowed: false, currentUsage, limit };
  }
  
  return { allowed: true, currentUsage, limit };
}
