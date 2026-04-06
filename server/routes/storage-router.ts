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
      const [allItems, trashItems, userRecord] = await Promise.all([
        repository.getAllUserItems(userId),
        repository.getTrashItems(userId),
        userRepository.findById(userId),
      ]);

      // 2. List all objects in main storage for this user
      const allObjects = await storage.listObjectsWithMetadata(`${userId}/`);

      const storageLimit = userRecord?.storageLimit || 5 * 1024 * 1024 * 1024; // Default to 5GB

      // 3. Build project/library breakdown from DB size fields.
      //    This is the authoritative source — same as what project pages and trash page display.
      const projectBreakdown: Record<string, { total: number; album: number; drafts: number; workflow: number; orphans: number; name: string }> = {};
      const exportTasks: any[] = [];
      let totalLibrarySize = 0;

      // Trash: sum size + optimizedSize + thumbnailSize from DB records (same as Trash page)
      const totalTrashSize = trashItems.reduce((sum, item) => {
        return sum + (item.size || 0) + (item.optimizedSize || 0) + (item.thumbnailSize || 0);
      }, 0);

      let totalExportSize = 0;

      // Track all S3 keys referenced by DB records (used for orphan detection only)
      const referencedKeys = new Set<string>();
      const markKey = (url?: string) => {
        if (url && !url.startsWith('http') && !url.startsWith('data:')) referencedKeys.add(url);
      };

      for (const item of allItems) {
        const type = item._type;
        const projectId = item.projectId;
        const itemSize = Number(item.size || 0) + Number(item.optimizedSize || 0) + Number(item.thumbnailSize || 0);

        if (type === 'JOB' || type === 'ALBUM' || type === 'WORKFLOW_ITEM') {
          if (projectId) {
            if (!projectBreakdown[projectId]) {
              projectBreakdown[projectId] = { total: 0, album: 0, drafts: 0, workflow: 0, orphans: 0, name: 'Unknown Project' };
            }

            if (type === 'ALBUM') {
              projectBreakdown[projectId].album += itemSize;
              projectBreakdown[projectId].total += itemSize;
              markKey(item.imageUrl);
              markKey(item.thumbnailUrl);
              markKey(item.optimizedUrl);
            } else if (type === 'JOB') {
              projectBreakdown[projectId].drafts += itemSize;
              projectBreakdown[projectId].total += itemSize;
              markKey(item.imageUrl);
              markKey(item.thumbnailUrl);
              markKey(item.optimizedUrl);
            } else if (type === 'WORKFLOW_ITEM') {
              // Workflow items currently don't have size fields in schema, but URLs exist
              projectBreakdown[projectId].workflow += itemSize;
              projectBreakdown[projectId].total += itemSize;
              if (item.type === 'image' && item.value) markKey(item.value);
              markKey(item.thumbnailUrl);
              markKey(item.optimizedUrl);
            }
          }
        } else if (type === 'LIBRARY_ITEM') {
          totalLibrarySize += itemSize;
          markKey(item.content);
          markKey(item.thumbnailUrl);
          markKey(item.optimizedUrl);
        } else if (type === 'TRASH') {
          // Trash size is already calculated from trashItems fetch, just mark keys for orphan detection
          markKey(item.imageUrl);
          markKey(item.thumbnailUrl);
          markKey(item.optimizedUrl);
        } else if (type === 'EXPORT') {
          // Export tasks are handled in a separate loop for size (via lookup) or via size field
          // but we still want to mark the key to avoid orphan detection
          exportTasks.push(item);
          if (item.data?.s3Key) markKey(item.data.s3Key);
          if (item.downloadUrl) markKey(item.downloadUrl);
        }
      }

      // Also mark names for projects that were fetched
      const allProjects = await repository.getUserProjects(userId);
      for (const p of allProjects) {
        if (projectBreakdown[p.id]) {
          projectBreakdown[p.id].name = p.name;
        } else {
          // Ensure project is represented even if it has no items
          projectBreakdown[p.id] = { total: 0, album: 0, drafts: 0, workflow: 0, orphans: 0, name: p.name };
        }
      }

      // 4. Scan S3 objects to find orphans (files in storage not referenced by any DB record)
      for (const obj of allObjects) {
        if (referencedKeys.has(obj.key)) continue; // Already accounted for via DB

        const size = obj.size || 0;

        // Assign orphan to its project folder if recognizable
        let matched = false;
        for (const projectId in projectBreakdown) {
          if (obj.key.startsWith(`${userId}/${projectId}/`)) {
            projectBreakdown[projectId].total += size;
            projectBreakdown[projectId].orphans += size;
            matched = true;
            break;
          }
        }
        // Truly unclassified files are ignored from total to avoid double-counting
        void matched;
      }

      // 5. Categorize Archives (Exports) via S3 size lookup using stored s3Key
      for (const task of exportTasks) {
        if (task.status === 'completed' && task.s3Key) {
          try {
            const size = await exportStorage.getSize(task.s3Key);
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

      const totalSize = totalProjectsSize + totalLibrarySize + totalExportSize + totalTrashSize;

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
