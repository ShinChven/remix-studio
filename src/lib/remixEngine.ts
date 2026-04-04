import { Library, WorkflowItem } from '../types';

export function generateWorkflowCombinations(workflow: WorkflowItem[], libraries: Library[]): { prompt: string, imageContext?: string }[] {
  const textLayers: string[][] = [];
  const imageLayers: string[][] = [];

  for (const item of workflow) {
    if (item.type === 'text') {
      if (item.value.trim()) textLayers.push([item.value.trim()]);
    } else if (item.type === 'library') {
      const lib = libraries.find(l => l.id === item.value);
      if (lib && lib.items.length > 0) {
        const contents = lib.items.map(i => i.content).filter(c => c.trim() !== '');
        if (lib.type === 'image') {
          imageLayers.push(contents);
        } else {
          textLayers.push(contents);
        }
      }
    } else if (item.type === 'image') {
      if (item.value) imageLayers.push([item.value]);
    }
  }

  const combineText = (arrays: string[][]): string[] => {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];
    
    const result: string[] = [];
    const restCombinations = combineText(arrays.slice(1));
    
    for (const item of arrays[0]) {
      for (const rest of restCombinations) {
        result.push(`${item}, ${rest}`);
      }
    }
    return result;
  };

  const combineImages = (arrays: string[][]): string[][] => {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0].map(img => [img]);
    
    const result: string[][] = [];
    const restCombinations = combineImages(arrays.slice(1));
    
    for (const item of arrays[0]) {
      for (const rest of restCombinations) {
        result.push([item, ...rest]);
      }
    }
    return result;
  };

  const prompts = combineText(textLayers);
  const imageCombinations = combineImages(imageLayers);

  const finalPrompts = prompts.length > 0 ? prompts : [''];
  const finalImages = imageCombinations.length > 0 ? imageCombinations : [[]];

  const results: { prompt: string, imageContext?: string }[] = [];

  for (const prompt of finalPrompts) {
    for (const images of finalImages) {
      results.push({
        prompt,
        imageContext: images.length > 0 ? images[images.length - 1] : undefined
      });
    }
  }

  return results.filter(r => r.prompt || r.imageContext);
}
