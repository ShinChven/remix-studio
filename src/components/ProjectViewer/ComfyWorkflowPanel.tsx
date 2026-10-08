import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  Blend,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Dices,
  Eye,
  EyeOff,
  FileJson,
  Film,
  ImageIcon,
  Library as LibraryIcon,
  Loader2,
  Maximize2,
  Music,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Shuffle,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { imageDisplayUrl, testComfyConnection, type ComfyConnectionResult } from '../../api';
import type { ComfyBinding, Library, Project, WorkflowItem } from '../../types';
import {
  ComfyInputInfo,
  comfyTargetKey,
  detectComfyOutputKind,
  getComfyInputValue,
  isSameComfyTarget,
  listComfyNodeInputs,
  normalizeComfyAddress,
  parseComfyWorkflow,
} from '../../lib/comfyWorkflow';
import { LibrarySelectionModal } from './LibrarySelectionModal';
import { WorkflowItem as WorkflowItemCard } from './WorkflowItem';
import { ConfirmModal } from '../ConfirmModal';
import { NumberInput } from '../NumberInput';

const LAST_URL_STORAGE_KEY = 'remix-studio:comfyui:last-url';

type BindingSource = 'default' | 'input' | 'remix' | 'import' | 'library';

/**
 * Where an input's value comes from. A text input takes typed text, or is
 * remixed: built from items — typed text and libraries — joined in order like
 * a regular project's workflow. A text input bound to a library on its own,
 * from before remixing, reads as a remix of that one library.
 */
function sourceOf(info: ComfyInputInfo, parts: WorkflowItem[]): BindingSource {
  if (parts.length === 0) return 'default';
  if (info.mediaKind) return parts[0].type === 'library' ? 'library' : 'import';
  const isTypedText = parts.length === 1 && parts[0].type === 'text' && !parts[0].comfyTarget?.remix;
  return isTypedText ? 'input' : 'remix';
}

/** What picking a library does: bind a file input to it, add it to a remix, or swap one item for it. */
interface LibraryPick {
  info: ComfyInputInfo;
  append?: boolean;
  partId?: string;
}

/** Inputs worth opening a node for: prompts, loaded files, seeds and sizes. */
function isNotableInput(info: ComfyInputInfo): boolean {
  if (info.mediaKind || info.isSeed) return true;
  if (info.valueType === 'string' && /(text|prompt)/i.test(info.input)) return true;
  return /^(width|height|steps|cfg|denoise|batch_size|length|frames?)$/i.test(info.input);
}

function readLastUrl(): string | null {
  try {
    return localStorage.getItem(LAST_URL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberUrl(url: string) {
  try {
    localStorage.setItem(LAST_URL_STORAGE_KEY, url);
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

function formatGigabytes(bytes?: number) {
  return typeof bytes === 'number' ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : '';
}

const sectionLabelClass = 'text-[9px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-500';
const fieldClass = 'w-full rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white/70 dark:bg-black/40 px-3 py-2 text-base sm:text-xs text-neutral-900 dark:text-neutral-200 shadow-inner focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10 transition-all';
const smallButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed';

/** A text field that saves when it loses focus rather than on every keystroke. */
function CommitTextarea({ value, onCommit, placeholder }: { value: string; onCommit: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      value={draft}
      rows={3}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      className={`${fieldClass} resize-y min-h-[72px] leading-relaxed custom-scrollbar`}
    />
  );
}

/** A number field that only hands back finite numbers; anything else snaps back on blur. */
function NumberField({ value, onCommit, disabled, placeholder, label }: {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = !disabled && (draft.trim() === '' || !Number.isFinite(Number(draft.trim())));
  const commit = () => {
    if (draft === value) return;
    if (invalid) setDraft(value);
    else onCommit(draft.trim());
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`${fieldClass} !w-32 !py-1.5 font-mono text-right disabled:opacity-60 ${invalid ? '!border-red-500/60' : ''}`}
    />
  );
}

interface ComfyWorkflowPanelProps {
  localProject: Project;
  libraries: Library[];
  isExpanded: boolean;
  uploadingItemIds: Set<string>;
  isRefreshingLibraries: boolean;
  libraryRefreshError: string | null;
  onSaveProject: (project: Project) => void;
  onRefreshLibraries: () => Promise<unknown>;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onAudioUpload: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  onEditItem: (item: WorkflowItem) => void;
  onPreviewLibrary: (library: Library, workflowItemId: string) => void;
  onLightbox: (images: string[], index: number) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onSelectFromLibrary: (id: string) => void;
  onSaveToLibrary: (item: WorkflowItem) => void;
}

/**
 * The workflow side of a ComfyUI project: where its instance lives, the
 * API-format workflow it runs, and which of that workflow's inputs each job
 * fills in. Every bound input is a workflow item carrying a `comfyTarget`, so
 * typed values, imported files and libraries combine into jobs exactly the way
 * a regular project's workflow does.
 */
export function ComfyWorkflowPanel({
  localProject,
  libraries,
  isExpanded,
  uploadingItemIds,
  isRefreshingLibraries,
  libraryRefreshError,
  onSaveProject,
  onRefreshLibraries,
  onImageUpload,
  onVideoUpload,
  onAudioUpload,
  onEditItem,
  onPreviewLibrary,
  onLightbox,
  onUpdateTags,
  onSelectFromLibrary,
  onSaveToLibrary,
}: ComfyWorkflowPanelProps) {
  const { t } = useTranslation();
  const workflow = localProject.comfyWorkflow;
  const items = localProject.workflow || [];

  // ---- Connection ----
  const [urlDraft, setUrlDraft] = useState(localProject.comfyUrl || '');
  const [passwordDraft, setPasswordDraft] = useState(localProject.comfyPassword || '');
  const [showPassword, setShowPassword] = useState(false);
  const [connection, setConnection] = useState<ComfyConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const lastUrl = useMemo(readLastUrl, []);
  const testRunRef = useRef(0);
  // What was last handed to onSaveProject. Blurring a field and clicking
  // "Test" both commit, before the project state catches up with the first.
  const savedConnectionRef = useRef({ url: localProject.comfyUrl, password: localProject.comfyPassword });

  useEffect(() => {
    setUrlDraft(localProject.comfyUrl || '');
    setPasswordDraft(localProject.comfyPassword || '');
    savedConnectionRef.current = { url: localProject.comfyUrl, password: localProject.comfyPassword };
  }, [localProject.comfyUrl, localProject.comfyPassword]);

  const runConnectionTest = async (url: string, password?: string) => {
    const run = ++testRunRef.current;
    setIsTesting(true);
    try {
      const result = await testComfyConnection(url, password);
      if (run === testRunRef.current) setConnection(result);
    } catch (e: any) {
      if (run === testRunRef.current) setConnection({ ok: false, error: e?.message });
    } finally {
      if (run === testRunRef.current) setIsTesting(false);
    }
  };

  // Check the saved address whenever it (or its password) changes, so a stale
  // one shows up before a whole batch fails against it.
  useEffect(() => {
    setConnection(null);
    if (localProject.comfyUrl) void runConnectionTest(localProject.comfyUrl, localProject.comfyPassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localProject.comfyUrl, localProject.comfyPassword]);

  /**
   * Save the address and password fields in one go — two saves built from the
   * same project state would undo each other. Returns the saved address and
   * whether anything changed, or null when the address is invalid.
   */
  const commitConnection = (next: { url?: string } = {}): { url?: string; changed: boolean } | null => {
    const rawUrl = next.url ?? urlDraft;
    let url: string | undefined;
    if (rawUrl.trim()) {
      try {
        url = normalizeComfyAddress(rawUrl);
      } catch {
        toast.error(t('projectViewer.comfy.invalidUrl'));
        return null;
      }
      setUrlDraft(url);
      rememberUrl(url);
    }
    // Optional: an empty field means the instance has no password.
    const password = passwordDraft || undefined;
    const saved = savedConnectionRef.current;
    if (url === saved.url && password === saved.password) return { url, changed: false };
    savedConnectionRef.current = { url, password };
    onSaveProject({ ...localProject, comfyUrl: url, comfyPassword: password });
    return { url, changed: true };
  };

  const handleTest = () => {
    const committed = commitConnection();
    // A changed address is tested by the effect above once it is saved.
    if (committed?.url && !committed.changed) void runConnectionTest(committed.url, passwordDraft || undefined);
  };

  // ---- Workflow JSON ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [confirmRemoveWorkflow, setConfirmRemoveWorkflow] = useState(false);

  const applyWorkflow = (raw: unknown): boolean => {
    const parsed = parseComfyWorkflow(raw);
    if (parsed.ok === false) {
      toast.error(t(`projectViewer.comfy.parseErrors.${parsed.error}`));
      return false;
    }
    const next = parsed.workflow;
    // Keep the bindings whose input survived the new version of the workflow.
    const kept = items.filter((item) => !item.comfyTarget || getComfyInputValue(next, item.comfyTarget) !== undefined);
    const dropped = items.length - kept.length;
    const format = detectComfyOutputKind(next) === 'video'
      ? 'mp4'
      : (localProject.format && localProject.format !== 'mp4' ? localProject.format : 'png');
    onSaveProject({ ...localProject, comfyWorkflow: next, workflow: kept, format });
    toast.success(dropped > 0
      ? t('projectViewer.comfy.workflowLoadedDropped', { count: dropped })
      : t('projectViewer.comfy.workflowLoaded', { count: Object.keys(next).length }));
    return true;
  };

  const handleWorkflowFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    applyWorkflow(await file.text());
  };

  const removeWorkflow = () => {
    onSaveProject({ ...localProject, comfyWorkflow: undefined, workflow: items.filter((item) => !item.comfyTarget) });
    setConfirmRemoveWorkflow(false);
  };

  // ---- Inputs ----
  const nodes = useMemo(() => (workflow ? listComfyNodeInputs(workflow) : []), [workflow]);
  // Each bound input's parts, in workflow order. Only text inputs take more than one.
  const bindings = useMemo(() => {
    const map = new Map<string, WorkflowItem[]>();
    for (const item of items) {
      if (!item.comfyTarget) continue;
      const key = comfyTargetKey(item.comfyTarget);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [items]);
  const [query, setQuery] = useState('');
  const [mappedOnly, setMappedOnly] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [libraryPick, setLibraryPick] = useState<LibraryPick | null>(null);
  // A source switch that would drop a remix's items, awaiting confirmation.
  const [pendingSwitch, setPendingSwitch] = useState<{ info: ComfyInputInfo; source: BindingSource } | null>(null);
  // A remix item being dragged to a new position, within its own input.
  const [remixDrag, setRemixDrag] = useState<{ key: string; from: number; over: number | null } | null>(null);

  const visibleNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes
      .map((node) => {
        const nodeMatches = !!q && `${node.nodeId} ${node.nodeTitle} ${node.classType}`.toLowerCase().includes(q);
        const inputs = node.inputs.filter((info) => {
          if (mappedOnly && !bindings.has(info.key)) return false;
          return !q || nodeMatches || info.input.toLowerCase().includes(q);
        });
        return { ...node, inputs };
      })
      .filter((node) => node.inputs.length > 0);
  }, [nodes, query, mappedOnly, bindings]);

  const isNodeOpen = (node: (typeof nodes)[number]) => {
    if (query.trim() || mappedOnly) return true;
    return expandedNodes[node.nodeId]
      ?? node.inputs.some((info) => bindings.has(info.key) || isNotableInput(info));
  };

  /**
   * Save the items in this order. Items load sorted by their stored `order`,
   * so it is renumbered here — an input's parts are joined in that order.
   */
  const saveItems = (next: WorkflowItem[]) => {
    onSaveProject({ ...localProject, workflow: next.map((item, order) => ({ ...item, order })) });
  };

  /** Bind (or rebind) one input to a single item, keeping the binding's place in the item order. */
  const saveBinding = (info: ComfyInputInfo, item: WorkflowItem | null) => {
    let replaced = false;
    const next: WorkflowItem[] = [];
    for (const existing of items) {
      if (isSameComfyTarget(existing.comfyTarget, info)) {
        if (item && !replaced) next.push(item);
        replaced = true;
      } else {
        next.push(existing);
      }
    }
    if (item && !replaced) next.push(item);
    saveItems(next);
  };

  const bindingOf = (info: ComfyInputInfo, remix = false): ComfyBinding => ({
    nodeId: info.nodeId,
    input: info.input,
    ...(remix ? { remix: true } : {}),
  });

  const newTextItem = (info: ComfyInputInfo, value: string, remix = false): WorkflowItem => ({
    id: crypto.randomUUID(),
    type: 'text',
    value,
    comfyTarget: bindingOf(info, remix),
  });

  /** Add an item to an input's remix, after its last one so the remix stays together and in order. */
  const addRemixItem = (info: ComfyInputInfo, item: WorkflowItem) => {
    const parts = bindings.get(info.key) || [];
    const last = parts[parts.length - 1];
    const index = last ? items.findIndex((existing) => existing.id === last.id) + 1 : items.length;
    saveItems([...items.slice(0, index), item, ...items.slice(index)]);
  };

  const removeItem = (id: string) => {
    saveItems(items.filter((item) => item.id !== id));
  };

  const toggleItemDisabled = (id: string) => {
    onSaveProject({ ...localProject, workflow: items.map((item) => (item.id === id ? { ...item, disabled: !item.disabled } : item)) });
  };

  /** Move one of a remix's items to another position within that remix. */
  const moveRemixItem = (info: ComfyInputInfo, from: number, to: number) => {
    const parts = bindings.get(info.key) || [];
    if (from === to || !parts[from] || !parts[to]) return;
    const reordered = [...parts];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    let next = 0;
    saveItems(items.map((item) => (isSameComfyTarget(item.comfyTarget, info) ? reordered[next++] : item)));
  };

  const openLibraryPicker = (pick: LibraryPick) => {
    setLibraryPick(pick);
    void onRefreshLibraries().catch(() => {});
  };

  /**
   * Remix a text input. Nothing is lost on the way in: typed text becomes the
   * remix's first item, and an input left at its default starts from the
   * workflow's own value.
   */
  const startRemix = (info: ComfyInputInfo, parts: WorkflowItem[]) => {
    const typed = parts[0];
    saveBinding(info, typed
      ? { ...typed, comfyTarget: bindingOf(info, true) }
      : newTextItem(info, String(info.value), true));
  };

  /** Switch an input to one source, replacing all of its items. */
  const applySource = (info: ComfyInputInfo, source: BindingSource, parts: WorkflowItem[]) => {
    if (source === 'library') {
      openLibraryPicker({ info });
      return;
    }
    if (source === 'default') {
      saveBinding(info, null);
      return;
    }
    if (source === 'input') {
      // Keep the remix's first typed text, if it has one.
      const text = parts.find((part) => part.type === 'text');
      saveBinding(info, text ? { ...text, comfyTarget: bindingOf(info) } : newTextItem(info, String(info.value)));
      return;
    }
    saveBinding(info, { id: crypto.randomUUID(), type: info.mediaKind || 'image', value: '', comfyTarget: bindingOf(info) });
  };

  const setSource = (info: ComfyInputInfo, source: BindingSource) => {
    const parts = bindings.get(info.key) || [];
    const current = sourceOf(info, parts);
    if (source === current && source !== 'library') return;
    if (source === 'remix') {
      startRemix(info, parts);
      return;
    }
    // Leaving a remix drops its items, so ask first when there is more than one to lose.
    if (parts.length > 1) {
      setPendingSwitch({ info, source });
      return;
    }
    applySource(info, source, parts);
  };

  const updateItemValue = (id: string, value: string) => {
    onSaveProject({ ...localProject, workflow: items.map((item) => (item.id === id ? { ...item, value } : item)) });
  };

  /**
   * Numbers and toggles are edited in place: a value other than the workflow's
   * overrides it, the workflow's own value drops the override. A seed is the
   * exception — left alone it is random, so any typed value pins it.
   */
  const setScalarValue = (info: ComfyInputInfo, raw: string) => {
    const current = bindings.get(info.key)?.[0];
    const matchesWorkflow = info.valueType === 'number' ? Number(raw) === info.value : raw === String(info.value);
    if (matchesWorkflow && !info.isSeed) {
      if (current) saveBinding(info, null);
      return;
    }
    saveBinding(info, {
      id: current?.id ?? crypto.randomUUID(),
      type: 'text',
      value: raw,
      comfyTarget: { nodeId: info.nodeId, input: info.input },
    });
  };

  const handleLibraryPicked = (libraryId: string) => {
    const pick = libraryPick;
    setLibraryPick(null);
    if (!pick) return;
    const { info } = pick;
    const parts = bindings.get(info.key) || [];
    // Text inputs only take libraries as part of a remix.
    const item: WorkflowItem = {
      id: crypto.randomUUID(),
      type: 'library',
      value: libraryId,
      comfyTarget: bindingOf(info, !info.mediaKind),
    };
    if (pick.append) {
      addRemixItem(info, item);
      return;
    }
    if (pick.partId) {
      // A different library brings different tags, so its tag filter starts over.
      if (parts.some((part) => part.id === pick.partId && part.type === 'library' && part.value === libraryId)) return;
      saveItems(items.map((existing) => (existing.id === pick.partId ? item : existing)));
      return;
    }
    if (parts.length === 1 && parts[0].type === 'library' && parts[0].value === libraryId) return;
    saveBinding(info, item);
  };

  const pickerLibraries = useMemo(() => {
    if (!libraryPick) return [];
    const kind = libraryPick.info.mediaKind || 'text';
    return libraries.filter((library) => (library.type || 'text') === kind);
  }, [libraries, libraryPick]);

  const mappedCount = bindings.size;

  const sourceOptions = (info: ComfyInputInfo): Array<{ source: BindingSource; label: string; icon: typeof Type }> => [
    { source: 'default', label: t('projectViewer.comfy.sourceDefault'), icon: RefreshCw },
    ...(info.mediaKind
      ? [
        { source: 'import' as const, label: t('projectViewer.comfy.sourceImport'), icon: Upload },
        { source: 'library' as const, label: t('projectViewer.comfy.sourceLibrary'), icon: LibraryIcon },
      ]
      : [
        { source: 'input' as const, label: t('projectViewer.comfy.sourceInput'), icon: Type },
        { source: 'remix' as const, label: t('projectViewer.comfy.sourceRemix'), icon: Blend },
      ]),
  ];

  const renderValuePreview = (info: ComfyInputInfo) => {
    const text = String(info.value);
    return text === '' ? t('projectViewer.comfy.emptyValue') : text;
  };

  const renderScalarRow = (info: ComfyInputInfo, item: WorkflowItem | undefined) => {
    const override = item?.type === 'text' ? item.value : undefined;
    const isRandomSeed = info.isSeed && override === undefined;
    const subtitle = isRandomSeed
      ? t('projectViewer.comfy.seedHint', { value: info.value })
      : override !== undefined && !info.isSeed
        ? t('projectViewer.comfy.workflowValue', { value: String(info.value) })
        : null;
    const boolValue = override !== undefined ? /^(true|1|yes|on)$/i.test(override.trim()) : info.value === true;

    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate">{info.input}</div>
          {subtitle && <div className="text-[10px] text-neutral-500 truncate" title={subtitle}>{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {override !== undefined && !info.isSeed && (
            <button
              type="button"
              onClick={() => saveBinding(info, null)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10 transition-all"
              title={t('projectViewer.comfy.resetToDefault')}
              aria-label={t('projectViewer.comfy.resetToDefault')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {info.isSeed && (
            <button
              type="button"
              onClick={() => (isRandomSeed ? setScalarValue(info, String(info.value)) : saveBinding(info, null))}
              aria-pressed={isRandomSeed}
              className={`p-1.5 rounded-lg border transition-all ${
                isRandomSeed
                  ? 'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300'
                  : 'border-neutral-200/70 dark:border-white/10 text-neutral-400 hover:text-orange-500'
              }`}
              title={t('projectViewer.comfy.randomSeed')}
              aria-label={t('projectViewer.comfy.randomSeed')}
            >
              <Dices className="w-3.5 h-3.5" />
            </button>
          )}
          {info.valueType === 'boolean' ? (
            <button
              type="button"
              role="switch"
              aria-checked={boolValue}
              aria-label={info.input}
              onClick={() => setScalarValue(info, String(!boolValue))}
              className={`w-9 h-5 rounded-full relative transition-all duration-300 ${boolValue ? 'bg-orange-500' : 'bg-neutral-200 dark:bg-neutral-800'}`}
            >
              <span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${boolValue ? 'left-5' : 'left-1'}`} />
            </button>
          ) : (
            <NumberField
              label={info.input}
              value={isRandomSeed ? '' : (override ?? String(info.value))}
              disabled={isRandomSeed}
              placeholder={isRandomSeed ? t('projectViewer.comfy.randomEachJob') : undefined}
              onCommit={(value) => setScalarValue(info, value)}
            />
          )}
        </div>
      </div>
    );
  };

  const renderEditor = (info: ComfyInputInfo, item: WorkflowItem) => {
    if (item.type === 'text') {
      return (
        <div className="relative">
          <CommitTextarea value={item.value} onCommit={(value) => updateItemValue(item.id, value)} placeholder={t('projectViewer.comfy.emptyValue')} />
          <button
            type="button"
            onClick={() => onEditItem(item)}
            className="absolute top-2 right-2 p-1 rounded-md bg-white/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-orange-500 transition-colors"
            title={t('projectViewer.common.edit')}
            aria-label={t('projectViewer.common.edit')}
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      );
    }

    if (item.type === 'library') {
      const library = libraries.find((lib) => lib.id === item.value);
      const firstImage = library?.type === 'image' ? library.items[0]?.thumbnailUrl || library.items[0]?.content : undefined;
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { if (library) onPreviewLibrary(library, item.id); }}
            className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-black/30 p-2 text-left hover:border-orange-500/40 transition-all"
          >
            <div className="w-9 h-9 shrink-0 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center overflow-hidden">
              {firstImage ? <img src={imageDisplayUrl(firstImage)} alt="" className="w-full h-full object-cover" /> : <LibraryIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-neutral-900 dark:text-white truncate">{library?.name || t('projectViewer.workflow.unknownLibrary')}</div>
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                {t('projectViewer.workflow.itemsCount', { count: library?.items.length || 0 })}
                {(item.selectedTags || []).length > 0 && ` · ${t('projectViewer.workflow.filteredTags', { count: (item.selectedTags || []).length })}`}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => openLibraryPicker({ info, partId: item.id })}
            className="p-2 rounded-lg border border-transparent text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10 transition-all"
            title={t('projectViewer.workflow.changeLibrary')}
            aria-label={t('projectViewer.workflow.changeLibrary')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      );
    }

    // Imported file
    const isUploading = uploadingItemIds.has(item.id);
    const onUpload = item.type === 'video' ? onVideoUpload : item.type === 'audio' ? onAudioUpload : onImageUpload;
    const Icon = item.type === 'video' ? Film : item.type === 'audio' ? Music : ImageIcon;
    const uploadButton = (
      <label className={`${smallButtonClass} cursor-pointer ${isUploading ? 'pointer-events-none opacity-60' : ''}`}>
        {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {item.value ? t('projectViewer.comfy.replaceFile') : t('projectViewer.comfy.chooseFile')}
        <input type="file" accept={`${item.type}/*`} className="hidden" disabled={isUploading} onChange={(e) => onUpload(e, item.id)} />
      </label>
    );

    if (!item.value) {
      return (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-800 p-3">
          <span className="flex items-center gap-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            <Icon className="w-4 h-4" /> {t('projectViewer.comfy.noFileYet')}
          </span>
          {uploadButton}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3">
        {item.type === 'image' && (
          <button type="button" onClick={() => onLightbox([imageDisplayUrl(item.optimizedUrl || item.value)], 0)} className="shrink-0">
            <img src={imageDisplayUrl(item.thumbnailUrl || item.value)} alt="" className="w-16 h-16 rounded-lg object-cover border border-neutral-200 dark:border-white/10" />
          </button>
        )}
        {item.type === 'video' && (
          <video src={imageDisplayUrl(item.value)} poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined} className="w-24 h-16 rounded-lg object-cover border border-neutral-200 dark:border-white/10" muted controls />
        )}
        {item.type === 'audio' && <audio src={imageDisplayUrl(item.value)} controls className="flex-1 min-w-0" />}
        <div className={item.type === 'audio' ? '' : 'flex-1'}>{uploadButton}</div>
      </div>
    );
  };

  /**
   * A remixed text input: its items as the cards a regular project's workflow
   * uses — drag to reorder, edit, pick from a library, filter by tags, disable —
   * joined in order into the input's value, with every library multiplying the
   * combinations.
   */
  const renderRemix = (info: ComfyInputInfo, parts: WorkflowItem[]) => {
    const drag = remixDrag?.key === info.key ? remixDrag : null;
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-orange-500/30 bg-orange-500/[0.03] p-2">
        {parts.map((part, index) => (
          <WorkflowItemCard
            key={part.id}
            item={part}
            index={index}
            draggedIndex={drag ? drag.from : null}
            dragOverIndex={drag ? drag.over : null}
            onDragStart={(e, from) => {
              e.dataTransfer.effectAllowed = 'move';
              setRemixDrag({ key: info.key, from, over: null });
            }}
            onDragOver={(e, over) => {
              if (!drag) return;
              e.preventDefault();
              if (drag.over !== over) setRemixDrag({ ...drag, over });
            }}
            onDrop={(e, to) => {
              if (!drag) return;
              e.preventDefault();
              moveRemixItem(info, drag.from, to);
              setRemixDrag(null);
            }}
            onDragEnd={() => setRemixDrag(null)}
            onRemove={removeItem}
            onEdit={onEditItem}
            onPreviewLibrary={(library) => onPreviewLibrary(library, part.id)}
            onImageUpload={onImageUpload}
            onVideoUpload={onVideoUpload}
            onAudioUpload={onAudioUpload}
            uploadingItemIds={uploadingItemIds}
            onLightbox={onLightbox}
            onUpdateTags={onUpdateTags}
            onSelectFromLibrary={onSelectFromLibrary}
            onChangeLibrary={(id) => openLibraryPicker({ info, partId: id })}
            onSaveToLibrary={onSaveToLibrary}
            libraries={libraries}
            onToggleDisable={toggleItemDisabled}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => addRemixItem(info, newTextItem(info, '', true))} className={smallButtonClass}>
            <Plus className="w-3 h-3" /> {t('projectViewer.comfy.addTextPart')}
          </button>
          <button type="button" onClick={() => openLibraryPicker({ info, append: true })} className={smallButtonClass}>
            <Plus className="w-3 h-3" /> {t('projectViewer.comfy.addLibraryPart')}
          </button>
        </div>
        <p className="px-0.5 text-[10px] leading-relaxed text-neutral-500">{t('projectViewer.comfy.remixHint')}</p>
      </div>
    );
  };

  return (
    <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4 ${isExpanded ? 'lg:px-8' : ''}`}>
      {/* Connection */}
      <section className="rounded-xl border border-neutral-200/60 dark:border-white/10 bg-white/50 dark:bg-black/30 p-3 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="comfy-url" className={sectionLabelClass}>{t('projectViewer.comfy.addressLabel')}</label>
          {connection && !isTesting && (
            connection.ok ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> {t('projectViewer.comfy.connected')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                <AlertCircle className="w-3 h-3" /> {t('projectViewer.comfy.unreachable')}
              </span>
            )
          )}
        </div>
        <div className="flex gap-2">
          <input
            id="comfy-url"
            type="url"
            value={urlDraft}
            placeholder="http://127.0.0.1:8188"
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => { commitConnection(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTest(); }}
            className={`${fieldClass} font-mono`}
          />
          <button type="button" onClick={handleTest} disabled={isTesting || !urlDraft.trim()} className={`${smallButtonClass} shrink-0`}>
            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />}
            {t('projectViewer.comfy.test')}
          </button>
        </div>
        {!localProject.comfyUrl && lastUrl && (
          <button
            type="button"
            onClick={() => commitConnection({ url: lastUrl })}
            className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline truncate max-w-full text-left"
          >
            {t('projectViewer.comfy.useLastAddress', { url: lastUrl })}
          </button>
        )}
        {connection?.ok && (
          <p className="text-[10px] font-medium text-neutral-500 truncate">
            {[connection.version && `ComfyUI ${connection.version}`, connection.device, connection.vramFree !== undefined && t('projectViewer.comfy.vramFree', { free: formatGigabytes(connection.vramFree), total: formatGigabytes(connection.vramTotal) })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {connection && !connection.ok && (
          <p className="text-[10px] font-medium text-red-500 break-words">{connection.error}</p>
        )}
        <p className="text-[10px] leading-relaxed text-neutral-500">{t('projectViewer.comfy.addressHelp')}</p>
        <div className="space-y-1.5 pt-1">
          <label htmlFor="comfy-password" className={sectionLabelClass}>{t('projectViewer.comfy.passwordLabel')}</label>
          <div className="relative">
            <input
              id="comfy-password"
              name="comfy-access-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              spellCheck={false}
              value={passwordDraft}
              placeholder={t('projectViewer.comfy.passwordPlaceholder')}
              onChange={(e) => setPasswordDraft(e.target.value)}
              onBlur={() => { commitConnection(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTest(); }}
              className={`${fieldClass} font-mono pr-9`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              title={showPassword ? t('projectViewer.comfy.hidePassword') : t('projectViewer.comfy.showPassword')}
              aria-label={showPassword ? t('projectViewer.comfy.hidePassword') : t('projectViewer.comfy.showPassword')}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-neutral-500">{t('projectViewer.comfy.passwordHelp')}</p>
        </div>
      </section>

      {/* Workflow JSON */}
      <section className="rounded-xl border border-neutral-200/60 dark:border-white/10 bg-white/50 dark:bg-black/30 p-3 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={sectionLabelClass}>{t('projectViewer.comfy.workflowLabel')}</span>
          {workflow && (
            <span className="text-[10px] font-bold text-neutral-500">
              {t('projectViewer.comfy.workflowSummary', {
                count: Object.keys(workflow).length,
                output: detectComfyOutputKind(workflow) === 'video' ? t('projectViewer.comfy.outputVideo') : t('projectViewer.comfy.outputImage'),
              })}
            </span>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleWorkflowFile} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className={smallButtonClass}>
            <FileJson className="w-3 h-3" /> {workflow ? t('projectViewer.comfy.replaceWorkflow') : t('projectViewer.comfy.uploadWorkflow')}
          </button>
          <button type="button" onClick={() => setIsPasteOpen(true)} className={smallButtonClass}>
            <ClipboardPaste className="w-3 h-3" /> {t('projectViewer.comfy.pasteWorkflow')}
          </button>
          {workflow && (
            <button type="button" onClick={() => setConfirmRemoveWorkflow(true)} className={`${smallButtonClass} hover:!text-red-500 hover:!border-red-500/30`}>
              <Trash2 className="w-3 h-3" /> {t('projectViewer.comfy.removeWorkflow')}
            </button>
          )}
        </div>
        {!workflow && <p className="text-[10px] leading-relaxed text-neutral-500">{t('projectViewer.comfy.workflowHelp')}</p>}
      </section>

      {/* Inputs */}
      {workflow && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className={sectionLabelClass}>{t('projectViewer.comfy.inputsLabel')}</span>
            <span className="text-[10px] font-bold text-neutral-500">{t('projectViewer.comfy.mappedCount', { count: mappedCount })}</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('projectViewer.comfy.searchInputs')}
                className={`${fieldClass} pl-8`}
              />
            </div>
            <button
              type="button"
              onClick={() => setMappedOnly((value) => !value)}
              className={`${smallButtonClass} shrink-0 ${mappedOnly ? '!border-orange-500/50 !bg-orange-500/10 !text-orange-600 dark:!text-orange-300' : ''}`}
              aria-pressed={mappedOnly}
            >
              {t('projectViewer.comfy.mappedOnly')}
            </button>
          </div>

          {visibleNodes.length === 0 && (
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 py-8 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              {mappedOnly && mappedCount === 0 ? t('projectViewer.comfy.noMappedInputs') : t('projectViewer.comfy.noMatchingInputs')}
            </div>
          )}

          <div className={isExpanded ? 'grid gap-3 lg:grid-cols-2 lg:items-start' : 'space-y-3'}>
            {visibleNodes.map((node) => {
              const open = isNodeOpen(node);
              const boundInNode = node.inputs.filter((info) => bindings.has(info.key)).length;
              return (
                <div key={node.nodeId} className="rounded-xl border border-neutral-200/60 dark:border-white/10 bg-white/50 dark:bg-black/30 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedNodes((prev) => ({ ...prev, [node.nodeId]: !open }))}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-100/60 dark:hover:bg-white/5 transition-colors"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />}
                    <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">#{node.nodeId}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-neutral-900 dark:text-white">{node.nodeTitle}</span>
                    {node.nodeTitle !== node.classType && (
                      <span className="hidden sm:inline truncate max-w-[40%] text-[10px] font-medium text-neutral-500">{node.classType}</span>
                    )}
                    {boundInNode > 0 && (
                      <span className="shrink-0 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-300 px-1.5 py-0.5 text-[9px] font-black">{boundInNode}</span>
                    )}
                  </button>

                  {open && (
                    <div className="divide-y divide-neutral-200/60 dark:divide-white/5 border-t border-neutral-200/60 dark:border-white/5">
                      {node.inputs.map((info) => {
                        const parts = bindings.get(info.key) || [];
                        const source = sourceOf(info, parts);
                        if (!info.mediaKind && info.valueType !== 'string') {
                          return (
                            <div key={info.key} className="px-3 py-2.5">
                              {renderScalarRow(info, parts[0])}
                            </div>
                          );
                        }
                        return (
                          <div key={info.key} className="px-3 py-2.5 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate">{info.input}</div>
                                {source === 'default' && (
                                  <div className="text-[10px] text-neutral-500 truncate" title={String(info.value)}>{renderValuePreview(info)}</div>
                                )}
                              </div>
                              <div className="flex shrink-0 rounded-lg border border-neutral-200/70 dark:border-white/10 bg-neutral-100/60 dark:bg-black/40 p-0.5" role="radiogroup" aria-label={info.input}>
                                {sourceOptions(info).map(({ source: option, label, icon: Icon }) => (
                                  <button
                                    key={option}
                                    type="button"
                                    role="radio"
                                    aria-checked={source === option}
                                    onClick={() => setSource(info, option)}
                                    title={label}
                                    className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all ${
                                      source === option
                                        ? 'bg-white dark:bg-neutral-800 text-orange-600 dark:text-orange-300 shadow-sm'
                                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                                    }`}
                                  >
                                    <Icon className="w-3 h-3" />
                                    <span className={isExpanded ? '' : 'hidden @min-[22rem]/panel:inline'}>{label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            {source === 'remix' ? renderRemix(info, parts) : parts[0] && renderEditor(info, parts[0])}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <LibrarySelectionModal
        isOpen={libraryPick !== null}
        onClose={() => setLibraryPick(null)}
        onSelect={handleLibraryPicked}
        libraries={pickerLibraries}
        selectedLibraryIds={items.filter((item) => item.comfyTarget && item.type === 'library').map((item) => item.value)}
        isLoading={isRefreshingLibraries}
        error={libraryRefreshError}
        description={libraryPick
          ? t('projectViewer.comfy.libraryPickerDescription', {
            input: libraryPick.info.input,
            node: libraryPick.info.nodeTitle,
            kind: t(`projectViewer.comfy.kind.${libraryPick.info.mediaKind || 'text'}`),
          })
          : undefined}
      />

      <ConfirmModal
        isOpen={pendingSwitch !== null}
        onClose={() => setPendingSwitch(null)}
        onConfirm={() => {
          if (pendingSwitch) applySource(pendingSwitch.info, pendingSwitch.source, bindings.get(pendingSwitch.info.key) || []);
          setPendingSwitch(null);
        }}
        title={t('projectViewer.comfy.replacePartsTitle')}
        message={pendingSwitch
          ? t('projectViewer.comfy.replacePartsMessage', {
            count: bindings.get(pendingSwitch.info.key)?.length ?? 0,
            input: pendingSwitch.info.input,
          })
          : ''}
        confirmText={t('projectViewer.comfy.replaceParts')}
        type="danger"
      />

      <ConfirmModal
        isOpen={confirmRemoveWorkflow}
        onClose={() => setConfirmRemoveWorkflow(false)}
        onConfirm={removeWorkflow}
        title={t('projectViewer.comfy.removeWorkflowTitle')}
        message={t('projectViewer.comfy.removeWorkflowMessage')}
        confirmText={t('projectViewer.comfy.removeWorkflow')}
        type="danger"
      />

      {isPasteOpen && createPortal(
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsPasteOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-card border border-neutral-200/60 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-2xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-neutral-900 dark:text-white">{t('projectViewer.comfy.pasteTitle')}</h3>
                <p className="mt-1 text-[11px] text-neutral-500">{t('projectViewer.comfy.workflowHelp')}</p>
              </div>
              <button type="button" onClick={() => setIsPasteOpen(false)} className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white" aria-label={t('projectViewer.common.close')}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={14}
              autoFocus
              spellCheck={false}
              placeholder='{ "3": { "class_type": "KSampler", "inputs": { ... } } }'
              className={`${fieldClass} font-mono resize-y custom-scrollbar`}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsPasteOpen(false)} className={smallButtonClass}>{t('projectViewer.common.cancel')}</button>
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={() => {
                  if (applyWorkflow(pasteText)) {
                    setPasteText('');
                    setIsPasteOpen(false);
                  }
                }}
                className={`${smallButtonClass} !bg-orange-600 !border-orange-600 !text-white hover:!bg-orange-700`}
              >
                <FileJson className="w-3 h-3" /> {t('projectViewer.comfy.loadWorkflow')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

interface ComfySettingsPanelProps {
  localProject: Project;
  onSaveProject: (project: Project) => void;
  queueCount: number;
  setQueueCount: (count: number) => void;
  combinationsCount: number;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  onAddDraftsToQueue: () => void;
  isAddingDrafts: boolean;
  draftsProgress: { current: number; total: number; stage: 'composing' | 'saving' } | null;
}

const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;

/** The footer of a ComfyUI project: output format, batch size and "add to drafts". */
export function ComfySettingsPanel({
  localProject,
  onSaveProject,
  queueCount,
  setQueueCount,
  combinationsCount,
  workflowError,
  uploadingItemIds,
  onAddDraftsToQueue,
  isAddingDrafts,
  draftsProgress,
}: ComfySettingsPanelProps) {
  const { t } = useTranslation();
  const isVideo = localProject.format === 'mp4';
  const hasWorkflow = !!localProject.comfyWorkflow;
  // With nothing bound the workflow still runs (with fresh seeds), once per job.
  const total = Math.max(1, combinationsCount);
  const notice = workflowError
    ? { tone: 'error' as const, text: workflowError }
    : !hasWorkflow
      ? { tone: 'warn' as const, text: t('projectViewer.comfy.loadWorkflowFirst') }
      : !localProject.comfyUrl
        ? { tone: 'warn' as const, text: t('projectViewer.comfy.setAddressBeforeRun') }
        : null;

  const chipClass = (selected: boolean) => `px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
    selected
      ? 'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300'
      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
  }`;

  return (
    <div className="shrink-0 flex flex-col gap-3 p-4 border-t border-neutral-200/50 dark:border-white/5 bg-white/60 dark:bg-black/60 backdrop-blur-2xl shadow-[0_-12px_48px_rgba(0,0,0,0.2)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={sectionLabelClass}>{t('projectViewer.comfy.outputLabel')}</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chipClass(!isVideo)} onClick={() => { if (isVideo) onSaveProject({ ...localProject, format: 'png' }); }}>
            {t('projectViewer.comfy.outputImage')}
          </button>
          <button type="button" className={chipClass(isVideo)} onClick={() => { if (!isVideo) onSaveProject({ ...localProject, format: 'mp4' }); }}>
            {t('projectViewer.comfy.outputVideo')}
          </button>
        </div>
      </div>
      {!isVideo && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={sectionLabelClass}>{t('projectViewer.comfy.formatLabel')}</span>
          <div className="flex gap-1.5">
            {IMAGE_FORMATS.map((format) => (
              <button
                key={format}
                type="button"
                className={chipClass((localProject.format || 'png') === format)}
                onClick={() => onSaveProject({ ...localProject, format })}
              >
                {format}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSaveProject({ ...localProject, shuffle: !localProject.shuffle })}
          className={`flex items-center gap-1.5 ${chipClass(!!localProject.shuffle)}`}
          aria-pressed={!!localProject.shuffle}
          title={t('projectViewer.settings.randomizeOrder')}
        >
          <Shuffle className="w-3 h-3" /> {t('projectViewer.settings.shuffle')}
        </button>
        <div className="flex items-center gap-2 bg-white/40 dark:bg-black/40 px-3 py-1.5 rounded-xl border border-neutral-200/50 dark:border-white/5 shadow-inner">
          <span className={sectionLabelClass}>{t('projectViewer.settings.jobQuantity')}</span>
          <NumberInput
            min={1}
            integer
            value={queueCount}
            onValueChange={setQueueCount}
            className="w-10 bg-transparent text-xs text-orange-600 dark:text-orange-400 font-black focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => setQueueCount(total)}
            className="text-[10px] text-neutral-600 hover:text-orange-600 dark:hover:text-orange-400 font-bold tracking-tighter transition-colors"
            title={t('projectViewer.settings.setToMaxCombinations')}
          >
            {t('projectViewer.settings.ofTotal', { count: total })}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-[10px] font-bold ${
          notice.tone === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-2">{notice.text}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onAddDraftsToQueue}
        disabled={!hasWorkflow || uploadingItemIds.size > 0 || isAddingDrafts}
        className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30 disabled:grayscale shadow-lg shadow-orange-500/20 active:scale-[0.98]"
      >
        {uploadingItemIds.size > 0 ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{t('projectViewer.settings.uploadingImages')}</>
        ) : isAddingDrafts ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {draftsProgress?.stage === 'saving'
              ? t('projectViewer.settings.savingDrafts')
              : t('projectViewer.settings.composingProgress', { current: draftsProgress?.current ?? 0, total: draftsProgress?.total ?? 0 })}
          </>
        ) : (
          <><Plus className="w-4 h-4" />{t('projectViewer.settings.addToDraft')}</>
        )}
      </button>
    </div>
  );
}
