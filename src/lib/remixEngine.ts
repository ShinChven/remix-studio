import { Library, WorkflowItem } from '../types';

export interface Combination {
  prompt: string;
  imageContexts?: string[];
  videoContexts?: string[];
  audioContexts?: string[];
  filenameParts: string[];
}

type Choice = { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string };

function buildWorkflowChoices(workflow: WorkflowItem[], libraries: Library[]): Choice[][] {
  const allChoices: Choice[][] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    if (item.type === 'text') {
      if (item.value.trim()) allChoices.push([{ type: 'text', value: item.value.trim() }]);
    } else if (item.type === 'image') {
      if (item.value) allChoices.push([{ type: 'image', value: item.value }]);
    } else if (item.type === 'video') {
      if (item.value) allChoices.push([{ type: 'video', value: item.value }]);
    } else if (item.type === 'audio') {
      if (item.value) allChoices.push([{ type: 'audio', value: item.value }]);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const validItems = item.selectedTags && item.selectedTags.length > 0
          ? lib.items.filter(i => i.tags && i.tags.some(tag => item.selectedTags!.includes(tag)))
          : lib.items;

        const contents = validItems.filter(i => i.content.trim() !== '');
        if (contents.length > 0) {
          allChoices.push(contents.map(i => ({
            type: lib.type,
            value: i.content,
            tags: i.tags,
            title: i.title
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

  for (const c of combo) {
    if (c.type === 'text') texts.push(c.value);
    if (c.type === 'image') images.push(c.value);
    if (c.type === 'video') videos.push(c.value);
    if (c.type === 'audio') audios.push(c.value);

    if (c.tags && c.tags.length > 0) stepParts.push(...c.tags);
    if (c.title) stepParts.push(c.title);
  }

  return {
    prompt: texts.join('\n\n'),
    imageContexts: images.length > 0 ? images : undefined,
    videoContexts: videos.length > 0 ? videos : undefined,
    audioContexts: audios.length > 0 ? audios : undefined,
    filenameParts: stepParts,
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

function generateRandomCombination(workflow: WorkflowItem[], libraries: Library[]): Combination {
  const texts: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const stepParts: string[] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    if (item.type === 'text') {
      if (item.value.trim()) texts.push(item.value.trim());
    } else if (item.type === 'image') {
      if (item.value) images.push(item.value);
    } else if (item.type === 'video') {
      if (item.value) videos.push(item.value);
    } else if (item.type === 'audio') {
      if (item.value) audios.push(item.value);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const validItems = item.selectedTags && item.selectedTags.length > 0
          ? lib.items.filter(i => i.tags && i.tags.some(tag => item.selectedTags!.includes(tag)))
          : lib.items;

        const contents = validItems.filter(i => i.content.trim() !== '');
        if (contents.length > 0) {
          const randomItem = contents[Math.floor(Math.random() * contents.length)];
          const itemType = lib.type || 'text'; // Fallback
          if (itemType === 'text') {
            texts.push(randomItem.content);
          } else if (itemType === 'image') {
            images.push(randomItem.content);
          } else if (itemType === 'video') {
            videos.push(randomItem.content);
          } else if (itemType === 'audio') {
            audios.push(randomItem.content);
          }
          if (randomItem.tags) stepParts.push(...randomItem.tags);
          if (randomItem.title) stepParts.push(randomItem.title);
        }
      }
    }
  }

  // Fallback if everything is empty
  if (texts.length === 0 && images.length === 0 && videos.length === 0 && audios.length === 0) {
    return { prompt: '', filenameParts: [] };
  }

  return {
    prompt: texts.join('\n\n'),
    imageContexts: images.length > 0 ? images : undefined,
    videoContexts: videos.length > 0 ? videos : undefined,
    audioContexts: audios.length > 0 ? audios : undefined,
    filenameParts: stepParts
  };
}

export function generateJobs(workflow: WorkflowItem[], libraries: Library[], count: number, shuffle: boolean): Combination[] {
  if (shuffle) {
    const results: Combination[] = [];
    for (let i = 0; i < count; i++) {
      results.push(generateRandomCombination(workflow, libraries));
    }
    return results;
  }

  const choices = buildWorkflowChoices(workflow, libraries);
  if (choices.length === 0) return [];
  const total = choices.reduce((product, arr) => product * arr.length, 1);
  if (total === 0) return [];

  const results: Combination[] = [];
  for (let i = 0; i < count; i++) {
    results.push(choicesToCombination(getCombinationByIndex(choices, i % total)));
  }
  return results;
}
