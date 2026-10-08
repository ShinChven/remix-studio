import type { ComfyInputTarget, ComfyJobInput, ComfyWorkflow, ComfyWorkflowNode, WorkflowItem } from '../types';

/**
 * Helpers for ComfyUI workflows in API format (ComfyUI: Workflow → Export (API)),
 * shared by the project viewer (to list and bind inputs) and the server runner
 * (to fill those inputs in before queueing the prompt).
 *
 * API format is a flat map of node id -> { class_type, inputs, _meta }. An input
 * whose value is a `[nodeId, outputIndex]` pair is a link to another node; every
 * other value is a widget value, and those are what a project can bind.
 */

/**
 * Normalize a pasted ComfyUI address. Rented instances hand out a new address
 * on every start, so this is forgiving: a bare `host:port` gets `http://`, and
 * the query string, fragment and trailing slashes are dropped. A path is kept
 * so instances behind a reverse-proxy prefix still work. Throws when the value
 * is not an http(s) URL.
 */
export function normalizeComfyAddress(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error('ComfyUI URL: invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('ComfyUI URL must use HTTP or HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('ComfyUI URL: credentials in URLs are not allowed');
  }
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/+$/, '');
}

export type ComfyParseError = 'invalid-json' | 'ui-format' | 'not-api-format';

export type ComfyParseResult =
  | { ok: true; workflow: ComfyWorkflow }
  | { ok: false; error: ComfyParseError };

export type ComfyValue = string | number | boolean;
export type ComfyMediaKind = 'image' | 'video' | 'audio';

export interface ComfyInputInfo extends ComfyInputTarget {
  key: string;
  classType: string;
  nodeTitle: string;
  value: ComfyValue;
  valueType: 'string' | 'number' | 'boolean';
  /** Set when the input names a file ComfyUI loads from its input folder. */
  mediaKind?: ComfyMediaKind;
  /** Integer seed inputs are re-rolled per job unless a project binds them. */
  isSeed: boolean;
}

export interface ComfyNodeInputs {
  nodeId: string;
  classType: string;
  nodeTitle: string;
  inputs: ComfyInputInfo[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiNode(value: unknown): value is ComfyWorkflowNode {
  return isPlainObject(value) && typeof value.class_type === 'string' && isPlainObject(value.inputs);
}

function looksLikeApiWorkflow(value: unknown): value is Record<string, ComfyWorkflowNode> {
  if (!isPlainObject(value)) return false;
  const nodes = Object.values(value);
  return nodes.length > 0 && nodes.every(isApiNode);
}

/**
 * Accept the API-format workflow as a JSON string or parsed value. The body of a
 * `/prompt` request (`{ prompt: {...} }`) is accepted too. A regular saved
 * workflow (UI format, with `nodes` and `links`) is reported separately so the
 * UI can tell the user which export to use.
 */
export function parseComfyWorkflow(raw: unknown): ComfyParseResult {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: 'invalid-json' };
    }
  }

  if (isPlainObject(value) && Array.isArray(value.nodes) && Array.isArray(value.links)) {
    return { ok: false, error: 'ui-format' };
  }

  const candidate = isPlainObject(value) && looksLikeApiWorkflow(value.prompt) ? value.prompt : value;
  if (!looksLikeApiWorkflow(candidate)) return { ok: false, error: 'not-api-format' };

  const workflow: ComfyWorkflow = {};
  for (const [nodeId, node] of Object.entries(candidate)) {
    workflow[nodeId] = {
      class_type: node.class_type,
      inputs: { ...node.inputs },
      ...(node._meta && typeof node._meta.title === 'string' ? { _meta: { title: node._meta.title } } : {}),
    };
  }
  return { ok: true, workflow };
}

export function comfyTargetKey(target: ComfyInputTarget): string {
  return JSON.stringify([target.nodeId, target.input]);
}

export function isSameComfyTarget(a: ComfyInputTarget | undefined, b: ComfyInputTarget | undefined): boolean {
  return !!a && !!b && a.nodeId === b.nodeId && a.input === b.input;
}

/** The workflow items bound to each input, keyed by `comfyTargetKey`, in workflow order. */
export function groupComfyBindings(items: WorkflowItem[]): Map<string, WorkflowItem[]> {
  const groups = new Map<string, WorkflowItem[]>();
  for (const item of items) {
    if (!item.comfyTarget) continue;
    const key = comfyTargetKey(item.comfyTarget);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return groups;
}

/**
 * Whether a text input's items make up a remix rather than one typed value:
 * marked as one, more than one item, or a library on its own (bound before
 * remixing existed).
 */
export function isComfyRemix(items: WorkflowItem[]): boolean {
  return items.length > 1 || items.some((item) => item.comfyTarget?.remix || item.type === 'library');
}

/** Order node ids the way ComfyUI numbers them: "2" before "10", "5:3" after "5". */
function compareNodeIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const VIDEO_FILE_PATTERN = /\.(mp4|webm|mov|mkv|avi|gif)$/i;
const AUDIO_FILE_PATTERN = /\.(wav|mp3|flac|ogg|m4a|aac)$/i;

function mediaKindFor(classType: string, input: string, value: ComfyValue): ComfyMediaKind | undefined {
  if (typeof value !== 'string') return undefined;
  const cls = classType.toLowerCase();
  const name = input.toLowerCase();

  if (cls.includes('loadimage') && name.startsWith('image')) return 'image';
  if (cls.includes('loadvideo') && (name === 'video' || name === 'file')) return 'video';
  if (cls.includes('loadaudio') && (name === 'audio' || name === 'file')) return 'audio';

  if (name === 'image' && IMAGE_FILE_PATTERN.test(value)) return 'image';
  if (name === 'video' && VIDEO_FILE_PATTERN.test(value)) return 'video';
  if (name === 'audio' && AUDIO_FILE_PATTERN.test(value)) return 'audio';
  return undefined;
}

export function isComfySeedInput(input: string, value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && /(^|_)seed$/i.test(input);
}

export function comfyNodeTitle(nodeId: string, node: ComfyWorkflowNode | undefined): string {
  return node?._meta?.title || node?.class_type || `#${nodeId}`;
}

/** Every bindable (non-link) input of every node, grouped by node in id order. */
export function listComfyNodeInputs(workflow: ComfyWorkflow): ComfyNodeInputs[] {
  return Object.keys(workflow)
    .sort(compareNodeIds)
    .map((nodeId) => {
      const node = workflow[nodeId];
      const nodeTitle = comfyNodeTitle(nodeId, node);
      const inputs: ComfyInputInfo[] = [];
      for (const [input, value] of Object.entries(node.inputs)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
        inputs.push({
          key: comfyTargetKey({ nodeId, input }),
          nodeId,
          input,
          classType: node.class_type,
          nodeTitle,
          value,
          valueType: typeof value as ComfyInputInfo['valueType'],
          mediaKind: mediaKindFor(node.class_type, input, value),
          isSeed: isComfySeedInput(input, value),
        });
      }
      return { nodeId, classType: node.class_type, nodeTitle, inputs };
    })
    .filter((node) => node.inputs.length > 0);
}

export function getComfyInputValue(workflow: ComfyWorkflow | undefined, target: ComfyInputTarget): unknown {
  return workflow?.[target.nodeId]?.inputs?.[target.input];
}

const VIDEO_OUTPUT_PATTERN = /(savevideo|savewebm|videocombine)/i;

/** What the workflow saves: video when it has a video-saving node, image otherwise. */
export function detectComfyOutputKind(workflow: ComfyWorkflow): 'image' | 'video' {
  return Object.values(workflow).some((node) => VIDEO_OUTPUT_PATTERN.test(node.class_type)) ? 'video' : 'image';
}

/**
 * Turn the text a user typed into the type the workflow's own value has, so a
 * bound `steps` stays a number and a bound toggle stays a boolean.
 */
export function coerceComfyValue(original: unknown, raw: string): ComfyValue {
  if (typeof original === 'number') {
    const parsed = Number(raw.trim());
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      throw new Error(`"${raw}" is not a number`);
    }
    return parsed;
  }
  if (typeof original === 'boolean') {
    return /^(true|1|yes|on)$/i.test(raw.trim());
  }
  return raw;
}

/** A copy of the workflow with the given values written into their inputs. */
export function applyComfyValues(
  workflow: ComfyWorkflow,
  values: Array<ComfyInputTarget & { value: ComfyValue }>,
): ComfyWorkflow {
  const next: ComfyWorkflow = {};
  for (const [nodeId, node] of Object.entries(workflow)) {
    next[nodeId] = { ...node, inputs: { ...node.inputs } };
  }
  for (const { nodeId, input, value } of values) {
    const node = next[nodeId];
    if (!node) throw new Error(`Node #${nodeId} is not in the workflow`);
    if (!(input in node.inputs)) throw new Error(`Node #${nodeId} (${node.class_type}) has no input "${input}"`);
    node.inputs[input] = value;
  }
  return next;
}

/**
 * The text a job shows as its prompt: every bound text value that feeds a text
 * input, in binding order (numbers and toggles are left out). With no text
 * bound, the workflow's own prompt — preferring a node titled as the positive
 * one — so the job is still recognisable.
 */
export function summarizeComfyPrompt(workflow: ComfyWorkflow | undefined, inputs: ComfyJobInput[]): string {
  const bound = inputs
    .filter((input) => input.kind === 'text' && typeof getComfyInputValue(workflow, input) === 'string')
    .map((input) => input.value.trim())
    .filter(Boolean)
    .join('\n\n');
  if (bound || !workflow) return bound;

  const candidates = listComfyNodeInputs(workflow)
    .flatMap((node) => node.inputs)
    .filter((info) => info.valueType === 'string' && /^(text|prompt|positive)$/i.test(info.input) && String(info.value).trim());
  const positive = candidates.find((info) => /positive/i.test(info.nodeTitle)) || candidates[0];
  return positive ? String(positive.value).trim() : '';
}
