import { AppData, User, UserRole } from './types';

function getHeaders(isJson = true): HeadersInit {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function loadData(): Promise<AppData> {
  const res = await fetch('/api/data', { headers: getHeaders(false) });
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

export async function saveData(data: AppData): Promise<void> {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save data');
}

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
