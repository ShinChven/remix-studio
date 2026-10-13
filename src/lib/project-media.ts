import type { CivitaiGenerationConfig, ProjectType } from '../types';

export type ProjectMediaType = 'image' | 'video' | 'text' | 'audio';

/**
 * The kind of media a project's album holds. ComfyUI and Civitai projects
 * make images or videos: ComfyUI's output format decides, and a Civitai
 * project's media type.
 */
export function projectMediaType(project: {
  type?: ProjectType | string | null;
  format?: string | null;
  civitaiConfig?: Pick<CivitaiGenerationConfig, 'mediaType'> | null;
}): ProjectMediaType {
  if (project.type === 'comfyui') return project.format === 'mp4' ? 'video' : 'image';
  if (project.type === 'civitai') return project.civitaiConfig?.mediaType === 'video' ? 'video' : 'image';
  if (project.type === 'video' || project.type === 'text' || project.type === 'audio') return project.type;
  return 'image';
}

/** Project types whose albums hold images or videos, which posts and campaigns take. */
export const VISUAL_PROJECT_TYPES = ['image', 'video', 'comfyui', 'civitai'] as const;
