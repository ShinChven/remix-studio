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

export type ProjectType = 'image' | 'text' | 'video';

export interface ModelConfig {
  id: string; // Local UUID
  name: string; // Display name e.g. "nano banana 2"
  generatorId: ProviderType; // Which generator type to use
  modelId: string; // The actual API model string (e.g. 'gemini-3.1-flash-image-preview')
  category: ProjectType; // 'image' | 'text' | 'video'
  apiUrl?: string; // Optional override
  options: {
    aspectRatios?: string[];
    qualities?: string[];
    backgrounds?: string[];
    // Text generation options
    temperatures?: number[];
    maxTokenOptions?: number[];
    // Video generation options
    durations?: number[]; // seconds
    resolutions?: string[]; // e.g. '720p', '1080p', '4k'
  };
}

export const PROVIDER_MODELS_MAP: Record<ProviderType, ModelConfig[]> = {
  GoogleAI: [
    {
      id: 'google-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'GoogleAI',
      modelId: 'gemini-3.1-flash-image-preview',
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
      },
    },
    {
      id: 'google-veo-3.1-video',
      name: 'Veo 3.1',
      generatorId: 'GoogleAI',
      modelId: 'veo-3.1-generate-preview',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16'],
        resolutions: ['720p', '1080p', '4k'],
        durations: [4, 6, 8],
      },
    },
    {
      id: 'google-veo-3.1-lite-video',
      name: 'Veo 3.1 Lite',
      generatorId: 'GoogleAI',
      modelId: 'veo-3.1-lite-generate-preview',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16'],
        resolutions: ['720p', '1080p'],
        durations: [4, 6, 8],
      },
    },
  ],
  VertexAI: [
    {
      id: 'vertex-nano-banana-2',
      name: 'nano banana 2',
      generatorId: 'VertexAI',
      modelId: 'gemini-3.1-flash-image-preview',
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
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
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
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
  KlingAI: [
    {
      id: 'kling-omni-image-o1',
      name: 'Kling Image O1',
      generatorId: 'KlingAI',
      modelId: 'kling-image-o1',
      category: 'image',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9', 'auto'],
        qualities: ['1K', '2K', '4K'],
      },
    },
    {
      id: 'kling-v3-omni-image',
      name: 'Kling V3 Omni',
      generatorId: 'KlingAI',
      modelId: 'kling-v3-omni',
      category: 'image',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9', 'auto'],
        qualities: ['1K', '2K', '4K'],
      },
    },
    {
      id: 'kling-video-o1-video',
      name: 'Kling Video O1',
      generatorId: 'KlingAI',
      modelId: 'kling-video-o1',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['720p'],
        durations: [3, 4, 5, 6, 7, 8, 9, 10],
      },
    },
    {
      id: 'kling-v3-omni-video',
      name: 'Kling V3 Omni Video',
      generatorId: 'KlingAI',
      modelId: 'kling-v3-omni',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['720p'],
        durations: [3, 4, 5, 6, 7, 8, 9, 10],
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
      id: 'openai-gpt-image-1-mini',
      name: 'GPT Image 1 Mini',
      generatorId: 'OpenAI',
      modelId: 'gpt-image-1-mini',
      category: 'image',
      options: {
        aspectRatios: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
        qualities: ['low', 'medium', 'high', 'auto'],
        backgrounds: ['transparent', 'opaque', 'auto'],
      },
    },
    {
      id: 'openai-gpt-5.4-text',
      name: 'GPT-5.4',
      generatorId: 'OpenAI',
      modelId: 'gpt-5.4',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
      },
    },
    {
      id: 'openai-gpt-5.4-mini-text',
      name: 'GPT-5.4 Mini',
      generatorId: 'OpenAI',
      modelId: 'gpt-5.4-mini',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
      },
    },
    {
      id: 'openai-gpt-5.4-nano-text',
      name: 'GPT-5.4 Nano',
      generatorId: 'OpenAI',
      modelId: 'gpt-5.4-nano',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
      },
    },
    {
      id: 'openai-sora-2-video',
      name: 'Sora 2',
      generatorId: 'OpenAI',
      modelId: 'sora-2',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['720p', '1080p'],
        durations: [8, 16, 20],
      },
    },
    {
      id: 'openai-sora-2-pro-video',
      name: 'Sora 2 Pro',
      generatorId: 'OpenAI',
      modelId: 'sora-2-pro',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['720p', '1080p'],
        durations: [8, 16, 20],
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
    {
      id: 'grok-imagine-image-pro',
      name: 'Grok Imagine Pro',
      generatorId: 'Grok',
      modelId: 'grok-imagine-image-pro',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', 'auto'],
        qualities: ['medium/2k', 'high/2k', 'medium/1k', 'high/1k', 'low/2k', 'low/1k'],
      },
    },
    {
      id: 'grok-4.20-text',
      name: 'Grok 4.20',
      generatorId: 'Grok',
      modelId: 'grok-4.20-0309-non-reasoning',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
      },
    },
    {
      id: 'grok-4.1-fast-text',
      name: 'Grok 4.1 Fast',
      generatorId: 'Grok',
      modelId: 'grok-4-1-fast-non-reasoning',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0, 1.5, 2.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
      },
    },
    {
      id: 'grok-imagine-video',
      name: 'Grok Imagine Video',
      generatorId: 'Grok',
      modelId: 'grok-imagine-video',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '9:16'],
        resolutions: ['720p'],
        durations: [6, 10],
      },
    },
  ],
  Claude: [
    {
      id: 'claude-opus-4-6-text',
      name: 'Claude Opus 4.6',
      generatorId: 'Claude',
      modelId: 'claude-opus-4-6',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
      },
    },
    {
      id: 'claude-sonnet-4-6-text',
      name: 'Claude Sonnet 4.6',
      generatorId: 'Claude',
      modelId: 'claude-sonnet-4-6',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
      },
    },
    {
      id: 'claude-haiku-4-5-text',
      name: 'Claude Haiku 4.5',
      generatorId: 'Claude',
      modelId: 'claude-haiku-4-5-20251001',
      category: 'text',
      options: {
        temperatures: [0, 0.2, 0.5, 0.7, 1.0],
        maxTokenOptions: [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
      },
    },
  ],
  BytePlus: [
    {
      id: 'byteplus-seedream-5-0-lite',
      name: 'Seedream 5.0 Lite',
      generatorId: 'BytePlus',
      modelId: 'seedream-5-0-260128',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
        qualities: ['2K', '3K'],
      },
    },
    {
      id: 'byteplus-seedream-4-5',
      name: 'Seedream 4.5',
      generatorId: 'BytePlus',
      modelId: 'seedream-4-5-251128',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
        qualities: ['2K', '4K'],
      },
    },
    {
      id: 'byteplus-seedream-4-0',
      name: 'Seedream 4.0',
      generatorId: 'BytePlus',
      modelId: 'seedream-4-0-250828',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
        qualities: ['1K', '2K', '4K'],
      },
    },
    {
      id: 'byteplus-seedream-3-0-t2i',
      name: 'Seedream 3.0 T2I',
      generatorId: 'BytePlus',
      modelId: 'seedream-3-0-t2i-250415',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
      },
    },
    {
      id: 'byteplus-seededit-3-0-i2i',
      name: 'Seededit 3.0 I2I',
      generatorId: 'BytePlus',
      modelId: 'seededit-3-0-i2i-250628',
      category: 'image',
      options: {
        aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3'],
      },
    },
    {
      id: 'byteplus-seedance-1-5-pro-video',
      name: 'Seedance 1.5 Pro',
      generatorId: 'BytePlus',
      modelId: 'seedance-1-5-pro-251215',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
        resolutions: ['480p', '720p', '1080p'],
        durations: [4, 5, 6, 8, 10, 12],
      },
    },
    {
      id: 'byteplus-seedance-1-0-pro-video',
      name: 'Seedance 1.0 Pro',
      generatorId: 'BytePlus',
      modelId: 'seedance-1-0-pro-250528',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
        resolutions: ['480p', '720p', '1080p'],
        durations: [2, 4, 5, 6, 8, 10, 12],
      },
    },
    {
      id: 'byteplus-seedance-1-0-pro-fast-video',
      name: 'Seedance 1.0 Pro Fast',
      generatorId: 'BytePlus',
      modelId: 'seedance-1-0-pro-fast-251015',
      category: 'video',
      options: {
        aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
        resolutions: ['480p', '720p', '1080p'],
        durations: [2, 4, 5, 6, 8, 10, 12],
      },
    },
  ],
};

/**
 * Resolve custom model variants into full ModelConfig entries.
 * Each variant clones the base model's options but uses its own name and modelId.
 */
export function resolveCustomModels(
  providerType: ProviderType,
  aliases: CustomModelAlias[]
): ModelConfig[] {
  const baseModels = PROVIDER_MODELS_MAP[providerType] || [];
  return aliases
    .map((alias) => {
      if (!alias.customModelId || !alias.customName || !alias.baseModelId) return null;
      const base = baseModels.find((m) => m.id === alias.baseModelId);
      if (!base) return null;
      return {
        ...base,
        id: `custom-${alias.customModelId}`,
        name: alias.customName,
        modelId: alias.customModelId,
      };
    })
    .filter((m): m is ModelConfig => m !== null);
}

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
  format?: 'png' | 'jpeg' | 'webp' | 'mp4';
  taskId?: string; // For long-running remote tasks (e.g. RunningHub)
  filename?: string; // Custom filename for S3 storage (ProjectPrefix_Tags_Title_shortuuid)
  // Video generation
  duration?: number; // seconds
  resolution?: string; // e.g. '720p', '1080p', '4k'
  sound?: 'on' | 'off';
}

export interface AlbumItem {
  id: string;
  jobId: string;
  prompt: string;
  textContent?: string; // Text generation output
  imageContexts?: string[];
  imageUrl: string; // S3 key (presigned on read) — for video projects this is the .mp4 key
  thumbnailUrl?: string; // S3 key
  optimizedUrl?: string; // S3 key
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  format?: 'png' | 'jpeg' | 'webp' | 'mp4';
  size?: number; // Size in bytes
  optimizedSize?: number; // Size in bytes
  thumbnailSize?: number; // Size in bytes
  createdAt: number;
  // Video-specific
  duration?: number; // seconds
  resolution?: string; // e.g. '720p', '1080p'
}

export interface TrashItem extends AlbumItem {
  projectId: string;
  projectName: string;
  deletedAt: number;
}

export interface Project {
  id: string;
  name: string;
  type?: ProjectType; // 'image' (default), 'text', or 'video'
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
  format?: 'png' | 'jpeg' | 'webp' | 'mp4';
  shuffle?: boolean;
  modelConfigId?: string;
  prefix?: string; // Project prefix for file naming
  totalSize?: number;
  // Text generation settings
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Video generation settings
  duration?: number; // seconds
  resolution?: string; // '720p', '1080p', '4k'
  sound?: 'on' | 'off';
}

export type ProviderType = 'GoogleAI' | 'VertexAI' | 'RunningHub' | 'KlingAI' | 'OpenAI' | 'Grok' | 'Claude' | 'BytePlus';

/**
 * A custom model variant that inherits all options from a built-in base model
 * but uses its own model name and model ID for API calls.
 */
export interface CustomModelAlias {
  customName: string;    // display name for this variant
  customModelId: string; // the actual API model ID to send in requests
  baseModelId: string;   // references ModelConfig.id in PROVIDER_MODELS_MAP (for inheriting options)
}

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
  hasSecret?: boolean;
  createdAt: number;
  models: ModelConfig[];
  customModels?: CustomModelAlias[];
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
  note?: string | null;
  membershipTier: 'free' | 'professional' | 'premium';
  maxUses: number;
  usedCount: number;
  lastUsedAt?: number;
  lastUsedByEmail?: string | null;
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
  packageName?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current: number;
  total: number;
  size?: number;
  downloadUrl?: string;
  error?: string;
  createdAt: number;
}

export interface DeliveryStatus {
  id: string;
  exportTaskId: string;
  destination: 'drive';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytesTransferred: number;
  totalBytes?: number;
  externalId?: string;
  externalUrl?: string;
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
