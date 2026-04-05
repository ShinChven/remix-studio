import { Library, WorkflowItem } from '../types';

export interface Combination {
  prompt: string;
  imageContexts?: string[];
  tags: string[];
  titles: string[];
}

export function generateWorkflowCombinations(workflow: WorkflowItem[], libraries: Library[]): Combination[] {
  const allChoices: { type: 'text' | 'image', value: string, tags?: string[], title?: string }[][] = [];

  for (const item of workflow) {
    if (item.type === 'text') {
      if (item.value.trim()) allChoices.push([{ type: 'text', value: item.value.trim() }]);
    } else if (item.type === 'image') {
      if (item.value) allChoices.push([{ type: 'image', value: item.value }]);
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

  const combine = (arrays: { type: 'text' | 'image', value: string, tags?: string[], title?: string }[][]): { type: 'text' | 'image', value: string, tags?: string[], title?: string }[][] => {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0].map(x => [x]);
    
    const result: { type: 'text' | 'image', value: string, tags?: string[], title?: string }[][] = [];
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
    const allTags: string[] = [];
    const allTitles: string[] = [];
    
    for (const c of combo) {
      if (c.type === 'text') texts.push(c.value);
      if (c.type === 'image') images.push(c.value);
      if (c.tags) allTags.push(...c.tags);
      if (c.title) allTitles.push(c.title);
    }
    
    results.push({
      prompt: texts.join('\n\n'),
      imageContexts: images.length > 0 ? images : undefined,
      tags: [...new Set(allTags)], // Dedup tags
      titles: allTitles
    });
  }

  // Ensure there is at least one blank combination if no choices were made, to maintain expected fallbacks.
  if (results.length === 0) {
    results.push({ prompt: '', tags: [], titles: [] });
  }

  return results.filter(r => r.prompt || (r.imageContexts && r.imageContexts.length > 0));
}

function generateRandomCombination(workflow: WorkflowItem[], libraries: Library[]): Combination {
  const texts: string[] = [];
  const images: string[] = [];
  const allTags: string[] = [];
  const allTitles: string[] = [];
  
  for (const item of workflow) {
    if (item.type === 'text') {
      if (item.value.trim()) texts.push(item.value.trim());
    } else if (item.type === 'image') {
      if (item.value) images.push(item.value);
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
          if (randomItem.tags) allTags.push(...randomItem.tags);
          if (randomItem.title) allTitles.push(randomItem.title);
        }
      }
    }
  }

  // Fallback if everything is empty
  if (texts.length === 0 && images.length === 0) {
    return { prompt: '', tags: [], titles: [] };
  }

  return {
    prompt: texts.join('\n\n'),
    imageContexts: images.length > 0 ? images : undefined,
    tags: [...new Set(allTags)],
    titles: allTitles
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
