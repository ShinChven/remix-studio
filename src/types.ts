export type WorkflowItemType = 'text' | 'library' | 'image';

export interface WorkflowItem {
  id: string;
  type: WorkflowItemType;
  value: string; // text content, library ID, or base64 image data URL
  order?: number;
}

export interface LibraryItem {
  id: string;
  content: string;
  title?: string;
  order?: number;
}

export type LibraryType = 'text' | 'image';

export interface Library {
  id: string;
  name: string;
  type: LibraryType;
  items: LibraryItem[];
}

export interface Job {
  id: string;
  prompt: string;
  imageContexts?: string[];
  status: 'draft' | 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
  createdAt?: number;
  providerId?: string;
  aspectRatio?: string;
  quality?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  workflow: WorkflowItem[];
  jobs: Job[];
  providerId?: string;
  aspectRatio?: string;
  quality?: string;
  shuffle?: boolean;
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
