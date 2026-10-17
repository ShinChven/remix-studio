import crypto from 'crypto';
import type { IRepository } from '../db/repository';
import {
  buildWorkflowChoices,
  choicesToCombination,
  pickCombinations,
  type Combination,
} from '../../src/lib/remixEngine';
import { summarizeComfyPrompt } from '../../src/lib/comfyWorkflow';
import { civitaiDraftFields, civitaiVideoEngine, isCivitaiVideo } from '../../src/lib/civitai';
import {
  DEFAULT_AUDIO_PROJECT_CONFIG,
  parseAudioProjectConfig,
  resolveSupportedAspectRatio,
  resolveSupportedOption,
} from '../../src/types';
import type { Job, ModelConfig, Project, WorkflowItem } from '../../src/types';

const MAX_JOB_FILENAME_LENGTH = 200;

/**
 * Mirror of the project viewer's job filename builder: a readable slug made of
 * the project prefix plus the tags/titles of the library items that composed
 * the prompt, suffixed with a short uuid so two identical combinations never
 * collide in storage.
 */
export function buildJobFilename(filenameParts: string[], suffixId: string): string {
  const safeSuffixId = suffixId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const readableName = filenameParts
    .filter(Boolean)
    .join('_')
    .replace(/[^a-zA-Z0-9-_]/g, '_');
  const separator = readableName ? '_' : '';
  const maxReadableLength = Math.max(0, MAX_JOB_FILENAME_LENGTH - separator.length - safeSuffixId.length);

  return `${readableName.substring(0, maxReadableLength)}${separator}${safeSuffixId}`;
}

/**
 * Per-job generation settings, resolved from the project and — where the
 * project leaves a field unset, or holds a value this model does not offer —
 * from the options the model advertises. Matches what the project viewer
 * writes onto drafts it creates.
 */
export function buildJobSettings(project: Project, model: ModelConfig | undefined): Partial<Job> {
  const type = project.type ?? 'image';

  if (type === 'text') return {};

  if (type === 'audio') {
    const audioConfig = project.systemPrompt
      ? parseAudioProjectConfig(project.systemPrompt)
      : DEFAULT_AUDIO_PROJECT_CONFIG;
    const isMusic = audioConfig.kind === 'remix-audio-music';
    return {
      quality: isMusic
        ? (audioConfig.mode === 'instrumental' ? 'instrumental' : 'with-lyrics')
        : audioConfig.speakers[0].voice,
      background: isMusic ? 'music' : audioConfig.mode,
      format: (project.format
        || model?.options.audioFormats?.[0]
        || (isMusic ? 'mp3' : 'wav')) as Job['format'],
    };
  }

  const common: Partial<Job> = {
    aspectRatio: resolveSupportedAspectRatio(project.aspectRatio, model?.options.aspectRatios)
      || '1024x1024',
    quality: resolveSupportedOption(project.quality, model?.options.qualities) || 'standard',
    background: resolveSupportedOption(project.background, model?.options.backgrounds),
  };

  if (type === 'video') {
    return {
      ...common,
      duration: project.duration || model?.options.durations?.[0] || 4,
      resolution: resolveSupportedOption(project.resolution, model?.options.resolutions) || '720p',
      sound: project.sound || 'on',
      format: 'mp4',
    };
  }

  return { ...common, format: (project.format || 'png') as Job['format'] };
}

/** A repeatable random sequence (mulberry32), so a retried request picks the same combinations. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick `count` workflow combinations. Libraries are read as item IDs and tags
 * only; content is loaded for just the items that were picked.
 */
async function composeWorkflowCombinations(
  repository: IRepository,
  userId: string,
  workflow: WorkflowItem[],
  count: number,
  shuffle: boolean,
  random: () => number,
): Promise<{ combinations: Combination[]; missingLibraryIds: string[] }> {
  const libraryIds = Array.from(new Set(
    workflow.filter((item) => item.type === 'library' && !item.disabled && item.value).map((item) => item.value),
  ));
  const libraries = await repository.getLibraryItemRefs(userId, libraryIds);
  const found = new Set(libraries.map((library) => library.id));
  const missingLibraryIds = libraryIds.filter((id) => !found.has(id));

  const picked = pickCombinations(buildWorkflowChoices(workflow, libraries), count, shuffle, random);
  const itemIds = Array.from(new Set(
    picked.flatMap((combo) => combo.flatMap((choice) => (choice.itemId ? [choice.itemId] : []))),
  ));
  const contents = await repository.getLibraryItemContents(userId, itemIds);

  const combinations = picked.map((combo) => choicesToCombination(combo.flatMap((choice) => {
    if (!choice.itemId) return [choice];
    const item = contents.get(choice.itemId);
    // Deleted between the two reads: the step sits this draft out.
    return item ? [{ ...choice, value: item.content, title: item.title }] : [];
  })));

  return { combinations, missingLibraryIds };
}

/** Why a workflow's combinations cannot become jobs; no drafts come with one. */
export type DraftProblem =
  /** Civitai needs a prompt, and every text item feeds the negative prompt. */
  | { code: 'civitai_prompt_required' }
  /** The project's video engine makes videos from text only, and a combination has an image. */
  | { code: 'civitai_text_only'; engine: string };

/**
 * Build `count` draft jobs from a project's workflow, the way the project
 * viewer's "add to queue" does. Nothing is stored.
 */
export async function composeDraftJobs(
  repository: IRepository,
  userId: string,
  project: Project,
  workflow: WorkflowItem[],
  model: ModelConfig | undefined,
  count: number,
  random: () => number = Math.random,
): Promise<{ jobs: Job[]; missingLibraryIds: string[]; problem?: DraftProblem }> {
  const isComfy = project.type === 'comfyui';
  const { combinations, missingLibraryIds } = await composeWorkflowCombinations(
    repository,
    userId,
    isComfy ? workflow.filter((item) => item.comfyTarget) : workflow,
    count,
    !!project.shuffle,
    random,
  );

  // Jobs are listed by creation time, so spread it to keep the drafts in the
  // order they were picked.
  const now = Date.now();
  const filename = (combo: Combination) => buildJobFilename(
    [project.prefix ?? '', ...combo.filenameParts],
    crypto.randomUUID().slice(0, 8),
  );

  if (isComfy) {
    // With nothing to vary, each draft runs the workflow as saved.
    const selected: Combination[] = combinations.length > 0
      ? combinations
      : Array.from({ length: count }, () => ({ prompt: '', filenameParts: [] }));
    const jobs: Job[] = selected.map((combo, index) => {
      const comfyInputs = combo.comfyInputs || [];
      return {
        id: crypto.randomUUID(),
        prompt: summarizeComfyPrompt(project.comfyWorkflow, comfyInputs),
        imageContexts: combo.imageContexts,
        videoContexts: combo.videoContexts,
        audioContexts: combo.audioContexts,
        comfyInputs,
        status: 'draft',
        format: project.format || 'png',
        filename: filename(combo),
        tags: combo.tags,
        workflowSnapshot: workflow,
        createdAt: now + index,
      };
    });
    return { jobs, missingLibraryIds };
  }

  if (project.type === 'civitai') {
    if (combinations.some((combo) => !combo.prompt.trim())) {
      return { jobs: [], missingLibraryIds, problem: { code: 'civitai_prompt_required' } };
    }
    const engine = civitaiVideoEngine(project.civitaiConfig?.video?.engine);
    if (isCivitaiVideo(project.civitaiConfig) && !engine.imageToVideo && combinations.some((combo) => combo.imageContexts?.length)) {
      return { jobs: [], missingLibraryIds, problem: { code: 'civitai_text_only', engine: engine.label } };
    }
    // A Civitai job takes its checkpoint, LoRAs and negative prompt from its
    // combination and keeps a copy of everything it runs with.
    const imageFormat = project.format && ['png', 'jpeg', 'webp'].includes(project.format) ? project.format : 'png';
    const jobs: Job[] = combinations.map((combo, index) => ({
      id: crypto.randomUUID(),
      prompt: combo.prompt,
      status: 'draft',
      providerId: project.providerId,
      ...civitaiDraftFields(project.civitaiConfig, combo, imageFormat),
      filename: filename(combo),
      tags: combo.tags,
      workflowSnapshot: workflow,
      createdAt: now + index,
    }));
    return { jobs, missingLibraryIds };
  }

  const settings = buildJobSettings(project, model);
  const jobs: Job[] = combinations.map((combo, index) => ({
    id: crypto.randomUUID(),
    prompt: combo.prompt,
    imageContexts: combo.imageContexts,
    videoContexts: combo.videoContexts,
    audioContexts: combo.audioContexts,
    status: 'draft',
    providerId: project.providerId,
    modelConfigId: project.modelConfigId,
    ...settings,
    filename: filename(combo),
    tags: combo.tags,
    workflowSnapshot: workflow,
    createdAt: now + index,
  }));
  return { jobs, missingLibraryIds };
}
