export interface IStorage {
  save(key: string, data: Buffer, contentType?: string): Promise<string>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  listObjects(prefix: string): Promise<string[]>;
  getSize(key: string): Promise<number | undefined>;
  rename(oldPrefix: string, newPrefix: string): Promise<void>;
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
}
