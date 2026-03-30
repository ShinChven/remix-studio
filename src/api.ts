import { AppData } from './types';

export async function loadData(): Promise<AppData> {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

export async function saveData(data: AppData): Promise<void> {
  const res = await fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save data');
}

export async function saveImage(base64: string, projectId: string): Promise<string> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, projectId }),
  });
  if (!res.ok) throw new Error('Failed to save image');
  const data = await res.json();
  return data.url;
}

export async function renameProjectFolder(oldId: string, newId: string): Promise<void> {
  const res = await fetch('/api/projects/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldId, newId }),
  });
  if (!res.ok) throw new Error('Failed to rename project folder');
}
