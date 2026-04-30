import { AppData, Library, LibraryItem, LibraryType, Project, ProjectStatus, AlbumItem, TrashItem } from '../../src/types';

export interface IRepository {
  // === Library CRUD ===
  getUserLibraries(userId: string, page?: number, limit?: number, q?: string, includeItems?: boolean, type?: LibraryType): Promise<{ items: Library[], total: number, page: number, pages: number }>;
  getLibrary(userId: string, libraryId: string): Promise<Library | null>;
  createLibrary(userId: string, library: Omit<Library, 'items'>): Promise<void>;
  updateLibrary(userId: string, libraryId: string, updates: { name?: string; description?: string | null; type?: string }): Promise<void>;
  deleteLibrary(userId: string, libraryId: string): Promise<void>;
  setLibraryPinned(userId: string, libraryId: string, pinned: boolean): Promise<void>;
  countPinnedLibraries(userId: string): Promise<number>;

  // === Library Item CRUD ===
  getLibraryItems(userId: string, libraryId: string): Promise<LibraryItem[]>;
  getLibraryItemsByIds(userId: string, libraryId: string, itemIds: string[]): Promise<LibraryItem[]>;
  getLibraryItemsPaginated(userId: string, libraryId: string, page?: number, limit?: number, q?: string, tags?: string[]): Promise<{ items: LibraryItem[], total: number, page: number, pages: number }>;
  createLibraryItem(userId: string, libraryId: string, item: LibraryItem): Promise<void>;
  createLibraryItemsBatch(userId: string, libraryId: string, items: LibraryItem[]): Promise<void>;
  updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void>;
  deleteLibraryItem(userId: string, libraryId: string, itemId: string): Promise<void>;
  reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]): Promise<void>;

  // === Library Search ===
  searchLibraryItems(userId: string, query?: string, options?: { libraryId?: string; tags?: string[]; page?: number; limit?: number }): Promise<{ items: (LibraryItem & { libraryId: string; libraryName: string; libraryDescription?: string })[]; total: number; page: number; pages: number }>;

  // === Project CRUD ===
  getUserProjects(userId: string, page?: number, limit?: number, q?: string, status?: ProjectStatus | 'all'): Promise<{ items: Project[], total: number, page: number, pages: number }>;
  getProject(userId: string, projectId: string): Promise<Project | null>;
  createProject(userId: string, project: Project): Promise<void>;
  updateProject(userId: string, projectId: string, updates: Partial<Project>): Promise<void>;
  deleteProject(userId: string, projectId: string): Promise<void>;

  // === Album CRUD ===
  addAlbumItem(userId: string, projectId: string, item: AlbumItem): Promise<void>;
  deleteAlbumItem(userId: string, projectId: string, itemId: string): Promise<AlbumItem | null>;

  // === Export CRUD ===
  getExportTasks(userId: string, projectId: string): Promise<any[]>;
  getAllExportTasks(userId: string, limit?: number, cursor?: string): Promise<{ items: any[]; nextCursor?: string }>;
  getExportTask(userId: string, taskId: string): Promise<any | undefined>;
  saveExportTask(userId: string, taskId: string, data: any): Promise<void>;
  deleteExportTask(userId: string, taskId: string): Promise<void>;
  // Queue operations
  claimNextExportTask(workerId: string): Promise<any | null>;
  heartbeatExportTask(taskId: string): Promise<void>;
  reapStaleExportTasks(thresholdMinutes?: number): Promise<number>;

  // === Delivery Task CRUD + Queue ===
  saveDeliveryTask(userId: string, taskId: string, data: any): Promise<void>;
  getDeliveryTask(userId: string, taskId: string): Promise<any | undefined>;
  listActiveDeliveryTasks(userId: string): Promise<any[]>;
  deleteDeliveryTask(userId: string, taskId: string): Promise<void>;
  claimNextDeliveryTask(workerId: string): Promise<any | null>;
  heartbeatDeliveryTask(taskId: string): Promise<void>;
  reapStaleDeliveryTasks(thresholdMinutes?: number): Promise<number>;



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

  /**
   * Fetches all items in a user's partition for storage analysis.
   * This is more efficient than fetching projects, libraries, and trash separately.
   */
  getAllUserItems(userId: string): Promise<any[]>;

  /** Per-category storage usage computed via SQL aggregates. */
  getStorageUsageAggregate(userId: string): Promise<{
    projects: number;
    libraries: number;
    archives: number;
    trash: number;
  }>;

  /** Per-project album stats (count + size) aggregated in SQL. */
  getAlbumStatsByProject(
    userId: string,
    projectIds: string[],
  ): Promise<Record<string, { itemCount: number; totalSize: number }>>;
}
