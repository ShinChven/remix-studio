import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';
import { UserRepository } from '../auth/user-repository';

type Variables = { user: JwtPayload };

export function createStorageRouter(repository: IRepository, userRepository: UserRepository, storage: S3Storage, exportStorage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  router.get('/api/storage/analysis', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const userId = user.userId;

      // 1. Fetch all metadata from DB in a single pass
      const [allItems, userRecord] = await Promise.all([
        repository.getAllUserItems(userId),
        userRepository.findById(userId),
      ]);

      // 2. List all objects in main storage for this user
      const allObjects = await storage.listObjectsWithMetadata(`${userId}/`);

      const storageLimit = userRecord?.storageLimit || 5 * 1024 * 1024 * 1024; // Default to 5GB

      // 3. Process allItems into categorization map and specific lists
      const projectBreakdown: Record<string, { total: number; album: number; drafts: number; workflow: number; orphans: number; name: string }> = {};
      const exportTasks: any[] = [];
      const libraries: Record<string, string> = {}; // id -> name
      let totalLibrarySize = 0;
      let totalTrashSize = 0;
      let totalExportSize = 0;
      let totalOtherSize = 0;

      // Map to track which keys belong to which category
      const referencedKeys = new Map<string, string>(); // key -> category

      for (const item of allItems) {
        const sk = item.sk || '';
        if (sk.startsWith('PROJECT#')) {
          const parts = sk.split('#');
          const projectId = parts[1];
          
          if (parts.length === 2) {
            // Project Metadata
            if (!projectBreakdown[projectId]) {
              projectBreakdown[projectId] = { total: 0, album: 0, drafts: 0, workflow: 0, orphans: 0, name: item.name };
            } else {
              projectBreakdown[projectId].name = item.name;
            }
          } else if (sk.includes('#JOB#')) {
            const cat = 'drafts';
            if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.set(item.imageUrl, `project:${projectId}:${cat}`);
            if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, `project:${projectId}:${cat}`);
            if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, `project:${projectId}:${cat}`);
          } else if (sk.includes('#ALBUM#')) {
            const cat = 'album';
            if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.set(item.imageUrl, `project:${projectId}:${cat}`);
            if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, `project:${projectId}:${cat}`);
            if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, `project:${projectId}:${cat}`);
          } else if (sk.includes('#WF#')) {
            const cat = 'workflow';
            if (item.type === 'image' && item.value && !item.value.startsWith('http') && !item.value.startsWith('data:')) {
              referencedKeys.set(item.value, `project:${projectId}:${cat}`);
            }
            if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, `project:${projectId}:${cat}`);
            if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, `project:${projectId}:${cat}`);
          } else if (sk.includes('#EXPORT#')) {
            exportTasks.push(item);
          }
        } else if (sk.startsWith('LIBRARY#')) {
          if (sk.includes('#ITEM#')) {
            if (item.content && !item.content.startsWith('http') && !item.content.startsWith('data:')) referencedKeys.set(item.content, 'library');
            if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, 'library');
            if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, 'library');
          }
        } else if (sk.startsWith('TRASH#')) {
          if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.set(item.imageUrl, 'trash');
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, 'trash');
          if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, 'trash');
        }
      }

      // Ensure all projects found in sub-items are represented even if metadata item was missing (shouldn't happen)
      for (const [key, ref] of referencedKeys) {
        if (ref.startsWith('project:')) {
          const projectId = ref.split(':')[1];
          if (!projectBreakdown[projectId]) {
            projectBreakdown[projectId] = { total: 0, album: 0, drafts: 0, workflow: 0, orphans: 0, name: 'Unknown Project' };
          }
        }
      }

      // 4. Sum up main storage objects
      for (const obj of allObjects) {
        const size = obj.size || 0;
        const ref = referencedKeys.get(obj.key);

        if (ref) {
          if (ref === 'library') {
            totalLibrarySize += size;
          } else if (ref === 'trash') {
            totalTrashSize += size;
          } else if (ref.startsWith('project:')) {
            const parts = ref.split(':');
            const projectId = parts[1];
            const cat = parts[2] as 'album' | 'drafts' | 'workflow';
            if (projectBreakdown[projectId]) {
              projectBreakdown[projectId].total += size;
              projectBreakdown[projectId][cat] += size;
            }
          }
        } else {
          // Check if it belongs to a project folder (Orphan)
          let matched = false;
          for (const projectId in projectBreakdown) {
             const safePId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
             if (obj.key.startsWith(`${userId}/${safePId}/`)) {
                projectBreakdown[projectId].total += size;
                projectBreakdown[projectId].orphans += size;
                matched = true;
                break;
             }
          }

          if (!matched) {
            totalOtherSize += size;
          }
        }
      }

      // 5. Categorize Archives (Exports)
      // Since archives are in a different bucket and not strictly prefixed by userId in S3,
      // we sum them up using their DynamoDB records (ExportTask doesn't have size yet, we need to fetch it)
      for (const task of exportTasks) {
        if (task.status === 'completed' && task.downloadUrl) {
          try {
            // Extract key from URL or just use a placeholder for now if it's too expensive
            // For now, let's try to get the size from S3 if we can derive the key
            const url = new URL(task.downloadUrl);
            const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/')); // Skip bucket name
            const size = await exportStorage.getSize(key);
            if (size) totalExportSize += size;
          } catch (e) {
            console.warn(`Failed to get size for export ${task.id}:`, e);
          }
        }
      }

      // 6. Aggregate final results
      const totalProjectsSize = Object.values(projectBreakdown).reduce((acc, p) => acc + p.total, 0);
      const totalAlbumSize = Object.values(projectBreakdown).reduce((acc, p) => acc + p.album, 0);
      const totalDraftsSize = Object.values(projectBreakdown).reduce((acc, p) => acc + p.drafts, 0);
      const totalWorkflowSize = Object.values(projectBreakdown).reduce((acc, p) => acc + p.workflow, 0);
      const totalOrphansSize = Object.values(projectBreakdown).reduce((acc, p) => acc + p.orphans, 0);

      const totalSize = totalProjectsSize + totalLibrarySize + totalExportSize + totalTrashSize + totalOtherSize;

      return c.json({
        totalSize,
        limit: storageLimit,
        categories: [
          { id: 'projects', name: 'Projects', size: totalProjectsSize, subCategories: [
            { id: 'album', name: 'Album', size: totalAlbumSize },
            { id: 'drafts', name: 'Drafts/Jobs', size: totalDraftsSize },
            { id: 'workflow', name: 'Workflow', size: totalWorkflowSize },
            { id: 'orphans', name: 'Orphans', size: totalOrphansSize },
          ]},
          { id: 'libraries', name: 'Libraries', size: totalLibrarySize },
          { id: 'archives', name: 'Archives (Exports)', size: totalExportSize },
          { id: 'trash', name: 'Recycle Bin', size: totalTrashSize },
          { id: 'other', name: 'Other / Uploaded', size: totalOtherSize },
        ],
        projects: Object.entries(projectBreakdown).map(([id, stats]) => ({
          id,
          ...stats
        })).sort((a, b) => b.total - a.total)
      });
    } catch (e) {
      console.error('[GET /api/storage/analysis]', e);
      return c.json({ error: 'Failed to analyze storage' }, 500);
    }
  });

  return router;
}
