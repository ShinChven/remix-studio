import { AppData } from '../../src/types';

export interface IRepository {
  /** Get data for a specific user */
  getUserData(userId: string): Promise<AppData>;
  /** Save data for a specific user */
  saveUserData(userId: string, data: AppData): Promise<void>;
  /** Get all data across all users (admin only) */
  getAllData(): Promise<AppData>;
  /** Save all data (legacy, used for migration) */
  saveAllData(data: AppData): Promise<void>;
}
