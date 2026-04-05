import { AppData, Library, LibraryItem, Project, AlbumItem, TrashItem } from '../../src/types';

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
  createLibraryItemsBatch(userId: string, libraryId: string, items: LibraryItem[]): Promise<void>;
  updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void>;
  deleteLibraryItem(userId: string, libraryId: string, itemId: string): Promise<void>;
  reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]): Promise<void>;

  // === Project CRUD ===
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(userId: string, projectId: string): Promise<Project | null>;
  createProject(userId: string, project: Project): Promise<void>;
  updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void>;
  deleteProject(userId: string, projectId: string): Promise<void>;

  // === Album CRUD ===
  addAlbumItem(userId: string, projectId: string, item: AlbumItem): Promise<void>;
  deleteAlbumItem(userId: string, projectId: string, itemId: string): Promise<AlbumItem | null>;

  // === Export CRUD ===
  getExportTasks(userId: string, projectId: string): Promise<any[]>;
  getAllExportTasks(userId: string, limit?: number, exclusiveStartKey?: any): Promise<{ items: any[]; nextCursor?: any }>;
  saveExportTask(userId: string, projectId: string, task: any): Promise<void>;
  deleteExportTask(userId: string, projectId: string, taskId: string): Promise<void>;

  // === Trash CRUD ===
  getTrashItems(userId: string): Promise<TrashItem[]>;
  moveToTrash(userId: string, projectId: string, itemId: string): Promise<void>;
  restoreTrashItem(userId: string, itemId: string): Promise<void>;
  deleteTrashPermanently(userId: string, itemId: string): Promise<string[]>; // Returns S3 keys (original, thumb, opt)
  emptyTrash(userId: string): Promise<string[]>; // Returns S3 keys

  // === Legacy (for migration/import) ===
  getUserData(userId: string): Promise<AppData>;
  saveAllData(data: AppData): Promise<void>;
  autoImportJson(dataDir: string): Promise<void>;
}
