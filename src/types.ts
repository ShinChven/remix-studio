export type WorkflowItemType = 'text' | 'library' | 'image';

export interface WorkflowItem {
  id: string;
  type: WorkflowItemType;
  value: string; // text content, library ID, or base64 image data URL
  order?: number;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  size?: number;
}

export interface LibraryItem {
  id: string;
  content: string;
  title?: string;
  order?: number;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  size?: number;
}

export type LibraryType = 'text' | 'image';

export interface Library {
  id: string;
  name: string;
  type: LibraryType;
  items: LibraryItem[];
}

export interface ModelConfig {
  id: string; // Local UUID
  name: string; // Display name e.g. "nano banana 2"
  generatorId: ProviderType; // Which generator type to use
  modelId: string; // The actual API model string (e.g. 'gemini-3.1-flash-image')
  apiUrl?: string; // Optional override
  options: {
    aspectRatios: string[];
    qualities: string[];
  };
}

export const PROVIDER_MODELS_MAP: Record<ProviderType, ModelConfig[]> = {
  GoogleAI: [
    {
      id: 'google-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3.1-flash-image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2'],
        qualities: ['1K', '2K', '4K'],
      },
    },
  ],
  VertexAI: [
    {
      id: 'vertex-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'VertexAI',
      modelId: 'gemini-3.1-flash-image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2'],
        qualities: ['1K', '2K', '4K'],
      },
    },
  ],
  RunningHub: [
    {
      id: 'runninghub-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'RunningHub',
      modelId: 'rhart-image-n-g31-flash',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2'],
        qualities: ['1K', '2K', '4K'],
      },
    },
  ],
};

export interface Job {
  id: string;
  prompt: string;
  imageContexts?: string[];
  status: 'draft' | 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  size?: number;
  error?: string;
  createdAt?: number;
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  format?: 'png' | 'jpeg' | 'webp';
}

export interface AlbumItem {
  id: string;
  jobId: string;
  prompt: string;
  imageUrl: string; // S3 key (presigned on read)
  thumbnailUrl?: string; // S3 key
  optimizedUrl?: string; // S3 key
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  format?: 'png' | 'jpeg' | 'webp';
  size?: number; // Size in bytes
  createdAt: number;
}

export interface TrashItem extends AlbumItem {
  projectId: string;
  projectName: string;
  deletedAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  workflow: WorkflowItem[];
  jobs: Job[];
  album: AlbumItem[];
  providerId?: string;
  aspectRatio?: string;
  quality?: string;
  format?: 'png' | 'jpeg' | 'webp';
  shuffle?: boolean;
  modelConfigId?: string;
}

export type ProviderType = 'GoogleAI' | 'VertexAI' | 'RunningHub';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiUrl?: string;
  concurrency: number;
  hasKey: boolean; // raw apiKey is never sent to the client
  createdAt: number;
  models: ModelConfig[];
}

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: number;
}

export interface AppData {
  libraries: Library[];
  projects: Project[];
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}
