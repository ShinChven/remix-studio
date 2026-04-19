import { AppData, InviteCode, Library, LibraryItem, PasskeySummary, Project, Provider, ProviderType, SecuritySettings, User, UserDetail, UserRole, UserStatus, UserSummary, TrashItem, ExportTask, StorageAnalysis, PaginatedResult, CustomModelAlias } from './types';

function getHeaders(isJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

// ─── Token Refresh Interceptor ───────────────────────────────────────────────
// Prevents "refresh storm": all concurrent 401s share a single refresh attempt.
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

/**
 * Wraps fetch with an automatic silent refresh on 401.
 * If the token has expired, it calls /api/auth/refresh once, then retries.
 * If refresh fails, it redirects to login.
 */
// Pre-login endpoints that must never trigger a refresh (would cause loops).
// Only list paths used BEFORE the user has a session — not management endpoints
// like 2FA setup or passkey registration, which need refresh to stay alive.
const AUTH_FLOW_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/2fa/verify-login',   // login-time 2FA verification
  '/api/auth/passkeys/login',     // passkey login flow
  '/api/auth/google/',            // OAuth login flow
];

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...options, credentials: 'include' });

  if (res.status === 401) {
    // Only skip refresh for core auth flow endpoints, not business endpoints like google-drive
    if (AUTH_FLOW_PREFIXES.some(p => url.startsWith(p))) return res;

    const refreshed = await attemptRefresh();
    if (refreshed) {
      // Retry the original request with fresh token (cookie is now updated)
      return fetch(url, { ...options, credentials: 'include' });
    } else {
      // Refresh failed — redirect to login (but not if already there, to avoid loops)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return res;
    }
  }

  return res;
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
  const res = await apiFetch('/api/auth/me', { headers: getHeaders(false) });
  const data = await handleResponse<{ user: User }>(res, 'Failed to load account');
  return data.user;
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/password', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update password');
  }
}

export async function removePassword(currentPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/password', {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ currentPassword }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to remove password');
  }
}

export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  const res = await apiFetch('/api/auth/security', { headers: getHeaders(false) });
  return handleResponse<SecuritySettings>(res, 'Failed to load security settings');
}

export async function beginPasskeyRegistration(name: string): Promise<{ options: any; flowToken: string }> {
  const res = await apiFetch('/api/auth/passkeys/register/options', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  return handleResponse<{ options: any; flowToken: string }>(res, 'Failed to start passkey registration');
}

export async function finishPasskeyRegistration(flowToken: string, credential: any): Promise<{ passkey: PasskeySummary }> {
  const res = await apiFetch('/api/auth/passkeys/register/verify', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ flowToken, credential }),
  });
  return handleResponse<{ passkey: PasskeySummary }>(res, 'Failed to register passkey');
}

export async function removePasskey(passkeyId: string): Promise<void> {
  const res = await apiFetch(`/api/auth/passkeys/${passkeyId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to remove passkey');
  }
}

export async function beginPasskeyLogin(email?: string): Promise<{ options: any; flowToken: string }> {
  const res = await fetch('/api/auth/passkeys/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse<{ options: any; flowToken: string }>(res, 'Failed to start passkey login');
}

export async function finishPasskeyLogin(flowToken: string, credential: any): Promise<{ user: User }> {
  const res = await fetch('/api/auth/passkeys/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flowToken, credential }),
  });
  return handleResponse<{ user: User }>(res, 'Failed to finish passkey login');
}

export async function setupTwoFactor(password: string): Promise<{ secret: string; otpauthUri: string; expiresAt: number }> {
  const res = await apiFetch('/api/auth/2fa/setup', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ password }),
  });
  return handleResponse<{ secret: string; otpauthUri: string; expiresAt: number }>(res, 'Failed to set up 2FA');
}

export async function enableTwoFactor(code: string): Promise<void> {
  const res = await apiFetch('/api/auth/2fa/enable', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to enable 2FA');
  }
}

export async function disableTwoFactor(password: string, code: string): Promise<void> {
  const res = await apiFetch('/api/auth/2fa/disable', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ password, code }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to disable 2FA');
  }
}

export async function verifyTwoFactorLogin(tempToken: string, code: string): Promise<{ user: User }> {
  const res = await fetch('/api/auth/2fa/verify-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, code }),
  });
  return handleResponse<{ user: User }>(res, 'Failed to verify 2FA login');
}

export async function completeGoogleRegistration(inviteCode: string): Promise<{ user: User; nextUrl: string }> {
  const res = await fetch('/api/auth/google/complete-registration', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ inviteCode }),
  });
  return handleResponse<{ user: User; nextUrl: string }>(res, 'Failed to complete Google registration');
}

// ========== Legacy bulk load (used for initial data fetch) ==========

export async function loadData(): Promise<AppData> {
  const res = await apiFetch('/api/data', { headers: getHeaders(false) });
  return handleResponse<AppData>(res, 'Failed to load data');
}

// ========== Library CRUD ==========

export async function fetchLibraries(page: number = 1, limit: number = 50, q?: string, includeItems: boolean = false): Promise<import('./types').PaginatedResult<Library>> {
  const params = new URLSearchParams();
  if (page) params.set('page', page.toString());
  if (limit) params.set('limit', limit.toString());
  if (q) params.set('q', q);
  if (includeItems) params.set('includeItems', 'true');

  const res = await apiFetch(`/api/libraries?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<import('./types').PaginatedResult<Library>>(res, 'Failed to list libraries');
}

export async function fetchLibrary(id: string): Promise<Library> {
  const res = await apiFetch(`/api/libraries/${id}`, { headers: getHeaders(false) });
  return handleResponse<Library>(res, 'Failed to get library');
}

export async function createLibrary(library: { id: string; name: string; type: string }): Promise<void> {
  const res = await apiFetch('/api/libraries', {
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
  const res = await apiFetch(`/api/libraries/${id}`, {
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
  const res = await apiFetch(`/api/libraries/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete library');
  }
}

export async function duplicateLibrary(id: string, name: string): Promise<Library> {
  const res = await apiFetch(`/api/libraries/${id}/duplicate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  return handleResponse<Library>(res, 'Failed to duplicate library');
}

export async function exportMediaLibraryZip(id: string, fileName: string): Promise<{ taskId: string }> {
  const res = await apiFetch(`/api/libraries/${id}/export`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ packageName: fileName }),
  });
  return handleResponse<{ taskId: string }>(res, 'Failed to export library');
}

export async function fetchLibraryReferences(libraryId: string): Promise<{ id: string; name: string }[]> {
  const res = await apiFetch(`/api/libraries/${libraryId}/references`, { headers: getHeaders(false) });
  return handleResponse<{ id: string; name: string }[]>(res, 'Failed to check library references');
}

export async function removeLibraryReferences(libraryId: string, projectIds?: string[]): Promise<void> {
  const res = await apiFetch(`/api/libraries/${libraryId}/remove-references`, {
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

export async function fetchLibraryItems(libraryId: string, page: number = 1, limit: number = 25, q?: string, tags: string[] = []): Promise<PaginatedResult<LibraryItem>> {
  const params = new URLSearchParams();
  params.set('page', page.toString());
  params.set('limit', limit.toString());
  if (q) params.set('q', q);
  tags.forEach((tag) => params.append('tag', tag));
  const res = await apiFetch(`/api/libraries/${libraryId}/items?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<PaginatedResult<LibraryItem>>(res, 'Failed to list items');
}

export async function createLibraryItem(libraryId: string, item: LibraryItem): Promise<void> {
  const res = await apiFetch(`/api/libraries/${libraryId}/items`, {
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
  const res = await apiFetch(`/api/libraries/${libraryId}/items/batch`, {
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
  const res = await apiFetch(`/api/libraries/${libraryId}/items/${itemId}`, {
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
  const res = await apiFetch(`/api/libraries/${libraryId}/items/reorder`, {
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
  const res = await apiFetch(`/api/libraries/${libraryId}/items/${itemId}`, {
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
  q?: string,
  status?: 'active' | 'archived' | 'all'
): Promise<import('./types').PaginatedResult<Project>> {
  const params = new URLSearchParams();
  if (page) params.set('page', page.toString());
  if (limit) params.set('limit', limit.toString());
  if (q) params.set('q', q);
  if (status) params.set('status', status);

  const res = await apiFetch(`/api/projects?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<import('./types').PaginatedResult<Project>>(res, 'Failed to list projects');
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await apiFetch(`/api/projects/${id}`, { headers: getHeaders(false) });
  return handleResponse<Project>(res, 'Failed to get project');
}

export async function createProject(project: Project): Promise<void> {
  const res = await apiFetch('/api/projects', {
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
  const res = await apiFetch(`/api/projects/${id}`, {
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
  const res = await apiFetch(`/api/projects/${id}`, {
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
  const res = await apiFetch(`/api/projects/${projectId}/orphans`, { headers: getHeaders(false) });
  return handleResponse<OrphanFile[]>(res, 'Failed to fetch orphan files');
}

export async function deleteProjectOrphansBatch(projectId: string, keys: string[]): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/orphans/batch`, {
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
  const res = await apiFetch('/api/images', {
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

export async function saveVideo(base64: string, projectId: string): Promise<{
  key: string;
  url: string;
  thumbnailKey: string;
  thumbnailUrl: string;
  optimizedKey: string;
  optimizedUrl: string;
  size: number;
}> {
  const res = await apiFetch('/api/videos', {
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
  }>(res, 'Failed to save video');
}

export async function saveAudio(base64: string, projectId: string): Promise<{
  key: string;
  url: string;
  size: number;
}> {
  const res = await apiFetch('/api/audios', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ base64, projectId }),
  });
  return handleResponse<{
    key: string;
    url: string;
    size: number;
  }>(res, 'Failed to save audio');
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
  const res = await apiFetch('/api/projects/rename', {
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

  const res = await apiFetch(`/api/admin/users?${search.toString()}`, { headers: getHeaders(false) });
  return handleResponse<PaginatedResult<UserSummary>>(res, 'Failed to load users');
}

export async function createUser(data: {
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  storageLimit: number;
}): Promise<{ user: User }> {
  const res = await apiFetch('/api/admin/users', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<{ user: User }>(res, 'Failed to create user');
}

export async function getUserDetail(id: string): Promise<UserDetail> {
  const res = await apiFetch(`/api/admin/users/${id}`, { headers: getHeaders(false) });
  return handleResponse<UserDetail>(res, 'Failed to load user detail');
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/role`, {
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
  const res = await apiFetch(`/api/admin/users/${id}/storage-limit`, {
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
  const res = await apiFetch(`/api/admin/users/${id}/status`, {
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
  const res = await apiFetch(`/api/admin/users/${id}/password`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to reset password');
  }
}

export async function getAdminInvites(): Promise<InviteCode[]> {
  const res = await apiFetch('/api/admin/invites', { headers: getHeaders(false) });
  const data = await handleResponse<{ items: InviteCode[] }>(res, 'Failed to load invite codes');
  return data.items;
}

export async function createAdminInvite(input?: { note?: string; maxUses?: number; membershipTier?: 'free' | 'professional' | 'premium' }): Promise<InviteCode> {
  const res = await apiFetch('/api/admin/invites', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(input ?? {}),
  });
  const data = await handleResponse<{ invite: InviteCode }>(res, 'Failed to create invite code');
  return data.invite;
}

export async function deleteAdminInvite(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/invites/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete invite code');
  }
}

// ========== Providers ==========

export async function fetchProviders(): Promise<Provider[]> {
  const res = await apiFetch('/api/providers', { headers: getHeaders(false) });
  return handleResponse<Provider[]>(res, 'Failed to list providers');
}

export async function fetchProvider(id: string): Promise<Provider> {
  const res = await apiFetch(`/api/providers/${id}`, { headers: getHeaders(false) });
  return handleResponse<Provider>(res, 'Failed to load provider');
}

export async function createProvider(data: {
  name: string;
  type: ProviderType;
  apiKey: string;
  apiSecret?: string;
  apiUrl?: string;
  concurrency?: number;
  customModels?: CustomModelAlias[];
}): Promise<string> {
  const res = await apiFetch('/api/providers', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  const result = await handleResponse<{ id: string }>(res, 'Failed to create provider');
  return result.id;
}

export async function updateProvider(
  id: string,
  updates: { name?: string; type?: ProviderType; apiKey?: string; apiSecret?: string; apiUrl?: string | null; concurrency?: number; customModels?: CustomModelAlias[] }
): Promise<void> {
  const res = await apiFetch(`/api/providers/${id}`, {
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
  const res = await apiFetch(`/api/providers/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete provider');
  }
}

export interface ProviderModelInfo {
  id: string;
  name: string;
  description?: string;
  category: 'text' | 'image' | 'video' | 'audio';
  supported: boolean;
}

export async function fetchProviderModels(providerId: string): Promise<{ models: ProviderModelInfo[]; error?: string }> {
  const res = await apiFetch(`/api/providers/${providerId}/models`, { headers: getHeaders(false) });
  return handleResponse<{ models: ProviderModelInfo[]; error?: string }>(res, 'Failed to list provider models');
}

// ========== AI Generation ==========

export async function generateImage(params: {
  providerId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  refImage?: string;
}): Promise<{ image: string }> {
  const res = await apiFetch('/api/generate', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<{ image: string }>(res, 'Failed to generate image');
}

export async function runProjectWorkflow(projectId: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/run`, {
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
  const res = await apiFetch('/api/trash', { headers: getHeaders(false) });
  return handleResponse<TrashItem[]>(res, 'Failed to fetch trash');
}

export async function moveToTrash(projectId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/album/${itemId}/trash`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to move item to trash');
  }
}

export async function moveToTrashBatch(projectId: string, ids: string[]): Promise<void> {
  const res = await apiFetch(`/api/projects/${projectId}/album/trash-batch`, {
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
  const res = await apiFetch(`/api/trash/${id}/restore`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to restore item');
  }
}

export async function restoreTrashBatch(ids: string[]): Promise<void> {
  const res = await apiFetch('/api/trash/restore-batch', {
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
  const res = await apiFetch(`/api/trash/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete item permanently');
  }
}

export async function deleteTrashBatch(ids: string[]): Promise<void> {
  const res = await apiFetch('/api/trash/batch', {
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
  const res = await apiFetch('/api/trash/empty', {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to empty trash');
  }
}

export async function startAlbumExport(projectId: string, itemIds?: string[], packageName?: string): Promise<{ taskId: string }> {
  const res = await apiFetch(`/api/projects/${projectId}/export`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ itemIds, packageName }),
  });
  return handleResponse<{ taskId: string }>(res, 'Failed to start export');
}

export async function copyAlbumToLibrary(
  projectId: string,
  params: {
    itemIds: string[];
    version?: 'raw' | 'optimized';
    destinationLibraryId?: string;
    newLibraryName?: string;
  }
): Promise<{ libraryId: string }> {
  const res = await apiFetch(`/api/projects/${projectId}/album/copy-to-library`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<{ libraryId: string }>(res, 'Failed to copy to library');
}

export async function fetchExportStatus(projectId: string, taskId: string): Promise<ExportTask> {
  const res = await apiFetch(`/api/projects/${projectId}/export/${taskId}`, { headers: getHeaders(false) });
  return handleResponse<ExportTask>(res, 'Failed to get export status');
}

export async function fetchProjectExports(projectId: string): Promise<ExportTask[]> {
  const res = await apiFetch(`/api/projects/${projectId}/exports`, { headers: getHeaders(false) });
  return handleResponse<ExportTask[]>(res, 'Failed to list exports');
}

export async function fetchAllExports(limit?: number, cursor?: string): Promise<{ items: ExportTask[]; nextCursor?: string }> {
  const url = new URL('/api/exports', window.location.origin);
  if (limit) url.searchParams.set('limit', limit.toString());
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await apiFetch(url.toString(), { headers: getHeaders(false) });
  return handleResponse<{ items: ExportTask[]; nextCursor?: string }>(res, 'Failed to list all exports');
}

export async function deleteExport(taskId: string): Promise<void> {
  const res = await apiFetch(`/api/exports/${taskId}`, {
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

// ========== Google Drive ==========

export async function fetchGoogleDriveStatus(): Promise<{ connected: boolean }> {
  const res = await apiFetch('/api/auth/google-drive/status', { headers: getHeaders(false) });
  return handleResponse<{ connected: boolean }>(res, 'Failed to check Google Drive status');
}

export async function disconnectGoogleDrive(): Promise<void> {
  const res = await apiFetch('/api/auth/google-drive/disconnect', {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to disconnect Google Drive');
  }
}

/** Submit a Drive upload job. Returns deliveryTaskId — poll fetchDeliveryStatus() for progress. */
export async function uploadExportToDrive(taskId: string): Promise<{ deliveryTaskId: string }> {
  const res = await apiFetch(`/api/exports/${taskId}/upload-to-drive`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse<{ deliveryTaskId: string }>(res, 'Failed to submit Drive upload job');
}

export interface DeliveryStatus {
  id: string;
  exportTaskId: string;
  destination: 'drive';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytesTransferred: number;
  totalBytes?: number;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  createdAt: number;
}

export async function fetchDeliveryStatus(deliveryId: string): Promise<DeliveryStatus> {
  const res = await apiFetch(`/api/deliveries/${deliveryId}`, { headers: getHeaders(false) });
  return handleResponse<DeliveryStatus>(res, 'Failed to get delivery status');
}

export async function fetchActiveDeliveries(): Promise<DeliveryStatus[]> {
  const res = await apiFetch('/api/deliveries', { headers: getHeaders(false) });
  return handleResponse<DeliveryStatus[]>(res, 'Failed to list delivery tasks');
}

// ========== MCP / OAuth Clients ==========

export interface OAuthClientSummary {
  id: string;
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  scope: string | null;
  activeTokens: number;
  createdAt: number;
  isOwned: boolean;
}

export interface PersonalAccessTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: string;
  lastUsedAt: number | null;
  expiresAt: number | null;
  expired: boolean;
  createdAt: number;
}

export interface OAuthClientRegistrationResult {
  client_id: string;
  client_id_issued_at: number;
  client_secret?: string;
  client_secret_expires_at: number;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
  scope: string;
}

export async function fetchOAuthClients(): Promise<OAuthClientSummary[]> {
  const res = await apiFetch('/api/oauth/clients', { headers: getHeaders(false) });
  return handleResponse<OAuthClientSummary[]>(res, 'Failed to load OAuth clients');
}

export async function registerOAuthClient(input: {
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  scope?: string;
}): Promise<OAuthClientRegistrationResult> {
  const res = await apiFetch('/register', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      client_name: input.clientName?.trim() || undefined,
      redirect_uris: input.redirectUris,
      token_endpoint_auth_method: input.tokenEndpointAuthMethod ?? 'client_secret_basic',
      scope: input.scope ?? 'mcp:tools',
    }),
  });
  return handleResponse<OAuthClientRegistrationResult>(res, 'Failed to register OAuth client');
}

export async function updateOAuthClientRedirectUris(clientId: string, redirectUris: string[]): Promise<OAuthClientSummary> {
  const res = await apiFetch(`/api/oauth/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ redirect_uris: redirectUris }),
  });
  return handleResponse<OAuthClientSummary>(res, 'Failed to update OAuth client');
}

export async function revokeOAuthClient(clientId: string): Promise<void> {
  const res = await apiFetch(`/api/oauth/clients/${encodeURIComponent(clientId)}/revoke`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });
  await handleResponse<{ success: boolean }>(res, 'Failed to revoke client');
}

export async function fetchPersonalAccessTokens(): Promise<PersonalAccessTokenSummary[]> {
  const res = await apiFetch('/api/oauth/tokens', { headers: getHeaders(false) });
  return handleResponse<PersonalAccessTokenSummary[]>(res, 'Failed to load tokens');
}

export async function createPersonalAccessToken(name: string, expiresInDays?: number): Promise<{ token: string; name: string; tokenPrefix: string }> {
  const res = await apiFetch('/api/oauth/tokens', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, expiresInDays: expiresInDays ?? null }),
  });
  return handleResponse<{ token: string; name: string; tokenPrefix: string }>(res, 'Failed to create token');
}

export async function revokePersonalAccessToken(id: string): Promise<void> {
  const res = await apiFetch(`/api/oauth/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(false),
  });
  await handleResponse<{ success: boolean }>(res, 'Failed to revoke token');
}

// ========== Storage ==========

export async function fetchStorageAnalysis(options?: { includeProjects?: boolean }): Promise<StorageAnalysis> {
  const params = new URLSearchParams();
  if (options?.includeProjects === false) params.set('includeProjects', 'false');

  const query = params.toString();
  const res = await apiFetch(`/api/storage/analysis${query ? `?${query}` : ''}`, { headers: getHeaders(false) });
  return handleResponse<StorageAnalysis>(res, 'Failed to analyze storage');
}

// ========== Assistant Chat ==========

export interface AssistantConversation {
  id: string;
  userId: string;
  title: string;
  providerId: string | null;
  modelConfigId: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface AssistantToolCallData {
  id: string;
  name: string;
  arguments: unknown;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls: AssistantToolCallData[] | null;
  toolCallId: string | null;
  toolName: string | null;
  toolArgsJson: unknown | null;
  toolResultJson: unknown | null;
  status: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorText: string | null;
  createdAt: number;
}

export interface AssistantPendingConfirmation {
  id: string;
  conversationId: string;
  messageId: string;
  toolCallId: string;
  toolName: string;
  toolArgsJson: unknown;
  status: string;
  expiresAt: number;
  createdAt: number;
}

export interface AssistantStatusEvent {
  type: string;
  [key: string]: unknown;
}

export type AssistantTurnResult =
  | { kind: 'final'; message: AssistantMessage; statusEvents: AssistantStatusEvent[] }
  | { kind: 'awaiting_confirmation'; message: AssistantMessage; confirmation: AssistantPendingConfirmation; statusEvents: AssistantStatusEvent[] }
  | { kind: 'error'; error: string; message: AssistantMessage | null; statusEvents: AssistantStatusEvent[] };

export async function fetchAssistantConversations(cursor?: string, limit?: number): Promise<{ conversations: AssistantConversation[] }> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', limit.toString());
  const res = await apiFetch(`/api/assistant/conversations?${params.toString()}`, { headers: getHeaders(false) });
  return handleResponse<{ conversations: AssistantConversation[] }>(res, 'Failed to list conversations');
}

export async function createAssistantConversation(data: {
  providerId?: string;
  modelConfigId?: string;
  title?: string;
}): Promise<{ conversation: AssistantConversation }> {
  const res = await apiFetch('/api/assistant/conversations', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<{ conversation: AssistantConversation }>(res, 'Failed to create conversation');
}

export async function fetchAssistantConversation(id: string): Promise<{
  conversation: AssistantConversation;
  messages: AssistantMessage[];
}> {
  const res = await apiFetch(`/api/assistant/conversations/${id}`, { headers: getHeaders(false) });
  return handleResponse<{ conversation: AssistantConversation; messages: AssistantMessage[] }>(res, 'Failed to get conversation');
}

export async function updateAssistantConversation(id: string, updates: {
  title?: string;
  providerId?: string | null;
  modelConfigId?: string | null;
  archived?: boolean;
}): Promise<{ conversation: AssistantConversation }> {
  const res = await apiFetch(`/api/assistant/conversations/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  return handleResponse<{ conversation: AssistantConversation }>(res, 'Failed to update conversation');
}

export async function deleteAssistantConversation(id: string): Promise<void> {
  const res = await apiFetch(`/api/assistant/conversations/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to delete conversation');
  }
}

export async function sendAssistantMessage(conversationId: string, content: string): Promise<AssistantTurnResult> {
  const res = await apiFetch(`/api/assistant/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });
  return handleResponse<AssistantTurnResult>(res, 'Failed to send message');
}

export async function confirmAssistantTool(
  conversationId: string,
  confirmationId: string,
  decision: 'confirm' | 'cancel',
): Promise<AssistantTurnResult> {
  const res = await apiFetch(`/api/assistant/conversations/${conversationId}/confirm`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ confirmationId, decision }),
  });
  return handleResponse<AssistantTurnResult>(res, 'Failed to process confirmation');
}

export async function fetchAssistantProviders(): Promise<{ providers: Provider[] }> {
  const res = await apiFetch('/api/assistant/providers', { headers: getHeaders(false) });
  return handleResponse<{ providers: Provider[] }>(res, 'Failed to list assistant providers');
}
