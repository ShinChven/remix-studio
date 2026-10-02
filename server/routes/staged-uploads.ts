import { Hono } from 'hono';
import { formatError } from '../utils/error-handler';
import {
  describeStagedUpload,
  receiveStagedUpload,
  StagedUploadError,
  type StagedUploadDependencies,
} from '../services/staged-uploads';

/**
 * Receives the bytes for an upload slot made by the create_upload MCP tool.
 * The single-use token in the URL is the only credential: the client sending
 * the file (often curl in an agent's shell) has no session or Bearer token.
 */
export function createStagedUploadRouter(deps: StagedUploadDependencies) {
  const router = new Hono();

  router.put('/api/staged-uploads/:id', async (c) => {
    const contentLengthHeader = c.req.header('content-length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;

    try {
      const upload = await receiveStagedUpload(
        deps,
        c.req.param('id'),
        c.req.query('token'),
        c.req.raw.body,
        Number.isFinite(contentLength) ? contentLength : undefined,
      );
      return c.json({
        ...describeStagedUpload(upload),
        next: 'Attach it with add_files_to_library, update_project, create_project_with_workflow, create_posts_from_files or add_media_to_post, passing this uploadId.',
      });
    } catch (error) {
      if (error instanceof StagedUploadError) {
        return c.json({ error: error.message }, error.status);
      }
      console.error('[PUT /api/staged-uploads/:id]', error);
      return c.json({ error: formatError(error, 'Failed to receive the upload') }, 500);
    }
  });

  return router;
}
