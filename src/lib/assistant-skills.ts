import {
  createLibrary,
  fetchLibraries,
  fetchLibrary,
} from '../api';
import type { Library } from '../types';

export const ASSISTANT_SKILLS_LIBRARY_NAME = 'Assistant Skills';
export const ASSISTANT_SKILLS_LIBRARY_STORAGE_KEY = 'assistant_skills_library_id';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredAssistantSkillsLibraryId() {
  if (!canUseStorage()) return '';
  return window.localStorage.getItem(ASSISTANT_SKILLS_LIBRARY_STORAGE_KEY) || '';
}

export function setStoredAssistantSkillsLibraryId(libraryId: string) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(ASSISTANT_SKILLS_LIBRARY_STORAGE_KEY, libraryId);
}

export async function resolveAssistantSkillsLibraryId(): Promise<string | null> {
  const storedLibraryId = getStoredAssistantSkillsLibraryId();

  if (storedLibraryId) {
    try {
      const storedLibrary = await fetchLibrary(storedLibraryId);
      if (storedLibrary.type === 'text') {
        return storedLibrary.id;
      }
    } catch {
      // Fall back to name lookup when the stored library no longer exists.
    }
  }

  const libraries = await fetchLibraries(1, 50, ASSISTANT_SKILLS_LIBRARY_NAME, false);
  const existingLibrary = libraries.items.find(
    (library) => library.type === 'text' && library.name === ASSISTANT_SKILLS_LIBRARY_NAME,
  );

  if (!existingLibrary) return null;

  setStoredAssistantSkillsLibraryId(existingLibrary.id);
  return existingLibrary.id;
}

export async function ensureAssistantSkillsLibrary(): Promise<Library> {
  const existingLibraryId = await resolveAssistantSkillsLibraryId();
  if (existingLibraryId) {
    return fetchLibrary(existingLibraryId);
  }

  const id = crypto.randomUUID();
  await createLibrary({
    id,
    name: ASSISTANT_SKILLS_LIBRARY_NAME,
    type: 'text',
  });
  setStoredAssistantSkillsLibraryId(id);
  return fetchLibrary(id);
}
