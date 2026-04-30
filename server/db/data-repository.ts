import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { AppData, Project } from '../../src/types';
import { LibraryRepository } from './library-repository';
import { ProjectRepository } from './project-repository';

export class DataRepository {
  private libraryRepo: LibraryRepository;
  private projectRepo: ProjectRepository;

  constructor(private prisma: PrismaClient) {
    this.libraryRepo = new LibraryRepository(prisma);
    this.projectRepo = new ProjectRepository(prisma);
  }

  async getUserData(userId: string): Promise<AppData> {
    const [libraries, projects] = await Promise.all([
      this.libraryRepo.getUserLibraries(userId, 1, 100000),
      this.projectRepo.getUserProjects(userId, 1, 100000),
    ]);
    return { libraries: libraries.items, projects: projects.items };
  }

  async saveAllData(data: AppData): Promise<void> {
    // WARNING: Full wipe-and-replace for the default import user.
    const userId = 'default_user';

    // Delete all data for this user
    await this.prisma.project.deleteMany({ where: { userId } });
    await this.prisma.library.deleteMany({ where: { userId } });

    // Ensure user exists
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@import.local`, passwordHash: '', role: 'user' },
      update: {},
    });

    for (const lib of data.libraries || []) {
      await this.libraryRepo.createLibrary(userId, { id: lib.id, name: lib.name, description: lib.description, type: lib.type });
      for (const item of lib.items || []) {
        await this.libraryRepo.createLibraryItem(userId, lib.id, item);
      }
    }

    for (const proj of data.projects || []) {
      await this.projectRepo.createProject(userId, proj);
    }
  }

  async autoImportJson(dataDir: string): Promise<void> {
    // Only import if the database is completely empty
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const jsonPath = path.join(dataDir, 'db.json');
    if (!fs.existsSync(jsonPath)) return;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const data: AppData = JSON.parse(raw);

      if ((data as any).batches && !data.projects) {
        data.projects = (data as any).batches;
      }

      await this.saveAllData(data);
      console.log('Auto-imported data from db.json into PostgreSQL');
    } catch (e) {
      console.error('Failed to auto-import db.json:', e);
    }
  }
}
