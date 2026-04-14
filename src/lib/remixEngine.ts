import { Library, WorkflowItem } from '../types';

export interface Combination {
  prompt: string;
  imageContexts?: string[];
  videoContexts?: string[];
  audioContexts?: string[];
  filenameParts: string[];
}

export function generateWorkflowCombinations(workflow: WorkflowItem[], libraries: Library[]): Combination[] {
  const allChoices: { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string }[][] = [];

  for (const item of workflow) {
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

  const combine = (arrays: { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string }[][]): { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string }[][] => {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0].map(x => [x]);
    
    const result: { type: 'text' | 'image' | 'video' | 'audio', value: string, tags?: string[], title?: string }[][] = [];
    const restCombinations = combine(arrays.slice(1));
    
    for (const item of arrays[0]) {
      for (const rest of restCombinations) {
        result.push([item, ...rest]);
      }
    }
    return result;
  };

  const combinations = combine(allChoices);
  const results: Combination[] = [];

  for (const combo of combinations) {
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
      
      // Collect filename parts for this step (Tags + Title)
      if (c.tags && c.tags.length > 0) {
        stepParts.push(...c.tags);
      }
      if (c.title) {
        stepParts.push(c.title);
      }
    }
    
    results.push({
      prompt: texts.join('\n\n'),
      imageContexts: images.length > 0 ? images : undefined,
      videoContexts: videos.length > 0 ? videos : undefined,
      audioContexts: audios.length > 0 ? audios : undefined,
      filenameParts: stepParts
    });
  }

  // Ensure there is at least one blank combination if no choices were made, to maintain expected fallbacks.
  if (results.length === 0) {
    results.push({ prompt: '', filenameParts: [] });
  }

  return results.filter((r) => (
    r.prompt ||
    (r.imageContexts && r.imageContexts.length > 0) ||
    (r.videoContexts && r.videoContexts.length > 0) ||
    (r.audioContexts && r.audioContexts.length > 0)
  ));
}

function generateRandomCombination(workflow: WorkflowItem[], libraries: Library[]): Combination {
  const texts: string[] = [];
  const images: string[] = [];
  const videos: string[] = [];
  const audios: string[] = [];
  const stepParts: string[] = [];
  
  for (const item of workflow) {
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
          } else {
            images.push(randomItem.content);
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
  } else {
    const allCombinations = generateWorkflowCombinations(workflow, libraries);
    if (allCombinations.length === 0) return [];
    
    const results: Combination[] = [];
    for (let i = 0; i < count; i++) {
        results.push(allCombinations[i % allCombinations.length]);
    }
    return results;
  }
}
