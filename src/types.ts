export type WorkflowItemType = 'text' | 'library' | 'image';

export interface WorkflowItem {
  id: string;
  type: WorkflowItemType;
  value: string; // text content, library ID, or base64 image data URL
  order?: number;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  size?: number;
  selectedTags?: string[];
}

export interface LibraryItem {
  id: string;
  content: string;
  title?: string;
  order?: number;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  size?: number;
  tags?: string[];
}

export type LibraryType = 'text' | 'image';

export interface Library {
  id: string;
  name: string;
  type: LibraryType;
  items: LibraryItem[];
}

export type ProjectType = 'image' | 'text';

export interface ModelConfig {
  id: string; // Local UUID
  name: string; // Display name e.g. "nano banana 2"
  generatorId: ProviderType; // Which generator type to use
  modelId: string; // The actual API model string (e.g. 'gemini-3.1-flash-image')
  category: ProjectType; // 'image' for image generation, 'text' for text generation
  apiUrl?: string; // Optional override
  options: {
    aspectRatios?: string[];
    qualities?: string[];
    backgrounds?: string[];
    // Text generation options
    temperatures?: number[];
    maxTokenOptions?: number[];
  };
}

export const PROVIDER_MODELS_MAP: Record<ProviderType, ModelConfig[]> = {
  GoogleAI: [
    {
      id: 'google-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3.1-flash-image',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:4', '4:1', '1:8', '8:1', '4:5', '5:4', '21:9', '9:21'],
        qualities: ['1K', '2K', '4K'],
      },
    },
    {
      id: 'google-gemini-3-flash-text',
      name: 'Gemini 3 Flash',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3-flash-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
    {
      id: 'google-gemini-3.1-pro-text',
      name: 'Gemini 3.1 Pro',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3.1-pro-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
    {
      id: 'google-gemini-3.1-flash-lite-text',
      name: 'Gemini 3.1 Flash Lite',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3.1-flash-lite-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
  ],
  VertexAI: [
    {
      id: 'vertex-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'VertexAI',
      modelId: 'gemini-3.1-flash-image',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:4', '4:1', '1:8', '8:1', '4:5', '5:4', '21:9', '9:21'],
        qualities: ['1K', '2K', '4K'],
      },
    },
    {
      id: 'vertex-gemini-3-flash-text',
      name: 'Gemini 3 Flash',
      generatorId: 'VertexAI',
      modelId: 'gemini-3-flash-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
    {
      id: 'vertex-gemini-3.1-pro-text',
      name: 'Gemini 3.1 Pro',
      generatorId: 'VertexAI',
      modelId: 'gemini-3.1-pro-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
    {
      id: 'vertex-gemini-3.1-flash-lite-text',
      name: 'Gemini 3.1 Flash Lite',
      generatorId: 'VertexAI',
      modelId: 'gemini-3.1-flash-lite-preview',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192],
      },
    },
  ],
  RunningHub: [
    {
      id: 'runninghub-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'RunningHub',
      modelId: 'rhart-image-n-g31-flash',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:4', '4:1', '1:8', '8:1', '4:5', '5:4', '21:9', '9:21'],
        qualities: ['1K', '2K', '4K'],
      },
    },
  ],
  OpenAI: [
    {
      id: 'openai-gpt-image-1-5',
      name: 'GPT Image 1.5',
      generatorId: 'OpenAI',
      modelId: 'gpt-image-1.5',
      category: 'image',
      options: {
        aspectRatios: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        qualities: ['low', 'medium', 'high', 'auto'],
        backgrounds: ['transparent', 'opaque', 'auto'],
      },
    },
    {
      id: 'openai-gpt-4.1-text',
      name: 'GPT-4.1',
      generatorId: 'OpenAI',
      modelId: 'gpt-4.1',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384],
      },
    },
    {
      id: 'openai-gpt-4.1-mini-text',
      name: 'GPT-4.1 Mini',
      generatorId: 'OpenAI',
      modelId: 'gpt-4.1-mini',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384],
      },
    },
    {
      id: 'openai-gpt-4.1-nano-text',
      name: 'GPT-4.1 Nano',
      generatorId: 'OpenAI',
      modelId: 'gpt-4.1-nano',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384],
      },
    },
    {
      id: 'openai-gpt-4o-text',
      name: 'GPT-4o',
      generatorId: 'OpenAI',
      modelId: 'gpt-4o',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384],
      },
    },
  ],
  Grok: [
    {
      id: 'grok-imagine-image',
      name: 'Grok Imagine',
      generatorId: 'Grok',
      modelId: 'grok-imagine-image',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', 'auto'],
        qualities: ['medium/2k', 'high/2k', 'medium/1k', 'high/1k', 'low/2k', 'low/1k'],
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
  resultText?: string; // Text generation output
  size?: number;
  optimizedSize?: number;
  thumbnailSize?: number;
  error?: string;
  createdAt?: number;
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  format?: 'png' | 'jpeg' | 'webp';
  taskId?: string; // For long-running remote tasks (e.g. RunningHub)
  filename?: string; // Custom filename for S3 storage (ProjectPrefix_Tags_Title_shortuuid)
}

export interface AlbumItem {
  id: string;
  jobId: string;
  prompt: string;
  textContent?: string; // Text generation output
  imageContexts?: string[];
  imageUrl: string; // S3 key (presigned on read)
  thumbnailUrl?: string; // S3 key
  optimizedUrl?: string; // S3 key
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  format?: 'png' | 'jpeg' | 'webp';
  size?: number; // Size in bytes
  optimizedSize?: number; // Size in bytes
  thumbnailSize?: number; // Size in bytes
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
  type?: ProjectType; // 'image' (default) or 'text'
  createdAt: number;
  workflow: WorkflowItem[];
  jobs: Job[];
  album: AlbumItem[];
  jobCount?: number;
  albumCount?: number;
  providerId?: string;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  format?: 'png' | 'jpeg' | 'webp';
  shuffle?: boolean;
  modelConfigId?: string;
  prefix?: string; // Project prefix for file naming
  totalSize?: number;
  // Text generation settings
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export type ProviderType = 'GoogleAI' | 'VertexAI' | 'RunningHub' | 'OpenAI' | 'Grok';

export interface ProviderUsageSummary {
  projectCount: number;
  activeJobCount: number;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiUrl?: string;
  concurrency: number;
  hasKey: boolean; // raw apiKey is never sent to the client
  createdAt: number;
  models: ModelConfig[];
  usage?: ProviderUsageSummary;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';

export interface UserReference {
  id: string;
  email: string;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdBy?: UserReference | null;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
  googleDriveConnected?: boolean;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
  storageLimit?: number;
}

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
  transports?: string[];
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  pendingTwoFactorSetup: boolean;
  passkeys: PasskeySummary[];
}

export interface UserSummary extends User {
  projectCount: number;
  libraryCount: number;
  providerCount: number;
  usedStorage: number;
}

export interface UserStorageBreakdown {
  projects: number;
  libraries: number;
  exports: number;
  trash: number;
}

export interface UserDetail extends UserSummary {
  exportCount: number;
  storageBreakdown: UserStorageBreakdown;
  inviteCode?: InviteCode | null;
}

export interface InviteCode {
  id: string;
  code: string;
  createdAt: number;
  usedAt?: number;
  expiresAt?: number;
  createdBy: UserReference;
  usedBy?: UserReference | null;
  usedByEmail?: string | null;
}

export interface ExportTask {
  id: string;
  projectId: string;
  projectName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current: number;
  total: number;
  size?: number;
  downloadUrl?: string;
  error?: string;
  createdAt: number;
}

export interface StorageSubCategory {
  id: string;
  name: string;
  size: number;
}

export interface StorageCategory {
  id: string;
  name: string;
  size: number;
  subCategories?: StorageSubCategory[];
}

export interface ProjectStorageStats {
  id: string;
  name: string;
  total: number;
  album: number;
  drafts: number;
  workflow: number;
  orphans: number;
}

export interface StorageAnalysis {
  totalSize: number;
  limit: number;
  categories: StorageCategory[];
  projects: ProjectStorageStats[];
}

export interface AppData {
  libraries: Library[];
  projects: Project[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}
