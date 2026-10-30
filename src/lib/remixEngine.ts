import { CivitaiResource, ComfyInputTarget, ComfyJobInput, LibraryType, SourceLibraryItem, WorkflowItem } from '../types';
import { isSameComfyTarget } from './comfyWorkflow';
import { CivitaiPicks, civitaiOptionLabel } from './civitai';

export interface Combination {
  prompt: string;
  imageContexts?: string[];
  videoContexts?: string[];
  audioContexts?: string[];
  filenameParts: string[];
  /** The tags of the library items picked, each once whatever its case, for the results to carry. */
  tags?: string[];
  /** The library items picked, each once, for the results to point back to. */
  sourceItems?: SourceLibraryItem[];
  /** ComfyUI projects: the value each bound workflow input takes. */
  comfyInputs?: ComfyJobInput[];
  /** Civitai projects: the checkpoint, LoRAs and negative prompt this combination picked. */
  civitai?: CivitaiPicks;
}

/**
 * One option for one workflow step. A library item's choice keeps its ID, so
 * combinations can be picked from IDs and tags alone and the content of just
 * the picked items loaded afterwards.
 */
export type Choice = {
  type: 'text' | 'image' | 'video' | 'audio' | 'model',
  value: string,
  tags?: string[],
  title?: string,
  target?: ComfyInputTarget,
  /** Civitai projects: text that goes to the negative prompt. */
  negative?: boolean,
  /** Civitai projects: the checkpoint or LoRA a model item contributes. */
  model?: { slot: 'checkpoint' | 'lora', resource: CivitaiResource },
  itemId?: string,
  libraryId?: string,
};

/** A library item as the engine reads it. Without `content` it is picked by ID alone. */
export interface ChoiceLibraryItem {
  id: string;
  content?: string;
  tags?: string[];
  title?: string;
}

export interface ChoiceLibrary {
  id: string;
  type: LibraryType;
  items: ChoiceLibraryItem[];
}

/**
 * A ComfyUI binding stands for its input even when empty — clearing a prompt
 * there is a value of its own, not "use the workflow's default".
 */
function hasTextValue(item: WorkflowItem): boolean {
  return !!item.comfyTarget || item.value.trim() !== '';
}

function toComfyInput(choice: Choice): ComfyJobInput | null {
  return choice.target && choice.type !== 'model' ? { ...choice.target, kind: choice.type, value: choice.value } : null;
}

/**
 * A remixed ComfyUI text input is built from several items — typed text and
 * libraries — which make up its value together, joined in workflow order the
 * way a regular project's text steps make up its prompt. Empty items add
 * nothing; an input whose items are all empty is still sent, as empty.
 */
function mergeComfyTextInputs(inputs: ComfyJobInput[]): ComfyJobInput[] {
  const merged: ComfyJobInput[] = [];
  for (const input of inputs) {
    const existing = input.kind === 'text'
      ? merged.find((other) => other.kind === 'text' && isSameComfyTarget(other, input))
      : undefined;
    if (existing) {
      existing.value = [existing.value, input.value].filter((value) => value.trim() !== '').join('\n\n');
    } else {
      merged.push({ ...input });
    }
  }
  return merged;
}

export function filterItemsByTags<T extends { tags?: string[] }>(
  items: T[],
  selectedTags: string[] | undefined,
  matchMode: 'and' | 'or' = 'or'
): T[] {
  if (!selectedTags || selectedTags.length === 0) return items;
  const selected = selectedTags.map(t => t.toLowerCase());
  return items.filter(i => {
    if (!i.tags || i.tags.length === 0) return false;
    const itemTags = new Set(i.tags.map(t => t.toLowerCase()));
    return matchMode === 'and'
      ? selected.every(tag => itemTags.has(tag))
      : selected.some(tag => itemTags.has(tag));
  });
}

export function buildWorkflowChoices(workflow: WorkflowItem[], libraries: ChoiceLibrary[]): Choice[][] {
  const allChoices: Choice[][] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    const target = item.comfyTarget ? { nodeId: item.comfyTarget.nodeId, input: item.comfyTarget.input } : undefined;
    const negative = item.civitai?.slot === 'negative' || undefined;
    if (item.type === 'model') {
      // A checkpoint or LoRA slot varies like a library: one option per job.
      // Only a slot with several options names its pick in the filename.
      const slot = item.civitai?.slot;
      const options = item.civitai?.options || [];
      if ((slot === 'checkpoint' || slot === 'lora') && options.length > 0) {
        allChoices.push(options.map((resource) => ({
          type: 'model',
          value: resource.air,
          title: options.length > 1 ? civitaiOptionLabel(resource, slot) : undefined,
          model: { slot, resource },
        })));
      }
    } else if (item.type === 'text') {
      if (hasTextValue(item)) allChoices.push([{ type: 'text', value: item.value.trim(), target, negative }]);
    } else if (item.type === 'image') {
      if (item.value) allChoices.push([{ type: 'image', value: item.value, target }]);
    } else if (item.type === 'video') {
      if (item.value) allChoices.push([{ type: 'video', value: item.value, target }]);
    } else if (item.type === 'audio') {
      if (item.value) allChoices.push([{ type: 'audio', value: item.value, target }]);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const validItems = filterItemsByTags(lib.items, item.selectedTags, item.tagMatchMode);

        const contents = validItems.filter(i => i.content === undefined || i.content.trim() !== '');
        if (contents.length > 0) {
          allChoices.push(contents.map(i => ({
            type: lib.type || 'text',
            value: i.content ?? '',
            tags: i.tags,
            title: i.title,
            target,
            negative,
            itemId: i.id,
            libraryId: lib.id,
          })));
        }
      }
    }
  }

  return allChoices;
}

export function choicesToCombination(combo: Choice[]): Combination {
  const texts: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const stepParts: string[] = [];
  const tags = new Map<string, string>();
  const sourceItems = new Map<string, SourceLibraryItem>();
  const comfyInputs: ComfyJobInput[] = [];
  const negatives: string[] = [];
  let checkpoint: CivitaiResource | undefined;
  const loras: CivitaiResource[] = [];

  for (const c of combo) {
    if (c.type === 'text' && c.negative) negatives.push(c.value);
    else if (c.type === 'text') texts.push(c.value);
    if (c.model?.slot === 'checkpoint') checkpoint ??= c.model.resource;
    if (c.model?.slot === 'lora') {
      // The same LoRA picked by two slots applies once, at the later strength.
      const existing = loras.findIndex((lora) => lora.air === c.model!.resource.air);
      if (existing >= 0) loras.splice(existing, 1);
      loras.push(c.model.resource);
    }
    if (c.type === 'image') images.push(c.value);
    if (c.type === 'video') videos.push(c.value);
    if (c.type === 'audio') audios.push(c.value);

    if (c.tags && c.tags.length > 0) stepParts.push(...c.tags);
    if (c.title) stepParts.push(c.title);
    for (const tag of c.tags || []) {
      const trimmed = tag.trim();
      if (trimmed && !tags.has(trimmed.toLowerCase())) tags.set(trimmed.toLowerCase(), trimmed);
    }
    if (c.itemId && c.libraryId && !sourceItems.has(c.itemId)) {
      sourceItems.set(c.itemId, { libraryId: c.libraryId, itemId: c.itemId });
    }

    const comfyInput = toComfyInput(c);
    if (comfyInput) comfyInputs.push(comfyInput);
  }

  return {
    prompt: texts.join('\n\n'),
    imageContexts: images.length > 0 ? images : undefined,
    videoContexts: videos.length > 0 ? videos : undefined,
    audioContexts: audios.length > 0 ? audios : undefined,
    filenameParts: stepParts,
    tags: tags.size > 0 ? Array.from(tags.values()) : undefined,
    sourceItems: sourceItems.size > 0 ? Array.from(sourceItems.values()) : undefined,
    comfyInputs: comfyInputs.length > 0 ? mergeComfyTextInputs(comfyInputs) : undefined,
    civitai: checkpoint || loras.length > 0 || negatives.length > 0
      ? { model: checkpoint, resources: loras, negativePrompt: negatives.join('\n\n') || undefined }
      : undefined,
  };
}

/** How many checkpoints or LoRAs a Civitai model step varies over; other slots vary nothing. */
function modelOptionCount(item: WorkflowItem): number {
  const slot = item.civitai?.slot;
  return slot === 'checkpoint' || slot === 'lora' ? item.civitai?.options?.length ?? 0 : 0;
}

function getCombinationByIndex(choices: Choice[][], index: number): Choice[] {
  const result: Choice[] = new Array(choices.length);
  let remaining = index;
  for (let k = choices.length - 1; k >= 0; k--) {
    const arr = choices[k];
    result[k] = arr[remaining % arr.length];
    remaining = Math.floor(remaining / arr.length);
  }
  return result;
}

/**
 * How many combinations a workflow makes, from how many items each library
 * step keeps after its tag filter — counted without the items themselves.
 * Steps that offer nothing are left out, as buildWorkflowChoices leaves them out.
 */
export function countWorkflowCombinations(workflow: WorkflowItem[], librarySize: (item: WorkflowItem) => number): number {
  let product = 1;
  let steps = 0;
  for (const item of workflow) {
    if (item.disabled) continue;
    const size = item.type === 'library' ? librarySize(item)
      : item.type === 'model' ? modelOptionCount(item)
      : item.type === 'text' ? (hasTextValue(item) ? 1 : 0)
      : (item.value ? 1 : 0);
    if (size === 0) continue;
    product *= size;
    steps++;
  }
  return steps === 0 ? 0 : product;
}

/**
 * Pick `count` combinations: at random with shuffle on, otherwise walking them
 * in order and wrapping around once they run out.
 */
export function pickCombinations(choices: Choice[][], count: number, shuffle: boolean, random: () => number = Math.random): Choice[][] {
  if (shuffle) {
    const results: Choice[][] = [];
    for (let i = 0; i < count; i++) {
      results.push(choices.map(arr => arr[Math.floor(random() * arr.length)]));
    }
    return results;
  }

  if (choices.length === 0) return [];
  const total = choices.reduce((product, arr) => product * arr.length, 1);
  if (total === 0) return [];

  const results: Choice[][] = [];
  for (let i = 0; i < count; i++) {
    results.push(getCombinationByIndex(choices, i % total));
  }
  return results;
}
