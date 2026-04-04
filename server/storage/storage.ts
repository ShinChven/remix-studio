export interface IStorage {
  save(key: string, data: Buffer, contentType?: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  rename(oldPrefix: string, newPrefix: string): Promise<void>;
}
