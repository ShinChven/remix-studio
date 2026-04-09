import { PrismaClient } from '@prisma/client';
import { AppData, Library, LibraryItem, Project, AlbumItem, TrashItem } from '../../src/types';
import { IRepository } from './repository';
import { LibraryRepository } from './library-repository';
import { ProjectRepository } from './project-repository';
import { DataRepository } from './data-repository';

/**
 * Prisma-based facade that composes domain repositories into a single IRepository.
 */
export class PrismaRepository implements IRepository {
  private libraries: LibraryRepository;
  private projects: ProjectRepository;
  private data: DataRepository;

  constructor(client: PrismaClient) {
    this.libraries = new LibraryRepository(client);
    this.projects = new ProjectRepository(client);
    this.data = new DataRepository(client);
  }

  // === Library CRUD ===
  getUserLibraries(userId: string, page?: number, limit?: number) { return this.libraries.getUserLibraries(userId, page, limit); }
  getLibrary(userId: string, libraryId: string) { return this.libraries.getLibrary(userId, libraryId); }
  createLibrary(userId: string, library: Omit<Library, 'items'>) { return this.libraries.createLibrary(userId, library); }
  updateLibrary(userId: string, libraryId: string, updates: { name?: string; type?: string }) { return this.libraries.updateLibrary(userId, libraryId, updates); }
  deleteLibrary(userId: string, libraryId: string) { return this.libraries.deleteLibrary(userId, libraryId); }

  // === Library Search ===
  searchLibraryItems(userId: string, query: string, options?: { libraryId?: string; tags?: string[]; page?: number; limit?: number }) { return this.libraries.searchLibraryItems(userId, query, options); }

  // === Library Item CRUD ===
  getLibraryItems(userId: string, libraryId: string) { return this.libraries.getLibraryItems(userId, libraryId); }
  createLibraryItem(userId: string, libraryId: string, item: LibraryItem) { return this.libraries.createLibraryItem(userId, libraryId, item); }
  createLibraryItemsBatch(userId: string, libraryId: string, items: LibraryItem[]) { return this.libraries.createLibraryItemsBatch(userId, libraryId, items); }
  updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>) { return this.libraries.updateLibraryItem(userId, libraryId, itemId, updates); }
  deleteLibraryItem(userId: string, libraryId: string, itemId: string) { return this.libraries.deleteLibraryItem(userId, libraryId, itemId); }
  reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]) { return this.libraries.reorderLibraryItems(userId, libraryId, updates); }

  // === Project CRUD ===
  getUserProjects(userId: string, page?: number, limit?: number, sortBy?: 'createdAt' | 'totalSize') { return this.projects.getUserProjects(userId, page, limit, sortBy); }
  getProject(userId: string, projectId: string) { return this.projects.getProject(userId, projectId); }
  createProject(userId: string, project: Project) { return this.projects.createProject(userId, project); }
  updateProject(userId: string, projectId: string, updates: Partial<Project>) { return this.projects.updateProject(userId, projectId, updates); }
  deleteProject(userId: string, projectId: string) { return this.projects.deleteProject(userId, projectId); }

  // === Album CRUD ===
  addAlbumItem(userId: string, projectId: string, item: AlbumItem) { return this.projects.addAlbumItem(userId, projectId, item); }
  deleteAlbumItem(userId: string, projectId: string, itemId: string) { return this.projects.deleteAlbumItem(userId, projectId, itemId); }

  // === Trash CRUD ===
  getTrashItems(userId: string) { return this.projects.getTrashItems(userId); }
  moveToTrash(userId: string, projectId: string, itemId: string) { return this.projects.moveToTrash(userId, projectId, itemId); }
  restoreTrashItem(userId: string, itemId: string) { return this.projects.restoreTrashItem(userId, itemId); }
  deleteTrashPermanently(userId: string, itemId: string) { return this.projects.deleteTrashPermanently(userId, itemId); }
  emptyTrash(userId: string) { return this.projects.emptyTrash(userId); }

  // === Export CRUD ===
  getExportTasks(userId: string, projectId: string) { return this.projects.getExportTasks(userId, projectId); }
  getAllExportTasks(userId: string, limit?: number, cursor?: any) { return this.projects.getAllExportTasks(userId, limit, cursor); }
  getExportTask(userId: string, taskId: string) { return this.projects.getExportTask(userId, taskId); }
  saveExportTask(userId: string, taskId: string, data: any) { return this.projects.saveExportTask(userId, taskId, data); }
  deleteExportTask(userId: string, taskId: string) { return this.projects.deleteExportTask(userId, taskId); }

  // === Legacy / Migration ===
  getUserData(userId: string) { return this.data.getUserData(userId); }
  saveAllData(data: AppData) { return this.data.saveAllData(data); }
  autoImportJson(dataDir: string) { return this.data.autoImportJson(dataDir); }
  getAllUserItems(userId: string) { return this.projects.getAllUserItems(userId); }
}
