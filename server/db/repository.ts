import { AppData, Library, LibraryItem, Project } from '../../src/types';

export interface IRepository {
  // === Library CRUD ===
  getUserLibraries(userId: string): Promise<Library[]>;
  getLibrary(userId: string, libraryId: string): Promise<Library | null>;
  createLibrary(userId: string, library: Omit<Library, 'items'>): Promise<void>;
  updateLibrary(userId: string, libraryId: string, updates: { name?: string; type?: string }): Promise<void>;
  deleteLibrary(userId: string, libraryId: string): Promise<void>;

  // === Library Item CRUD ===
  getLibraryItems(userId: string, libraryId: string): Promise<LibraryItem[]>;
  createLibraryItem(userId: string, libraryId: string, item: LibraryItem): Promise<void>;
  updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void>;
  deleteLibraryItem(userId: string, libraryId: string, itemId: string): Promise<void>;

  // === Project CRUD ===
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(userId: string, projectId: string): Promise<Project | null>;
  createProject(userId: string, project: Project): Promise<void>;
  updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void>;
  deleteProject(userId: string, projectId: string): Promise<void>;

  // === Legacy (for migration/import) ===
  getUserData(userId: string): Promise<AppData>;
  saveAllData(data: AppData): Promise<void>;
  autoImportJson(dataDir: string): Promise<void>;
}
