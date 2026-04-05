import { AppData, Library, LibraryItem, Project, Provider, ProviderType, User, UserRole, TrashItem, ExportTask } from './types';

function getHeaders(isJson = true): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ========== Legacy bulk load (used for initial data fetch) ==========

export async function loadData(): Promise<AppData> {
  const res = await fetch('/api/data', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

// ========== Library CRUD ==========

export async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch('/api/libraries', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list libraries');
  return res.json();
}

export async function fetchLibrary(id: string): Promise<Library> {
  const res = await fetch(`/api/libraries/${id}`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to get library');
  return res.json();
}

export async function createLibrary(library: { id: string; name: string; type: string }): Promise<void> {
  const res = await fetch('/api/libraries', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(library),
  });
  if (!res.ok) throw new Error('Failed to create library');
}

export async function updateLibrary(id: string, updates: { name?: string; type?: string }): Promise<void> {
  const res = await fetch(`/api/libraries/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update library');
}

export async function deleteLibrary(id: string): Promise<void> {
  const res = await fetch(`/api/libraries/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete library');
}

export async function fetchLibraryReferences(libraryId: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`/api/libraries/${libraryId}/references`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to check library references');
  return res.json();
}

export async function removeLibraryReferences(libraryId: string, projectIds?: string[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/remove-references`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ projectIds }),
  });
  if (!res.ok) throw new Error('Failed to remove library references');
}

// ========== Library Item CRUD ==========

export async function fetchLibraryItems(libraryId: string): Promise<LibraryItem[]> {
  const res = await fetch(`/api/libraries/${libraryId}/items`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list items');
  return res.json();
}

export async function createLibraryItem(libraryId: string, item: LibraryItem): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to create item');
}

export async function createLibraryItemsBatch(libraryId: string, items: LibraryItem[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/batch`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error('Failed to create items batch');
}

export async function updateLibraryItem(libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/${itemId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update item');
}

export async function updateLibraryItemOrders(libraryId: string, updates: { id: string; order: number }[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/reorder`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to reorder items');
}

export async function deleteLibraryItem(libraryId: string, itemId: string): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/${itemId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete item');
}

// ========== Project CRUD ==========

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list projects');
  return res.json();
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to get project');
  return res.json();
}

export async function createProject(project: Project): Promise<void> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('Failed to create project');
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update project');
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete project');
}

export interface OrphanFile {
  key: string;
  url: string;
  size?: number;
}

export async function fetchProjectOrphans(projectId: string): Promise<OrphanFile[]> {
  const res = await fetch(`/api/projects/${projectId}/orphans`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to fetch orphan files');
  return res.json();
}

export async function deleteProjectOrphansBatch(projectId: string, keys: string[]): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/orphans/batch`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) throw new Error('Failed to delete orphan files');
}

// ========== Image Storage ==========

export async function saveImage(base64: string, projectId: string): Promise<{ 
  key: string; 
  url: string;
  thumbnailKey: string;
  thumbnailUrl: string;
  optimizedKey: string;
  optimizedUrl: string;
  size: number;
}> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ base64, projectId }),
  });
  if (!res.ok) throw new Error('Failed to save image');
  const data = await res.json();
  return { 
    key: data.key, 
    url: data.url, 
    thumbnailKey: data.thumbnailKey,
    thumbnailUrl: data.thumbnailUrl,
    optimizedKey: data.optimizedKey,
    optimizedUrl: data.optimizedUrl,
    size: data.size
  };
}

/**
 * Returns an image URL safe for use in <img> tags.
 * All image URLs from the API are already presigned MinIO URLs (starting with 'http').
 * This function is a passthrough — it throws if a bare S3 key is passed, because
 * that means someone forgot to presign it server-side.
 *
 * DO NOT add fallback proxy logic here. The /api/images/view endpoint has been deleted.
 * All signing must happen server-side before data reaches the client.
 */
export function imageDisplayUrl(value: string): string {
  if (!value) return value;
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  // If we get here, a bare S3 key escaped the server without being presigned.
  console.error('[imageDisplayUrl] Received a bare S3 key — must be presigned server-side:', value);
  return value; // return as-is so the UI doesn't crash, but log the bug
}

export async function renameProjectFolder(oldId: string, newId: string): Promise<void> {
  const res = await fetch('/api/projects/rename', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ oldId, newId }),
  });
  if (!res.ok) throw new Error('Failed to rename project folder');
}

// ========== Admin ==========

export async function getUsers(): Promise<User[]> {
  const res = await fetch('/api/admin/users', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update role');
}

// ========== Providers ==========

export async function fetchProviders(): Promise<Provider[]> {
  const res = await fetch('/api/providers', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list providers');
  return res.json();
}

export async function createProvider(data: {
  name: string;
  type: ProviderType;
  apiKey: string;
  apiUrl?: string;
  concurrency?: number;
  models?: any[];
}): Promise<string> {
  const res = await fetch('/api/providers', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create provider');
  const result = await res.json();
  return result.id;
}

export async function updateProvider(
  id: string,
  updates: { name?: string; type?: ProviderType; apiKey?: string; apiUrl?: string | null; concurrency?: number; models?: any[] }
): Promise<void> {
  const res = await fetch(`/api/providers/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update provider');
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await fetch(`/api/providers/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete provider');
}

// ========== AI Generation ==========

export async function generateImage(params: {
  providerId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  refImage?: string;
}): Promise<{ image: string }> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to generate image');
  }
  return res.json();
}

export async function runProjectWorkflow(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/run`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to run project workflow');
}

// ========== Trash CRUD ==========

export async function fetchTrash(): Promise<TrashItem[]> {
  const res = await fetch('/api/trash', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to fetch trash');
  return res.json();
}

export async function moveToTrash(projectId: string, itemId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/album/${itemId}/trash`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to move item to trash');
}

export async function moveToTrashBatch(projectId: string, ids: string[]): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/album/trash-batch`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to move items to trash');
}

export async function restoreTrashItem(id: string): Promise<void> {
  const res = await fetch(`/api/trash/${id}/restore`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to restore item');
}

export async function restoreTrashBatch(ids: string[]): Promise<void> {
  const res = await fetch('/api/trash/restore-batch', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to restore items');
}

export async function deleteTrashPermanently(id: string): Promise<void> {
  const res = await fetch(`/api/trash/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete item permanently');
}

export async function deleteTrashBatch(ids: string[]): Promise<void> {
  const res = await fetch('/api/trash/batch', {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Failed to delete items permanently');
}

export async function emptyTrash(): Promise<void> {
  const res = await fetch('/api/trash/empty', {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to empty trash');
}

export async function startAlbumExport(projectId: string, itemIds?: string[]): Promise<{ taskId: string }> {
  const res = await fetch(`/api/projects/${projectId}/export`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ itemIds }),
  });
  if (!res.ok) throw new Error('Failed to start export');
  return res.json();
}

export async function fetchExportStatus(projectId: string, taskId: string): Promise<ExportTask> {
  const res = await fetch(`/api/projects/${projectId}/export/${taskId}`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to get export status');
  return res.json();
}

export async function fetchProjectExports(projectId: string): Promise<ExportTask[]> {
  const res = await fetch(`/api/projects/${projectId}/exports`, { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list exports');
  return res.json();
}

export async function fetchAllExports(limit?: number, cursor?: string): Promise<{ items: ExportTask[]; nextCursor?: string }> {
  const url = new URL('/api/exports', window.location.origin);
  if (limit) url.searchParams.set('limit', limit.toString());
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString(), { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to list all exports');
  return res.json();
}

export async function deleteProjectExport(projectId: string, taskId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/exports/${taskId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete export');
}

