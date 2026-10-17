-- Lists sorted newest first. Each composite index leads with the column the
-- index it replaces covered, so lookups by that column alone still use it.
CREATE INDEX "AlbumItem_projectId_createdAt_idx" ON "AlbumItem"("projectId", "createdAt");
DROP INDEX "AlbumItem_projectId_idx";

CREATE INDEX "ExportTask_userId_createdAt_idx" ON "ExportTask"("userId", "createdAt");
DROP INDEX "ExportTask_userId_idx";

CREATE INDEX "TrashItem_userId_deletedAt_idx" ON "TrashItem"("userId", "deletedAt");
DROP INDEX "TrashItem_userId_idx";

-- Foreign keys PostgreSQL does not index on its own: listing a campaign's
-- posts, loading a post's executions, and the cascades behind deleting an
-- export, post or social account all scanned these tables whole.
CREATE INDEX "DeliveryTask_exportTaskId_idx" ON "DeliveryTask"("exportTaskId");
CREATE INDEX "Post_campaignId_idx" ON "Post"("campaignId");
CREATE INDEX "Post_userId_status_idx" ON "Post"("userId", "status");
CREATE INDEX "PostExecution_postId_idx" ON "PostExecution"("postId");
CREATE INDEX "PostExecution_socialAccountId_idx" ON "PostExecution"("socialAccountId");
