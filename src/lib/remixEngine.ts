import { ComfyInputTarget, ComfyJobInput, Library, WorkflowItem } from '../types';

export interface Combination {
  prompt: string;
  imageContexts?: string[];
  videoContexts?: string[];
  audioContexts?: string[];
  filenameParts: string[];
  /** ComfyUI projects: the value each bound workflow input takes. */
  comfyInputs?: ComfyJobInput[];
}

type Choice = { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string, target?: ComfyInputTarget };

/**
 * A ComfyUI binding stands for its input even when empty — clearing a prompt
 * there is a value of its own, not "use the workflow's default".
 */
function hasTextValue(item: WorkflowItem): boolean {
  return !!item.comfyTarget || item.value.trim() !== '';
}

function toComfyInput(choice: Choice): ComfyJobInput | null {
  return choice.target ? { ...choice.target, kind: choice.type, value: choice.value } : null;
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

function buildWorkflowChoices(workflow: WorkflowItem[], libraries: Library[]): Choice[][] {
  const allChoices: Choice[][] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    const target = item.comfyTarget;
    if (item.type === 'text') {
      if (hasTextValue(item)) allChoices.push([{ type: 'text', value: item.value.trim(), target }]);
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

        const contents = validItems.filter(i => i.content.trim() !== '');
        if (contents.length > 0) {
          allChoices.push(contents.map(i => ({
            type: lib.type || 'text',
            value: i.content,
            tags: i.tags,
            title: i.title,
            target,
          })));
        }
      }
    }
  }

  return allChoices;
}

function choicesToCombination(combo: Choice[]): Combination {
  const texts: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const stepParts: string[] = [];
  const comfyInputs: ComfyJobInput[] = [];

  for (const c of combo) {
    if (c.type === 'text') texts.push(c.value);
    if (c.type === 'image') images.push(c.value);
    if (c.type === 'video') videos.push(c.value);
    if (c.type === 'audio') audios.push(c.value);

    if (c.tags && c.tags.length > 0) stepParts.push(...c.tags);
    if (c.title) stepParts.push(c.title);

    const comfyInput = toComfyInput(c);
    if (comfyInput) comfyInputs.push(comfyInput);
  }

  return {
    prompt: texts.join('\n\n'),
    imageContexts: images.length > 0 ? images : undefined,
    videoContexts: videos.length > 0 ? videos : undefined,
    audioContexts: audios.length > 0 ? audios : undefined,
    filenameParts: stepParts,
    comfyInputs: comfyInputs.length > 0 ? comfyInputs : undefined,
  };
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

export function countWorkflowCombinations(workflow: WorkflowItem[], libraries: Library[]): number {
  const choices = buildWorkflowChoices(workflow, libraries);
  if (choices.length === 0) return 0;
  return choices.reduce((product, arr) => product * arr.length, 1);
}

export function generateJobs(workflow: WorkflowItem[], libraries: Library[], count: number, shuffle: boolean): Combination[] {
  const choices = buildWorkflowChoices(workflow, libraries);

  if (shuffle) {
    const results: Combination[] = [];
    for (let i = 0; i < count; i++) {
      results.push(choicesToCombination(choices.map(arr => arr[Math.floor(Math.random() * arr.length)])));
    }
    return results;
  }

  if (choices.length === 0) return [];
  const total = choices.reduce((product, arr) => product * arr.length, 1);
  if (total === 0) return [];

  const results: Combination[] = [];
  for (let i = 0; i < count; i++) {
    results.push(choicesToCombination(getCombinationByIndex(choices, i % total)));
  }
  return results;
}
