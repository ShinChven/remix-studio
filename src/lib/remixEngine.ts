import { Library, WorkflowItem } from '../types';

export function generateWorkflowCombinations(workflow: WorkflowItem[], libraries: Library[]): { prompt: string, imageContexts?: string[] }[] {
  const allChoices: { type: 'text' | 'image', value: string }[][] = [];

  for (const item of workflow) {
    if (item.type === 'text') {
      if (item.value.trim()) allChoices.push([{ type: 'text', value: item.value.trim() }]);
    } else if (item.type === 'image') {
      if (item.value) allChoices.push([{ type: 'image', value: item.value }]);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const contents = lib.items.map(i => i.content).filter(c => c.trim() !== '');
        if (contents.length > 0) {
          allChoices.push(contents.map(c => ({ type: lib.type, value: c })));
        }
      }
    }
  }

  const combine = (arrays: { type: 'text' | 'image', value: string }[][]): { type: 'text' | 'image', value: string }[][] => {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0].map(x => [x]);
    
    const result: { type: 'text' | 'image', value: string }[][] = [];
    const restCombinations = combine(arrays.slice(1));
    
    for (const item of arrays[0]) {
      for (const rest of restCombinations) {
        result.push([item, ...rest]);
      }
    }
    return result;
  };

  const combinations = combine(allChoices);
  const results: { prompt: string, imageContexts?: string[] }[] = [];

  for (const combo of combinations) {
    const texts: string[] = [];
    const images: string[] = [];
    
    for (const c of combo) {
      if (c.type === 'text') texts.push(c.value);
      if (c.type === 'image') images.push(c.value);
    }
    
    results.push({
      prompt: texts.join(', '),
      imageContexts: images.length > 0 ? images : undefined
    });
  }

  // Ensure there is at least one blank combination if no choices were made, to maintain expected fallbacks.
  if (results.length === 0) {
    results.push({ prompt: '' });
  }

  return results.filter(r => r.prompt || (r.imageContexts && r.imageContexts.length > 0));
}

function generateRandomCombination(workflow: WorkflowItem[], libraries: Library[]): { prompt: string, imageContexts?: string[] } {
  const texts: string[] = [];
  const images: string[] = [];
  
  for (const item of workflow) {
    if (item.type === 'text') {
      if (item.value.trim()) texts.push(item.value.trim());
    } else if (item.type === 'image') {
      if (item.value) images.push(item.value);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const contents = lib.items.map(i => i.content).filter(c => c.trim() !== '');
        if (contents.length > 0) {
          const randomItem = contents[Math.floor(Math.random() * contents.length)];
          const itemType = lib.type || 'text'; // Fallback
          if (itemType === 'text') {
            texts.push(randomItem);
          } else {
            images.push(randomItem);
          }
        }
      }
    }
  }

  // Fallback if everything is empty
  if (texts.length === 0 && images.length === 0) {
    return { prompt: '' };
  }

  return {
    prompt: texts.join(', '),
    imageContexts: images.length > 0 ? images : undefined
  };
}

export function generateJobs(workflow: WorkflowItem[], libraries: Library[], count: number, shuffle: boolean): { prompt: string, imageContexts?: string[] }[] {
  if (shuffle) {
    const results: { prompt: string, imageContexts?: string[] }[] = [];
    for (let i = 0; i < count; i++) {
      results.push(generateRandomCombination(workflow, libraries));
    }
    return results;
  } else {
    const allCombinations = generateWorkflowCombinations(workflow, libraries);
    if (allCombinations.length === 0) return [];
    
    const results: { prompt: string, imageContexts?: string[] }[] = [];
    for (let i = 0; i < count; i++) {
        results.push(allCombinations[i % allCombinations.length]);
    }
    return results;
  }
}
