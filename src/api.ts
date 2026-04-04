import { AppData, Library, LibraryItem, Project, Provider, ProviderType, User, UserRole } from './types';

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

// ========== Image Storage ==========

export async function saveImage(base64: string, projectId: string): Promise<string> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ base64, projectId }),
  });
  if (!res.ok) throw new Error('Failed to save image');
  const data = await res.json();
  return data.url;
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
  updates: { name?: string; type?: ProviderType; apiKey?: string; apiUrl?: string | null }
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

