import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AppData, Library, LibraryItem, Project, AlbumItem, TrashItem } from '../../src/types';
import { IRepository } from './repository';
import { LibraryRepository } from './library-repository';
import { ProjectRepository } from './project-repository';
import { DataRepository } from './data-repository';

/**
 * Facade that composes domain-specific repositories into a single IRepository.
 * Add new domains by creating a dedicated *-repository.ts and delegating here.
 */
export class DynamoDBRepository implements IRepository {
  private libraries: LibraryRepository;
  private projects: ProjectRepository;
  private data: DataRepository;

  constructor(client: DynamoDBDocumentClient) {
    this.libraries = new LibraryRepository(client);
    this.projects = new ProjectRepository(client);
    this.data = new DataRepository(client);
  }

  // === Library CRUD ===
  getUserLibraries(userId: string) { return this.libraries.getUserLibraries(userId); }
  getLibrary(userId: string, libraryId: string) { return this.libraries.getLibrary(userId, libraryId); }
  createLibrary(userId: string, library: Omit<Library, 'items'>) { return this.libraries.createLibrary(userId, library); }
  updateLibrary(userId: string, libraryId: string, updates: { name?: string; type?: string }) { return this.libraries.updateLibrary(userId, libraryId, updates); }
  deleteLibrary(userId: string, libraryId: string) { return this.libraries.deleteLibrary(userId, libraryId); }

  // === Library Item CRUD ===
  getLibraryItems(userId: string, libraryId: string) { return this.libraries.getLibraryItems(userId, libraryId); }
  createLibraryItem(userId: string, libraryId: string, item: LibraryItem) { return this.libraries.createLibraryItem(userId, libraryId, item); }
  updateLibraryItem(userId: string, libraryId: string, itemId: string, updates: Partial<LibraryItem>) { return this.libraries.updateLibraryItem(userId, libraryId, itemId, updates); }
  deleteLibraryItem(userId: string, libraryId: string, itemId: string) { return this.libraries.deleteLibraryItem(userId, libraryId, itemId); }
  reorderLibraryItems(userId: string, libraryId: string, updates: { id: string; order: number }[]) { return this.libraries.reorderLibraryItems(userId, libraryId, updates); }

  // === Project CRUD ===
  getUserProjects(userId: string) { return this.projects.getUserProjects(userId); }
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

  // === Legacy / Migration ===
  getUserData(userId: string) { return this.data.getUserData(userId); }
  saveAllData(data: AppData) { return this.data.saveAllData(data); }
  autoImportJson(dataDir: string) { return this.data.autoImportJson(dataDir); }
}
