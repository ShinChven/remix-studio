import { ComfyInputTarget, ComfyJobInput, Library, LibraryItem, LibraryType, WorkflowItem } from '../types';
import { isSameComfyTarget } from './comfyWorkflow';

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

function comfyTargetOf(item: WorkflowItem): ComfyInputTarget | undefined {
  return item.comfyTarget ? { nodeId: item.comfyTarget.nodeId, input: item.comfyTarget.input } : undefined;
}

/** The one value a step other than a library contributes, if it has one. */
function fixedChoice(item: WorkflowItem, target?: ComfyInputTarget): Choice | null {
  if (item.type === 'text') return hasTextValue(item) ? { type: 'text', value: item.value.trim(), target } : null;
  if (item.type === 'image' || item.type === 'video' || item.type === 'audio') {
    return item.value ? { type: item.type, value: item.value, target } : null;
  }
  return null;
}

function buildWorkflowChoices(workflow: WorkflowItem[], libraries: Library[]): Choice[][] {
  const allChoices: Choice[][] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    const target = comfyTargetOf(item);
    if (item.type !== 'library') {
      const choice = fixedChoice(item, target);
      if (choice) allChoices.push([choice]);
    } else {
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
    comfyInputs: comfyInputs.length > 0 ? mergeComfyTextInputs(comfyInputs) : undefined,
  };
}

/** The position each list takes in combination `index`, the last list varying fastest. */
function positionsByIndex(sizes: number[], index: number): number[] {
  const result: number[] = new Array(sizes.length);
  let remaining = index;
  for (let k = sizes.length - 1; k >= 0; k--) {
    result[k] = remaining % sizes[k];
    remaining = Math.floor(remaining / sizes[k]);
  }
  return result;
}

function getCombinationByIndex(choices: Choice[][], index: number): Choice[] {
  const positions = positionsByIndex(choices.map((arr) => arr.length), index);
  return choices.map((arr, k) => arr[positions[k]]);
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

// ─── Workflows that draw from libraries without loading their items ───
//
// A project workflow only needs how many items each library step offers to
// count its combinations; the items themselves are fetched for the positions
// a batch of drafts actually uses. generateJobs above, which takes whole
// libraries, stays for the MCP draft tool, which already holds them.

/**
 * A library as one workflow step draws from it. The same library under
 * another tag filter offers other items, so it is another source.
 */
export interface LibraryChoiceSource {
  libraryId: string;
  tags: string[];
  tagMatch: 'and' | 'or';
}

/** How many items a source offers, and of what kind. */
export interface LibraryChoiceInfo {
  type: LibraryType;
  count: number;
}

export type PickedLibraryItem = Pick<LibraryItem, 'content' | 'tags' | 'title'>;

export function libraryChoiceSource(item: WorkflowItem): LibraryChoiceSource {
  return { libraryId: item.value, tags: item.selectedTags || [], tagMatch: item.tagMatchMode || 'or' };
}

export function libraryChoiceKey(source: LibraryChoiceSource): string {
  const tags = Array.from(new Set(source.tags.map((tag) => tag.toLowerCase()))).sort();
  return JSON.stringify([source.libraryId, tags, tags.length > 0 ? source.tagMatch : 'or']);
}

/** The sources a workflow's library steps draw from, each once. */
export function workflowLibrarySources(workflow: WorkflowItem[]): LibraryChoiceSource[] {
  const sources = new Map<string, LibraryChoiceSource>();
  for (const item of workflow) {
    if (item.type !== 'library' || !item.value) continue;
    const source = libraryChoiceSource(item);
    sources.set(libraryChoiceKey(source), source);
  }
  return Array.from(sources.values());
}

type WorkflowSlot =
  | { kind: 'fixed'; choice: Choice }
  | { kind: 'library'; key: string; type: LibraryType; size: number; target?: ComfyInputTarget };

/** buildWorkflowChoices, with each library step standing as its size rather than its items. */
function buildWorkflowSlots(workflow: WorkflowItem[], infos: Map<string, LibraryChoiceInfo>): WorkflowSlot[] {
  const slots: WorkflowSlot[] = [];

  for (const item of workflow) {
    if (item.disabled) continue;

    const target = comfyTargetOf(item);
    if (item.type !== 'library') {
      const choice = fixedChoice(item, target);
      if (choice) slots.push({ kind: 'fixed', choice });
      continue;
    }

    const key = libraryChoiceKey(libraryChoiceSource(item));
    const info = infos.get(key);
    if (info && info.count > 0) {
      slots.push({ kind: 'library', key, type: info.type || 'text', size: info.count, target });
    }
  }

  return slots;
}

function slotSize(slot: WorkflowSlot): number {
  return slot.kind === 'library' ? slot.size : 1;
}

export function countWorkflowCombinationsFromCounts(workflow: WorkflowItem[], infos: Map<string, LibraryChoiceInfo>): number {
  const slots = buildWorkflowSlots(workflow, infos);
  if (slots.length === 0) return 0;
  return slots.reduce((product, slot) => product * slotSize(slot), 1);
}

/** Which item each step takes in each combination of a batch, decided before any item is loaded. */
export interface WorkflowPlan {
  slots: WorkflowSlot[];
  /** Per combination, the position each slot takes (always 0 for a step with one value). */
  picks: number[][];
}

/** Plan `count` combinations the way generateJobs picks them. */
export function planWorkflowCombinations(
  workflow: WorkflowItem[],
  infos: Map<string, LibraryChoiceInfo>,
  count: number,
  shuffle: boolean,
): WorkflowPlan {
  const slots = buildWorkflowSlots(workflow, infos);
  const sizes = slots.map(slotSize);

  if (shuffle) {
    const picks = Array.from({ length: count }, () => sizes.map((size) => Math.floor(Math.random() * size)));
    return { slots, picks };
  }

  if (slots.length === 0) return { slots, picks: [] };
  const total = sizes.reduce((product, size) => product * size, 1);
  const picks = Array.from({ length: count }, (_, i) => positionsByIndex(sizes, i % total));
  return { slots, picks };
}

/** The item positions each library source has to supply for a plan, in ascending order. */
export function planLibraryPositions(plan: WorkflowPlan): Map<string, number[]> {
  const positions = new Map<string, Set<number>>();
  plan.slots.forEach((slot, k) => {
    if (slot.kind !== 'library') return;
    let set = positions.get(slot.key);
    if (!set) {
      set = new Set();
      positions.set(slot.key, set);
    }
    for (const pick of plan.picks) set.add(pick[k]);
  });
  return new Map(Array.from(positions, ([key, set]) => [key, Array.from(set).sort((a, b) => a - b)]));
}

/**
 * Turn a plan into combinations with the items fetched for it, by source key
 * and position. An item that could not be fetched (its library changed since
 * it was counted) leaves its step out, as an empty library does.
 */
export function combinationsFromPlan(plan: WorkflowPlan, items: Map<string, Map<number, PickedLibraryItem>>): Combination[] {
  return plan.picks.map((pick) => choicesToCombination(plan.slots.flatMap((slot, k): Choice[] => {
    if (slot.kind === 'fixed') return [slot.choice];
    const item = items.get(slot.key)?.get(pick[k]);
    if (!item) return [];
    return [{ type: slot.type, value: item.content, tags: item.tags, title: item.title, target: slot.target }];
  })));
}
