import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '../auth/auth';
import { IRepository } from '../db/repository';
import { S3Storage } from '../storage/s3-storage';

type Variables = { user: JwtPayload };

export function createStorageRouter(repository: IRepository, storage: S3Storage, exportStorage: S3Storage) {
  const router = new Hono<{ Variables: Variables }>();

  router.get('/api/storage/analysis', authMiddleware, async (c) => {
    try {
      const user = c.get('user') as JwtPayload;
      const userId = user.userId;

      // 1. List all objects in main storage for this user
      // All user files are prefixed with their userId
      const allObjects = await storage.listObjectsWithMetadata(`${userId}/`);

      // 2. Fetch all metadata from DB
      const [projects, libraries, trashItems, exportTasksResult] = await Promise.all([
        repository.getUserProjects(userId),
        repository.getUserLibraries(userId),
        repository.getTrashItems(userId),
        repository.getAllExportTasks(userId, 1000), // Assuming not more than 1000 exports for now
      ]);

      const exportTasks = exportTasksResult.items;

      // 3. Define categories and their sizes
      const projectBreakdown: Record<string, { total: number; album: number; drafts: number; workflow: number; orphans: number; name: string }> = {};
      let totalLibrarySize = 0;
      let totalTrashSize = 0;
      let totalExportSize = 0;
      let totalOtherSize = 0;

      // Maps to track which keys belong to which category
      const referencedKeys = new Map<string, string>(); // key -> category

      // Categorize Library items
      for (const lib of libraries) {
        for (const item of lib.items) {
          if (item.content && !item.content.startsWith('http') && !item.content.startsWith('data:')) referencedKeys.set(item.content, 'library');
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, 'library');
          if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, 'library');
        }
      }

      // Categorize Trash items
      for (const item of trashItems) {
        if (item.imageUrl && !item.imageUrl.startsWith('http')) referencedKeys.set(item.imageUrl, 'trash');
        if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) referencedKeys.set(item.thumbnailUrl, 'trash');
        if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) referencedKeys.set(item.optimizedUrl, 'trash');
      }

      // Pre-process Projects
      for (const project of projects) {
        const pId = project.id;
        const safePId = pId.replace(/[^a-zA-Z0-9-_]/g, '_');
        const projectPrefix = `${userId}/${safePId}/`;
        
        projectBreakdown[pId] = {
          total: 0,
          album: 0,
          drafts: 0,
          workflow: 0,
          orphans: 0,
          name: project.name
        };

        // Track sub-categories in project
        const projectReferencedKeys = new Map<string, string>();

        project.album.forEach(item => {
          if (item.imageUrl && !item.imageUrl.startsWith('http')) projectReferencedKeys.set(item.imageUrl, 'album');
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) projectReferencedKeys.set(item.thumbnailUrl, 'album');
          if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) projectReferencedKeys.set(item.optimizedUrl, 'album');
        });

        project.jobs.forEach(job => {
          if (job.imageUrl && !job.imageUrl.startsWith('http')) {
            // Only add if not already in album (album takes priority)
            if (!projectReferencedKeys.has(job.imageUrl)) projectReferencedKeys.set(job.imageUrl, 'drafts');
          }
          if (job.thumbnailUrl && !job.thumbnailUrl.startsWith('http')) {
            if (!projectReferencedKeys.has(job.thumbnailUrl)) projectReferencedKeys.set(job.thumbnailUrl, 'drafts');
          }
          if (job.optimizedUrl && !job.optimizedUrl.startsWith('http')) {
            if (!projectReferencedKeys.has(job.optimizedUrl)) projectReferencedKeys.set(job.optimizedUrl, 'drafts');
          }
        });

        project.workflow.forEach(item => {
          if (item.type === 'image' && item.value && !item.value.startsWith('http') && !item.value.startsWith('data:')) {
            if (!projectReferencedKeys.has(item.value)) projectReferencedKeys.set(item.value, 'workflow');
            if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('http')) {
              if (!projectReferencedKeys.has(item.thumbnailUrl)) projectReferencedKeys.set(item.thumbnailUrl, 'workflow');
            }
            if (item.optimizedUrl && !item.optimizedUrl.startsWith('http')) {
              if (!projectReferencedKeys.has(item.optimizedUrl)) projectReferencedKeys.set(item.optimizedUrl, 'workflow');
            }
          }
        });

        // Store project-level references globally
        for (const [key, cat] of projectReferencedKeys) {
          referencedKeys.set(key, `project:${pId}:${cat}`);
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
            const pId = parts[1];
            const cat = parts[2] as 'album' | 'drafts' | 'workflow';
            if (projectBreakdown[pId]) {
              projectBreakdown[pId].total += size;
              projectBreakdown[pId][cat] += size;
            }
          }
        } else {
          // Check if it belongs to a project folder (Orphan)
          const matchedProject = projects.find(p => {
             const safePId = p.id.replace(/[^a-zA-Z0-9-_]/g, '_');
             return obj.key.startsWith(`${userId}/${safePId}/`);
          });

          if (matchedProject) {
            projectBreakdown[matchedProject.id].total += size;
            projectBreakdown[matchedProject.id].orphans += size;
          } else {
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
