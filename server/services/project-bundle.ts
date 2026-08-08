/**
 * Project bundle format — a single .zip that carries one project's settings,
 * workflow, album metadata and every media file those reference, so a project
 * can be moved between Remix Studio installations (or restored later).
 *
 * Layout:
 *   project.json      manifest (see ProjectBundleManifest)
 *   media/<name>      one entry per referenced storage object
 *
 * Every storage key inside the manifest is rewritten to its bundle-relative
 * media path, so the archive is self-contained: an importer never has to know
 * anything about the exporting installation's bucket layout.
 */

import type { AlbumItem, Project, WorkflowItem } from '../../src/types';

export const PROJECT_BUNDLE_KIND = 'remix-studio-project';
export const PROJECT_BUNDLE_VERSION = 1;
export const PROJECT_BUNDLE_MANIFEST_ENTRY = 'project.json';
export const PROJECT_BUNDLE_MEDIA_PREFIX = 'media/';

/** Settings copied verbatim onto the imported project. */
export interface ProjectBundleSettings {
  name: string;
  description?: string;
  type?: Project['type'];
  status?: Project['status'];
  providerId?: string;
  modelConfigId?: string;
  aspectRatio?: string;
  quality?: string;
  format?: Project['format'];
  background?: string;
  shuffle?: boolean;
  prefix?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  duration?: number;
  resolution?: string;
  sound?: Project['sound'];
  showDisabledItems?: boolean;
  createdAt?: number;
}

/** One file carried in the archive. */
export interface ProjectBundleMediaEntry {
  /** Path inside the zip, always beginning with `media/`. */
  path: string;
  /** Storage key this file came from — informational, never used on import. */
  sourceKey?: string;
  size?: number;
}

export interface ProjectBundleManifest {
  kind: typeof PROJECT_BUNDLE_KIND;
  formatVersion: number;
  exportedAt: number;
  /** Id the project had in the source installation — informational. */
  sourceProjectId?: string;
  project: ProjectBundleSettings;
  /** Media values point at bundle paths, not storage keys. */
  workflow: WorkflowItem[];
  /** Media values point at bundle paths, not storage keys. */
  album: AlbumItem[];
  media: ProjectBundleMediaEntry[];
}

/** Media-carrying workflow item types. */
const MEDIA_WORKFLOW_TYPES = new Set(['image', 'video', 'audio']);

function isMediaWorkflowItem(item: WorkflowItem): boolean {
  return MEDIA_WORKFLOW_TYPES.has(item.type);
}

/**
 * Sanitize one path segment for use inside the archive. Keeps the extension
 * readable while refusing anything that could escape the media directory.
 */
function safeSegment(value: string, fallback: string): string {
  const base = (value.split('/').pop() || '').trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned || fallback;
}

/**
 * Assigns each storage key a unique path inside the archive and hands out the
 * mapping. Keys are collected in first-seen order so the manifest and the
 * archive entries can never drift apart.
 */
export class BundleMediaMap {
  private readonly byKey = new Map<string, ProjectBundleMediaEntry>();
  private readonly usedPaths = new Set<string>();

  /** Record a storage key, returning the bundle path that will hold it. */
  add(key: string | undefined | null, sizeHint?: number): string | undefined {
    if (!key || typeof key !== 'string') return undefined;
    const trimmed = key.trim();
    // data: URLs and remote http(s) references are inlined values, not stored
    // objects — they survive the round trip untouched.
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('http')) return undefined;

    const existing = this.byKey.get(trimmed);
    if (existing) {
      if (existing.size == null && sizeHint != null) existing.size = sizeHint;
      return existing.path;
    }

    const name = safeSegment(trimmed, `file_${this.byKey.size + 1}`);
    let path = `${PROJECT_BUNDLE_MEDIA_PREFIX}${name}`;
    let suffix = 1;
    while (this.usedPaths.has(path)) {
      path = `${PROJECT_BUNDLE_MEDIA_PREFIX}${suffix}_${name}`;
      suffix++;
    }
    this.usedPaths.add(path);

    const entry: ProjectBundleMediaEntry = { path, sourceKey: trimmed, size: sizeHint };
    this.byKey.set(trimmed, entry);
    return path;
  }

  /** Rewrite a value to its bundle path, leaving non-storage values alone. */
  rewrite(value: string | undefined | null, sizeHint?: number): string | undefined {
    if (value == null) return undefined;
    return this.add(value, sizeHint) ?? value;
  }

  entries(): ProjectBundleMediaEntry[] {
    return Array.from(this.byKey.values());
  }

  get size(): number {
    return this.byKey.size;
  }
}

function rewriteContexts(
  values: string[] | undefined,
  media: BundleMediaMap
): string[] | undefined {
  if (!values?.length) return values;
  return values.map((value) => media.rewrite(value) ?? value);
}

/**
 * Build the manifest for a project, collecting every storage key it references
 * along the way. The returned media list is exactly what must be added to the
 * archive, in the order the caller should add it.
 */
export function buildProjectBundleManifest(input: {
  project: Project;
  workflow: WorkflowItem[];
  album: AlbumItem[];
}): ProjectBundleManifest {
  const media = new BundleMediaMap();
  const { project } = input;

  const workflow: WorkflowItem[] = input.workflow.map((item) => {
    if (!isMediaWorkflowItem(item)) return { ...item };
    return {
      ...item,
      value: media.rewrite(item.value, item.size) ?? item.value,
      thumbnailUrl: media.rewrite(item.thumbnailUrl),
      optimizedUrl: media.rewrite(item.optimizedUrl),
    };
  });

  const album: AlbumItem[] = input.album.map((item) => ({
    ...item,
    imageUrl: media.rewrite(item.imageUrl, item.size) ?? item.imageUrl,
    thumbnailUrl: media.rewrite(item.thumbnailUrl, item.thumbnailSize),
    optimizedUrl: media.rewrite(item.optimizedUrl, item.optimizedSize),
    imageContexts: rewriteContexts(item.imageContexts, media),
    videoContexts: rewriteContexts(item.videoContexts, media),
    audioContexts: rewriteContexts(item.audioContexts, media),
  }));

  return {
    kind: PROJECT_BUNDLE_KIND,
    formatVersion: PROJECT_BUNDLE_VERSION,
    exportedAt: Date.now(),
    sourceProjectId: project.id,
    project: {
      name: project.name,
      description: project.description,
      type: project.type,
      status: project.status,
      providerId: project.providerId,
      modelConfigId: project.modelConfigId,
      aspectRatio: project.aspectRatio,
      quality: project.quality,
      format: project.format,
      background: project.background,
      shuffle: project.shuffle,
      prefix: project.prefix,
      systemPrompt: project.systemPrompt,
      temperature: project.temperature,
      maxTokens: project.maxTokens,
      duration: project.duration,
      resolution: project.resolution,
      sound: project.sound,
      showDisabledItems: project.showDisabledItems,
      createdAt: project.createdAt,
    },
    workflow,
    album,
    media: media.entries(),
  };
}

export class ProjectBundleError extends Error {}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return items.length > 0 ? items : undefined;
}

/**
 * Validate a parsed `project.json`. Throws ProjectBundleError with a message
 * meant for the user when the archive is not a project bundle we can read.
 */
export function parseProjectBundleManifest(raw: unknown): ProjectBundleManifest {
  if (!raw || typeof raw !== 'object') {
    throw new ProjectBundleError('project.json is not a valid manifest');
  }
  const manifest = raw as Record<string, any>;

  if (manifest.kind !== PROJECT_BUNDLE_KIND) {
    throw new ProjectBundleError('This archive is not a Remix Studio project bundle');
  }
  const formatVersion = Number(manifest.formatVersion);
  if (!Number.isFinite(formatVersion) || formatVersion < 1) {
    throw new ProjectBundleError('project.json is missing a valid formatVersion');
  }
  if (formatVersion > PROJECT_BUNDLE_VERSION) {
    throw new ProjectBundleError(
      `This bundle was exported by a newer version (format ${formatVersion}); upgrade before importing it`
    );
  }
  const project = manifest.project;
  if (!project || typeof project !== 'object' || typeof project.name !== 'string' || !project.name.trim()) {
    throw new ProjectBundleError('project.json is missing the project name');
  }

  const workflow: WorkflowItem[] = Array.isArray(manifest.workflow)
    ? manifest.workflow.filter((item: any) => item && typeof item === 'object' && typeof item.type === 'string')
    : [];
  const album: AlbumItem[] = Array.isArray(manifest.album)
    ? manifest.album.filter((item: any) => item && typeof item === 'object')
    : [];
  const media: ProjectBundleMediaEntry[] = Array.isArray(manifest.media)
    ? manifest.media
        .filter((entry: any) => entry && typeof entry.path === 'string')
        .map((entry: any) => ({
          path: entry.path,
          sourceKey: typeof entry.sourceKey === 'string' ? entry.sourceKey : undefined,
          size: typeof entry.size === 'number' ? entry.size : undefined,
        }))
    : [];

  return {
    kind: PROJECT_BUNDLE_KIND,
    formatVersion,
    exportedAt: typeof manifest.exportedAt === 'number' ? manifest.exportedAt : Date.now(),
    sourceProjectId: typeof manifest.sourceProjectId === 'string' ? manifest.sourceProjectId : undefined,
    project: {
      name: project.name.trim().slice(0, 256),
      description: typeof project.description === 'string' ? project.description.slice(0, 2000) : undefined,
      type: ['image', 'text', 'video', 'audio'].includes(project.type) ? project.type : 'image',
      status: project.status === 'archived' ? 'archived' : 'active',
      providerId: typeof project.providerId === 'string' ? project.providerId : undefined,
      modelConfigId: typeof project.modelConfigId === 'string' ? project.modelConfigId : undefined,
      aspectRatio: typeof project.aspectRatio === 'string' ? project.aspectRatio : undefined,
      quality: typeof project.quality === 'string' ? project.quality : undefined,
      format: typeof project.format === 'string' ? project.format : undefined,
      background: typeof project.background === 'string' ? project.background : undefined,
      shuffle: typeof project.shuffle === 'boolean' ? project.shuffle : undefined,
      prefix: typeof project.prefix === 'string' ? project.prefix : undefined,
      systemPrompt: typeof project.systemPrompt === 'string' ? project.systemPrompt : undefined,
      temperature: typeof project.temperature === 'number' ? project.temperature : undefined,
      maxTokens: typeof project.maxTokens === 'number' ? project.maxTokens : undefined,
      duration: typeof project.duration === 'number' ? project.duration : undefined,
      resolution: typeof project.resolution === 'string' ? project.resolution : undefined,
      sound: project.sound === 'on' || project.sound === 'off' ? project.sound : undefined,
      showDisabledItems: typeof project.showDisabledItems === 'boolean' ? project.showDisabledItems : undefined,
      createdAt: typeof project.createdAt === 'number' ? project.createdAt : undefined,
    },
    workflow: workflow.map((item: any) => ({
      ...item,
      selectedTags: asStringArray(item.selectedTags),
    })) as WorkflowItem[],
    album,
    media,
  };
}

/** True when a manifest value points at a file carried inside the bundle. */
export function isBundleMediaPath(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.startsWith(PROJECT_BUNDLE_MEDIA_PREFIX);
}

/**
 * Reject archive entry names that would escape the extraction root. We never
 * write zip entries to disk, but the same names become storage keys.
 */
export function isSafeBundlePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  if (path.includes('..')) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  return true;
}

/** Storage-key basename for an imported media file. */
export function bundlePathToFilename(path: string): string {
  const raw = path.slice(PROJECT_BUNDLE_MEDIA_PREFIX.length);
  return safeSegment(raw, 'file');
}
