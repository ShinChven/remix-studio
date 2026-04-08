import { AppData, Library, LibraryItem, Project, Provider, ProviderType, User, UserDetail, UserRole, UserStatus, UserSummary, TrashItem, ExportTask, StorageAnalysis, PaginatedResult } from './types';

function getHeaders(isJson = true): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(res: Response, defaultError: string): Promise<T> {
  if (!res.ok) {
    let errorMsg = defaultError;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // Use default error if JSON parsing fails
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

// ========== Auth / Account ==========

export async function fetchCurrentUser(): Promise<User> {
  const res = await fetch('/api/auth/me', { headers: getHeaders(false) });
  const data = await handleResponse<{ user: User }>(res, 'Failed to load account');
  return data.user;
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/password', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update password');
  }
}

// ========== Legacy bulk load (used for initial data fetch) ==========

export async function loadData(): Promise<AppData> {
  const res = await fetch('/api/data', { headers: getHeaders(false) });
  return handleResponse<AppData>(res, 'Failed to load data');
}

// ========== Library CRUD ==========

export async function fetchLibraries(page: number = 1, limit: number = 50): Promise<import('./types').PaginatedResult<Library>> {
  const params = new URLSearchParams();
  if (page) params.set('page', page.toString());
  if (limit) params.set('limit', limit.toString());
  
  const res = await fetch(`/api/libraries?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<import('./types').PaginatedResult<Library>>(res, 'Failed to list libraries');
}

export async function fetchLibrary(id: string): Promise<Library> {
  const res = await fetch(`/api/libraries/${id}`, { headers: getHeaders(false) });
  return handleResponse<Library>(res, 'Failed to get library');
}

export async function createLibrary(library: { id: string; name: string; type: string }): Promise<void> {
  const res = await fetch('/api/libraries', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(library),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create library');
  }
}

export async function updateLibrary(id: string, updates: { name?: string; type?: string }): Promise<void> {
  const res = await fetch(`/api/libraries/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update library');
  }
}

export async function deleteLibrary(id: string): Promise<void> {
  const res = await fetch(`/api/libraries/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete library');
  }
}

export async function fetchLibraryReferences(libraryId: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`/api/libraries/${libraryId}/references`, { headers: getHeaders(false) });
  return handleResponse<{ id: string; name: string }[]>(res, 'Failed to check library references');
}

export async function removeLibraryReferences(libraryId: string, projectIds?: string[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/remove-references`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ projectIds }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to remove library references');
  }
}

// ========== Library Item CRUD ==========

export async function fetchLibraryItems(libraryId: string): Promise<LibraryItem[]> {
  const res = await fetch(`/api/libraries/${libraryId}/items`, { headers: getHeaders(false) });
  return handleResponse<LibraryItem[]>(res, 'Failed to list items');
}

export async function createLibraryItem(libraryId: string, item: LibraryItem): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create item');
  }
}

export async function createLibraryItemsBatch(libraryId: string, items: LibraryItem[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/batch`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(items),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create items batch');
  }
}

export async function updateLibraryItem(libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/${itemId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update item');
  }
}

export async function updateLibraryItemOrders(libraryId: string, updates: { id: string; order: number }[]): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/reorder`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to reorder items');
  }
}

export async function deleteLibraryItem(libraryId: string, itemId: string): Promise<void> {
  const res = await fetch(`/api/libraries/${libraryId}/items/${itemId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete item');
  }
}

// ========== Project CRUD ==========

export async function fetchProjects(
  page: number = 1,
  limit: number = 50,
  sort: 'createdAt' | 'totalSize' = 'createdAt'
): Promise<import('./types').PaginatedResult<Project>> {
  const params = new URLSearchParams();
  if (page) params.set('page', page.toString());
  if (limit) params.set('limit', limit.toString());
  if (sort) params.set('sort', sort);

  const res = await fetch(`/api/projects?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<import('./types').PaginatedResult<Project>>(res, 'Failed to list projects');
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, { headers: getHeaders(false) });
  return handleResponse<Project>(res, 'Failed to get project');
}

export async function createProject(project: Project): Promise<void> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create project');
  }
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update project');
  }
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete project');
  }
}

export interface OrphanFile {
  key: string;
  url: string;
  size?: number;
}

export async function fetchProjectOrphans(projectId: string): Promise<OrphanFile[]> {
  const res = await fetch(`/api/projects/${projectId}/orphans`, { headers: getHeaders(false) });
  return handleResponse<OrphanFile[]>(res, 'Failed to fetch orphan files');
}

export async function deleteProjectOrphansBatch(projectId: string, keys: string[]): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/orphans/batch`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete orphan files');
  }
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
  return handleResponse<{ 
    key: string; 
    url: string;
    thumbnailKey: string;
    thumbnailUrl: string;
    optimizedKey: string;
    optimizedUrl: string;
    size: number;
  }>(res, 'Failed to save image');
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
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to rename project folder');
  }
}

// ========== Admin ==========

export async function getUsers(params: {
  q?: string;
  role?: UserRole | 'all';
  status?: UserStatus | 'all';
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'email';
  sortOrder?: 'asc' | 'desc';
} = {}): Promise<PaginatedResult<UserSummary>> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.role && params.role !== 'all') search.set('role', params.role);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  if (params.page) search.set('page', params.page.toString());
  if (params.pageSize) search.set('pageSize', params.pageSize.toString());
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortOrder) search.set('sortOrder', params.sortOrder);

  const res = await fetch(`/api/admin/users?${search.toString()}`, { headers: getHeaders(false) });
  return handleResponse<PaginatedResult<UserSummary>>(res, 'Failed to load users');
}

export async function createUser(data: {
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  storageLimit: number;
}): Promise<{ user: User }> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<{ user: User }>(res, 'Failed to create user');
}

export async function getUserDetail(id: string): Promise<UserDetail> {
  const res = await fetch(`/api/admin/users/${id}`, { headers: getHeaders(false) });
  return handleResponse<UserDetail>(res, 'Failed to load user detail');
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update role');
  }
}

export async function updateUserStorageLimit(id: string, limit: number): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/storage-limit`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ limit }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update storage limit');
  }
}

export async function updateUserStatus(id: string, status: UserStatus): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update user status');
  }
}

export async function adminResetUserPassword(id: string, newPassword: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/password`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to reset password');
  }
}

// ========== Providers ==========

export async function fetchProviders(): Promise<Provider[]> {
  const res = await fetch('/api/providers', { headers: getHeaders(false) });
  return handleResponse<Provider[]>(res, 'Failed to list providers');
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
  const result = await handleResponse<{ id: string }>(res, 'Failed to create provider');
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
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update provider');
  }
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await fetch(`/api/providers/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete provider');
  }
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
  return handleResponse<{ image: string }>(res, 'Failed to generate image');
}

export async function runProjectWorkflow(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/run`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to run project workflow');
  }
}

// ========== Trash CRUD ==========

export async function fetchTrash(): Promise<TrashItem[]> {
  const res = await fetch('/api/trash', { headers: getHeaders(false) });
  return handleResponse<TrashItem[]>(res, 'Failed to fetch trash');
}

export async function moveToTrash(projectId: string, itemId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/album/${itemId}/trash`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to move item to trash');
  }
}

export async function moveToTrashBatch(projectId: string, ids: string[]): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/album/trash-batch`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to move items to trash');
  }
}

export async function restoreTrashItem(id: string): Promise<void> {
  const res = await fetch(`/api/trash/${id}/restore`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to restore item');
  }
}

export async function restoreTrashBatch(ids: string[]): Promise<void> {
  const res = await fetch('/api/trash/restore-batch', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to restore items');
  }
}

export async function deleteTrashPermanently(id: string): Promise<void> {
  const res = await fetch(`/api/trash/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete item permanently');
  }
}

export async function deleteTrashBatch(ids: string[]): Promise<void> {
  const res = await fetch('/api/trash/batch', {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete items permanently');
  }
}

export async function emptyTrash(): Promise<void> {
  const res = await fetch('/api/trash/empty', {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to empty trash');
  }
}

export async function startAlbumExport(projectId: string, itemIds?: string[]): Promise<{ taskId: string }> {
  const res = await fetch(`/api/projects/${projectId}/export`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ itemIds }),
  });
  return handleResponse<{ taskId: string }>(res, 'Failed to start export');
}

export async function fetchExportStatus(projectId: string, taskId: string): Promise<ExportTask> {
  const res = await fetch(`/api/projects/${projectId}/export/${taskId}`, { headers: getHeaders(false) });
  return handleResponse<ExportTask>(res, 'Failed to get export status');
}

export async function fetchProjectExports(projectId: string): Promise<ExportTask[]> {
  const res = await fetch(`/api/projects/${projectId}/exports`, { headers: getHeaders(false) });
  return handleResponse<ExportTask[]>(res, 'Failed to list exports');
}

export async function fetchAllExports(limit?: number, cursor?: string): Promise<{ items: ExportTask[]; nextCursor?: string }> {
  const url = new URL('/api/exports', window.location.origin);
  if (limit) url.searchParams.set('limit', limit.toString());
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString(), { headers: getHeaders(false) });
  return handleResponse<{ items: ExportTask[]; nextCursor?: string }>(res, 'Failed to list all exports');
}

export async function deleteExport(taskId: string): Promise<void> {
  const res = await fetch(`/api/exports/${taskId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete export');
  }
}

/** @deprecated use deleteExport(taskId) instead */
export async function deleteProjectExport(projectId: string, taskId: string): Promise<void> {
  return deleteExport(taskId);
}

// ========== Storage ==========

export async function fetchStorageAnalysis(options?: { includeProjects?: boolean }): Promise<StorageAnalysis> {
  const params = new URLSearchParams();
  if (options?.includeProjects === false) params.set('includeProjects', 'false');

  const query = params.toString();
  const res = await fetch(`/api/storage/analysis${query ? `?${query}` : ''}`, { headers: getHeaders(false) });
  return handleResponse<StorageAnalysis>(res, 'Failed to analyze storage');
}
