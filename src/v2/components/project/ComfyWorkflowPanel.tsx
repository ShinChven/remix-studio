import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl, testComfyConnection, type ComfyConnectionResult } from '../../../api';
import { detectComfyOutputKind, getComfyInputValue, groupComfyBindings, isComfyRemix, isSameComfyTarget, listComfyNodeInputs, normalizeComfyAddress, parseComfyWorkflow, type ComfyInputInfo } from '../../../lib/comfyWorkflow';
import { Button, Dialog, Icon, IconButton, LoadingIndicator, Ripple, Switch, Text, TextField } from '../../../m3';
import type { ComfyBinding, Library, Project, WorkflowItem } from '../../../types';
import { ChoiceChips, SettingField } from '../../ui/ChoiceChips';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { SearchField } from '../../ui/SearchField';
import { useToast } from '../../ui/useToast';
import { LibrarySelectionDialog } from './LibrarySelectionDialog';
import { RunDock, type DraftsProgress } from './RunDock';
import { FilePickButton } from './StepCard';
import { WorkflowStep } from './WorkflowStep';

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
  return isComfyRemix(parts) ? 'remix' : 'input';
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

/** A text field that saves when it loses focus rather than on every keystroke. */
function CommitTextField({ value, onCommit, placeholder, label }: { value: string; onCommit: (value: string) => void; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <TextField
      variant="outlined"
      multiline
      rows={3}
      maxRows={10}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onValueChange={setDraft}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      fullWidth
    />
  );
}

/** A number field that only commits finite numbers; anything else snaps back on blur. */
function ScalarField({ value, onCommit, disabled, placeholder, label }: { value: string; onCommit: (value: string) => void; disabled?: boolean; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = !disabled && (draft.trim() === '' || !Number.isFinite(Number(draft.trim())));
  const commit = () => {
    if (draft === value) return;
    if (invalid) setDraft(value);
    else onCommit(draft.trim());
  };
  return (
    <TextField
      variant="outlined"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      error={invalid}
      onValueChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="v2-scalar-field"
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
  /** Asks before removing a workflow item, as the regular workflow does. */
  onRemoveItem: (id: string) => void;
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
  onRemoveItem,
  onUpdateTags,
  onSelectFromLibrary,
  onSaveToLibrary,
}: ComfyWorkflowPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
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
  // Each bound input's items, in workflow order. Only a remix has more than one.
  const bindings = useMemo(() => groupComfyBindings(items), [items]);
  const [query, setQuery] = useState('');
  const [mappedOnly, setMappedOnly] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [libraryPick, setLibraryPick] = useState<LibraryPick | null>(null);
  // A source switch that would drop a remix's items, awaiting confirmation.
  const [pendingSwitch, setPendingSwitch] = useState<{ info: ComfyInputInfo; source: BindingSource } | null>(null);
  // A remix item being dragged to a new position, within its own input.
  const [remixDrag, setRemixDrag] = useState<{ key: string; from: number; over: number | null } | null>(null);
  // Remixes whose last item was removed. An empty remix has nothing to store, so
  // it stays open until another source is picked rather than closing at once.
  const [emptyRemixKeys, setEmptyRemixKeys] = useState<Set<string>>(() => new Set());

  const sourceFor = (info: ComfyInputInfo, parts: WorkflowItem[]): BindingSource =>
    (parts.length === 0 && !info.mediaKind && emptyRemixKeys.has(info.key) ? 'remix' : sourceOf(info, parts));

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

  const removeRemixItem = (info: ComfyInputInfo, parts: WorkflowItem[], id: string) => {
    if (parts.length === 1) setEmptyRemixKeys((keys) => new Set(keys).add(info.key));
    onRemoveItem(id);
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
    const current = sourceFor(info, parts);
    if (source === current && source !== 'library') return;
    if (emptyRemixKeys.has(info.key)) {
      setEmptyRemixKeys((keys) => {
        const next = new Set(keys);
        next.delete(info.key);
        return next;
      });
    }
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

  const sourceOptions = (info: ComfyInputInfo): Array<{ value: BindingSource; label: string; icon: string }> => [
    { value: 'default', label: t('projectViewer.comfy.sourceDefault'), icon: 'restart_alt' },
    ...(info.mediaKind
      ? [
          { value: 'import' as const, label: t('projectViewer.comfy.sourceImport'), icon: 'upload' },
          { value: 'library' as const, label: t('projectViewer.comfy.sourceLibrary'), icon: 'library_books' },
        ]
      : [
          { value: 'input' as const, label: t('projectViewer.comfy.sourceInput'), icon: 'text_fields' },
          { value: 'remix' as const, label: t('projectViewer.comfy.sourceRemix'), icon: 'blender' },
        ]),
  ];

  const renderValuePreview = (info: ComfyInputInfo) => {
    const text = String(info.value);
    return text === '' ? t('projectViewer.comfy.emptyValue') : text;
  };

  const renderScalarRow = (info: ComfyInputInfo, item: WorkflowItem | undefined) => {
    const override = item?.type === 'text' ? item.value : undefined;
    const randomSeed = info.isSeed && override === undefined;
    const subtitle = randomSeed ? t('projectViewer.comfy.seedHint', { value: info.value }) : override !== undefined && !info.isSeed ? t('projectViewer.comfy.workflowValue', { value: String(info.value) }) : null;
    const boolValue = override !== undefined ? /^(true|1|yes|on)$/i.test(override.trim()) : info.value === true;
    return (
      <div className="v2-comfy-scalar">
        <div className="flex min-w-0 flex-1 flex-col">
          <Text as="span" variant="label-large" className="truncate font-mono">
            {info.input}
          </Text>
          {subtitle && (
            <Text as="span" variant="label-small" className="truncate text-on-surface-variant" title={subtitle}>
              {subtitle}
            </Text>
          )}
        </div>
        {override !== undefined && !info.isSeed && <IconButton icon="restart_alt" size="xs" label={t('projectViewer.comfy.resetToDefault')} tooltip onClick={() => saveBinding(info, null)} />}
        {info.isSeed && (
          <IconButton
            icon="casino"
            size="xs"
            variant={randomSeed ? 'tonal' : 'standard'}
            selected={randomSeed}
            label={t('projectViewer.comfy.randomSeed')}
            tooltip
            onClick={() => (randomSeed ? setScalarValue(info, String(info.value)) : saveBinding(info, null))}
          />
        )}
        {info.valueType === 'boolean' ? (
          <Switch aria-label={info.input} checked={boolValue} onChange={() => setScalarValue(info, String(!boolValue))} />
        ) : (
          <ScalarField
            label={info.input}
            value={randomSeed ? '' : (override ?? String(info.value))}
            disabled={randomSeed}
            placeholder={randomSeed ? t('projectViewer.comfy.randomEachJob') : undefined}
            onCommit={(value) => setScalarValue(info, value)}
          />
        )}
      </div>
    );
  };

  const renderEditor = (info: ComfyInputInfo, item: WorkflowItem) => {
    if (item.type === 'text') {
      return (
        <div className="flex items-start gap-1">
          <CommitTextField label={info.input} value={item.value} onCommit={(value) => updateItemValue(item.id, value)} placeholder={t('projectViewer.comfy.emptyValue')} />
          <IconButton icon="open_in_full" size="xs" label={t('projectViewer.common.edit')} tooltip onClick={() => onEditItem(item)} />
        </div>
      );
    }
    if (item.type === 'library') {
      const library = libraries.find((lib) => lib.id === item.value);
      const firstImage = library?.type === 'image' ? library.items[0]?.thumbnailUrl || library.items[0]?.content || library.coverUrl : undefined;
      return (
        <div className="flex items-center gap-1">
          <button type="button" className="v2-step__library m3-focus-ring flex-1" onClick={() => library && onPreviewLibrary(library, item.id)}>
            <Ripple />
            <span className="v2-pick-card__media">{firstImage ? <img src={imageDisplayUrl(firstImage)} alt="" /> : <Icon name="library_books" />}</span>
            <span className="flex min-w-0 flex-1 flex-col text-start">
              <Text as="span" variant="label-large" className="truncate">
                {library?.name || t('projectViewer.workflow.unknownLibrary')}
              </Text>
              <Text as="span" variant="label-small" className="text-on-surface-variant">
                {t('projectViewer.workflow.itemsCount', { count: library?.itemCount ?? library?.items.length ?? 0 })}
                {(item.selectedTags || []).length > 0 && ` · ${t('projectViewer.workflow.filteredTags', { count: (item.selectedTags || []).length })}`}
              </Text>
            </span>
          </button>
          <IconButton icon="swap_horiz" size="xs" label={t('projectViewer.workflow.changeLibrary')} tooltip onClick={() => openLibraryPicker({ info, partId: item.id })} />
        </div>
      );
    }
    const uploading = uploadingItemIds.has(item.id);
    const onUpload = item.type === 'video' ? onVideoUpload : item.type === 'audio' ? onAudioUpload : onImageUpload;
    const upload = (
      <FilePickButton variant="tile" accept={`${item.type}/*`} busy={uploading} icon="upload" label={item.value ? t('projectViewer.comfy.replaceFile') : t('projectViewer.comfy.chooseFile')} onChange={(e) => onUpload(e, item.id)} />
    );
    if (!item.value) {
      return (
        <div className="flex items-center gap-2">
          <Text variant="body-small" className="flex flex-1 items-center gap-1 text-on-surface-variant">
            <Icon name={item.type === 'video' ? 'movie' : item.type === 'audio' ? 'music_note' : 'image'} size={16} /> {t('projectViewer.comfy.noFileYet')}
          </Text>
          {upload}
        </div>
      );
    }
    return (
      <div className={item.type === 'audio' ? 'flex flex-col gap-2' : 'flex items-stretch gap-2'}>
        {item.type === 'image' && (
          <button type="button" className="v2-comfy-thumb m3-focus-ring" onClick={() => onLightbox([imageDisplayUrl(item.optimizedUrl || item.value)], 0)}>
            <img src={imageDisplayUrl(item.thumbnailUrl || item.value)} alt="" />
          </button>
        )}
        {item.type === 'video' && <video src={imageDisplayUrl(item.value)} poster={item.thumbnailUrl ? imageDisplayUrl(item.thumbnailUrl) : undefined} muted controls className="v2-comfy-thumb" />}
        {item.type === 'audio' && <audio src={imageDisplayUrl(item.value)} controls className="w-full" />}
        <div className={item.type === 'audio' ? '' : 'flex-1'}>{upload}</div>
      </div>
    );
  };

  /** A remixed text input: its items as workflow steps, joined in order into the input's value. */
  const renderRemix = (info: ComfyInputInfo, parts: WorkflowItem[]) => {
    const drag = remixDrag?.key === info.key ? remixDrag : null;
    return (
      <div className="flex flex-col gap-2">
        {parts.map((part, index) => (
          <WorkflowStep
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
            onRemove={(id) => removeRemixItem(info, parts, id)}
            onEdit={onEditItem}
            onPreviewLibrary={(library) => onPreviewLibrary(library, part.id)}
            onImageUpload={onImageUpload}
            onVideoUpload={onVideoUpload}
            onAudioUpload={onAudioUpload}
            uploadingItemIds={uploadingItemIds}
            onLightbox={onLightbox}
            onSelectFromLibrary={onSelectFromLibrary}
            onChangeLibrary={(id) => openLibraryPicker({ info, partId: id })}
            onSaveToLibrary={onSaveToLibrary}
            libraries={libraries}
            onToggleDisable={toggleItemDisabled}
          />
        ))}
        {parts.length === 0 && (
          <Text variant="body-small" className="v2-dashed-note">
            {t('projectViewer.comfy.remixEmpty')}
          </Text>
        )}
        {parts.length > 0 && parts.every((part) => part.disabled) && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="warning" size={18} />
            <Text variant="body-small">{t('projectViewer.comfy.remixAllDisabled', { input: info.input, node: info.nodeId })}</Text>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="tonal" size="xs" icon="add" onClick={() => addRemixItem(info, newTextItem(info, '', true))}>
            {t('projectViewer.comfy.addTextPart')}
          </Button>
          <Button variant="tonal" size="xs" icon="add" onClick={() => openLibraryPicker({ info, append: true })}>
            {t('projectViewer.comfy.addLibraryPart')}
          </Button>
        </div>
        <Text variant="body-small" className="text-on-surface-variant">
          {t('projectViewer.comfy.remixHint')}
        </Text>
      </div>
    );
  };

  return (
    <div className="v2-comfy" data-density="compact">
      <section className="v2-comfy__section">
        <div className="flex items-center justify-between gap-2">
          <Text as="span" variant="label-medium" className="v2-setting__label">
            {t('projectViewer.comfy.addressLabel')}
          </Text>
          {connection && !isTesting && (
            <span className="v2-info-chip" data-tone={connection.ok ? 'success' : 'error'}>
              <Icon name={connection.ok ? 'check_circle' : 'error'} size={14} /> {connection.ok ? t('projectViewer.comfy.connected') : t('projectViewer.comfy.unreachable')}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <TextField
            id="comfy-url"
            variant="outlined"
            type="url"
            value={urlDraft}
            placeholder="http://127.0.0.1:8188"
            onValueChange={setUrlDraft}
            onBlur={() => {
              commitConnection();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTest();
            }}
            className="flex-1"
            fullWidth
          />
          <Button variant="tonal" icon="power" loading={isTesting} disabled={!urlDraft.trim()} onClick={handleTest}>
            {t('projectViewer.comfy.test')}
          </Button>
        </div>
        {!localProject.comfyUrl && lastUrl && (
          <Button variant="text" size="xs" className="self-start" onClick={() => commitConnection({ url: lastUrl })}>
            {t('projectViewer.comfy.useLastAddress', { url: lastUrl })}
          </Button>
        )}
        {connection?.ok && (
          <Text variant="body-small" className="text-on-surface-variant">
            {[connection.version && `ComfyUI ${connection.version}`, connection.device, connection.vramFree !== undefined && t('projectViewer.comfy.vramFree', { free: formatGigabytes(connection.vramFree), total: formatGigabytes(connection.vramTotal) })].filter(Boolean).join(' · ')}
          </Text>
        )}
        {connection && !connection.ok && (
          <Text variant="body-small" className="text-error">
            {connection.error}
          </Text>
        )}
        <Text variant="body-small" className="text-on-surface-variant">
          {t('projectViewer.comfy.addressHelp')}
        </Text>
        <TextField
          id="comfy-password"
          name="comfy-access-password"
          variant="outlined"
          label={t('projectViewer.comfy.passwordLabel')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
          value={passwordDraft}
          placeholder={t('projectViewer.comfy.passwordPlaceholder')}
          onValueChange={setPasswordDraft}
          onBlur={() => {
            commitConnection();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTest();
          }}
          trailingIcon={
            <IconButton
              icon={showPassword ? 'visibility_off' : 'visibility'}
              size="xs"
              label={showPassword ? t('projectViewer.comfy.hidePassword') : t('projectViewer.comfy.showPassword')}
              selected={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            />
          }
          supportingText={t('projectViewer.comfy.passwordHelp')}
          fullWidth
        />
      </section>

      <section className="v2-comfy__section">
        <div className="flex items-center justify-between gap-2">
          <Text as="span" variant="label-medium" className="v2-setting__label">
            {t('projectViewer.comfy.workflowLabel')}
          </Text>
          {workflow && (
            <span className="v2-info-chip" data-tone="primary">
              {t('projectViewer.comfy.workflowSummary', { count: Object.keys(workflow).length, output: detectComfyOutputKind(workflow) === 'video' ? t('projectViewer.comfy.outputVideo') : t('projectViewer.comfy.outputImage') })}
            </span>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={handleWorkflowFile} />
        <div className="flex flex-wrap gap-2">
          <Button variant="tonal" size="xs" icon="data_object" onClick={() => fileInputRef.current?.click()}>
            {workflow ? t('projectViewer.comfy.replaceWorkflow') : t('projectViewer.comfy.uploadWorkflow')}
          </Button>
          <Button variant="tonal" size="xs" icon="content_paste" onClick={() => setIsPasteOpen(true)}>
            {t('projectViewer.comfy.pasteWorkflow')}
          </Button>
          {workflow && (
            <Button variant="text" size="xs" icon="delete" className="v2-button-danger" onClick={() => setConfirmRemoveWorkflow(true)}>
              {t('projectViewer.comfy.removeWorkflow')}
            </Button>
          )}
        </div>
        {!workflow && (
          <Text variant="body-small" className="text-on-surface-variant">
            {t('projectViewer.comfy.workflowHelp')}
          </Text>
        )}
      </section>

      {workflow && (
        <section className="v2-comfy__section">
          <div className="flex items-center justify-between gap-2">
            <Text as="span" variant="label-medium" className="v2-setting__label">
              {t('projectViewer.comfy.inputsLabel')}
            </Text>
            <span className="v2-info-chip">{t('projectViewer.comfy.mappedCount', { count: mappedCount })}</span>
          </div>
          <div className="flex items-center gap-2">
            <SearchField shape="field" value={query} onChange={setQuery} placeholder={t('projectViewer.comfy.searchInputs')} className="flex-1" />
            <Button variant={mappedOnly ? 'tonal' : 'outlined'} size="xs" icon={mappedOnly ? 'check' : undefined} aria-pressed={mappedOnly} onClick={() => setMappedOnly((v) => !v)}>
              {t('projectViewer.comfy.mappedOnly')}
            </Button>
          </div>
          {visibleNodes.length === 0 && (
            <Text variant="body-small" className="v2-dashed-note">
              {mappedOnly && mappedCount === 0 ? t('projectViewer.comfy.noMappedInputs') : t('projectViewer.comfy.noMatchingInputs')}
            </Text>
          )}
          <div className={isExpanded ? 'v2-comfy__nodes v2-comfy__nodes--grid' : 'v2-comfy__nodes'}>
            {visibleNodes.map((node) => {
              const open = isNodeOpen(node);
              const bound = node.inputs.filter((info) => bindings.has(info.key)).length;
              return (
                <div key={node.nodeId} className="v2-comfy-node" data-open={open ? '' : undefined}>
                  <button type="button" className="v2-comfy-node__head m3-focus-ring" aria-expanded={open} onClick={() => setExpandedNodes((prev) => ({ ...prev, [node.nodeId]: !open }))}>
                    <Ripple />
                    <Icon name={open ? 'expand_more' : 'chevron_right'} size={18} />
                    <span className="font-mono text-on-surface-variant">#{node.nodeId}</span>
                    <Text as="span" variant="label-large" emphasized className="min-w-0 truncate">
                      {node.nodeTitle}
                    </Text>
                    {node.nodeTitle !== node.classType && (
                      <Text as="span" variant="label-small" className="min-w-0 truncate text-on-surface-variant">
                        {node.classType}
                      </Text>
                    )}
                    {bound > 0 && (
                      <span className="v2-info-chip ms-auto" data-tone="primary">
                        {bound}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="v2-comfy-node__body">
                      {node.inputs.map((info) => {
                        const parts = bindings.get(info.key) || [];
                        const source = sourceFor(info, parts);
                        if (!info.mediaKind && info.valueType !== 'string') return <div key={info.key}>{renderScalarRow(info, parts[0])}</div>;
                        return (
                          <div key={info.key} className="v2-comfy-input">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-1 flex-col">
                                <Text as="span" variant="label-large" className="truncate font-mono">
                                  {info.input}
                                </Text>
                                {source === 'default' && (
                                  <Text as="span" variant="label-small" className="truncate text-on-surface-variant" title={String(info.value)}>
                                    {renderValuePreview(info)}
                                  </Text>
                                )}
                              </div>
                              <ChoiceChips<BindingSource> aria-label={info.input} value={source} onChange={(next) => setSource(info, next)} options={sourceOptions(info).map((o) => ({ value: o.value, label: o.label, visual: <Icon name={o.icon} size={14} /> }))} />
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

      <LibrarySelectionDialog
        open={libraryPick !== null}
        onClose={() => setLibraryPick(null)}
        onSelect={handleLibraryPicked}
        libraries={pickerLibraries}
        selectedLibraryIds={items.filter((item) => item.comfyTarget && item.type === 'library').map((item) => item.value)}
        isLoading={isRefreshingLibraries}
        error={libraryRefreshError}
        description={libraryPick ? t('projectViewer.comfy.libraryPickerDescription', { input: libraryPick.info.input, node: libraryPick.info.nodeTitle, kind: t(`projectViewer.comfy.kind.${libraryPick.info.mediaKind || 'text'}`) }) : undefined}
      />
      <ConfirmDialog
        open={pendingSwitch !== null}
        tone="danger"
        title={t('projectViewer.comfy.replacePartsTitle')}
        message={pendingSwitch ? t('projectViewer.comfy.replacePartsMessage', { count: bindings.get(pendingSwitch.info.key)?.length ?? 0, input: pendingSwitch.info.input }) : ''}
        confirmLabel={t('projectViewer.comfy.replaceParts')}
        onClose={() => setPendingSwitch(null)}
        onConfirm={() => {
          if (pendingSwitch) applySource(pendingSwitch.info, pendingSwitch.source, bindings.get(pendingSwitch.info.key) || []);
          setPendingSwitch(null);
        }}
      />
      <ConfirmDialog open={confirmRemoveWorkflow} tone="danger" title={t('projectViewer.comfy.removeWorkflowTitle')} message={t('projectViewer.comfy.removeWorkflowMessage')} confirmLabel={t('projectViewer.comfy.removeWorkflow')} onClose={() => setConfirmRemoveWorkflow(false)} onConfirm={removeWorkflow} />
      <Dialog
        open={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        icon="data_object"
        headline={t('projectViewer.comfy.pasteTitle')}
        maxWidth={720}
        actions={
          <>
            <Button variant="text" onClick={() => setIsPasteOpen(false)}>
              {t('projectViewer.common.cancel')}
            </Button>
            <Button
              variant="filled"
              icon="data_object"
              disabled={!pasteText.trim()}
              onClick={() => {
                if (applyWorkflow(pasteText)) {
                  setPasteText('');
                  setIsPasteOpen(false);
                }
              }}
            >
              {t('projectViewer.comfy.loadWorkflow')}
            </Button>
          </>
        }
      >
        <Text variant="body-small" className="mb-3 text-on-surface-variant">
          {t('projectViewer.comfy.workflowHelp')}
        </Text>
        <textarea data-autofocus className="v2-prompt-dialog__input font-mono" rows={14} spellCheck={false} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='{ "3": { "class_type": "KSampler", "inputs": { ... } } }' />
      </Dialog>
    </div>
  );
}

export interface ComfySettingsPanelProps {
  localProject: Project;
  onSaveProject: (project: Project) => void;
  queueCount: number;
  setQueueCount: (count: number) => void;
  combinationsCount: number;
  workflowError: string | null;
  uploadingItemIds: Set<string>;
  onAddDraftsToQueue: () => void;
  isAddingDrafts: boolean;
  draftsProgress: DraftsProgress | null;
}

const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;

/** The foot of a ComfyUI project: output kind and format, shuffle, batch size and Add to drafts. */
export function ComfySettingsPanel({ localProject, onSaveProject, queueCount, setQueueCount, combinationsCount, workflowError, uploadingItemIds, onAddDraftsToQueue, isAddingDrafts, draftsProgress }: ComfySettingsPanelProps) {
  const { t } = useTranslation();
  const isVideo = localProject.format === 'mp4';
  const hasWorkflow = !!localProject.comfyWorkflow;
  const notice = workflowError
    ? { tone: 'error' as const, text: workflowError }
    : !hasWorkflow
      ? { tone: 'warning' as const, text: t('projectViewer.comfy.loadWorkflowFirst') }
      : !localProject.comfyUrl
        ? { tone: 'warning' as const, text: t('projectViewer.comfy.setAddressBeforeRun') }
        : null;
  return (
    <RunDock
      title={null}
      inline={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SettingField label={t('projectViewer.comfy.outputLabel')}>
              <ChoiceChips
                value={isVideo ? 'video' : 'image'}
                onChange={(v) => {
                  if (v === 'video' && !isVideo) onSaveProject({ ...localProject, format: 'mp4' });
                  if (v === 'image' && isVideo) onSaveProject({ ...localProject, format: 'png' });
                }}
                options={[
                  { value: 'image', label: t('projectViewer.comfy.outputImage') },
                  { value: 'video', label: t('projectViewer.comfy.outputVideo') },
                ]}
              />
            </SettingField>
            {!isVideo && (
              <SettingField label={t('projectViewer.comfy.formatLabel')}>
                <ChoiceChips value={localProject.format || 'png'} onChange={(format) => onSaveProject({ ...localProject, format })} options={IMAGE_FORMATS.map((value) => ({ value }))} />
              </SettingField>
            )}
          </div>
          <Switch label={t('projectViewer.settings.shuffle')} supportingText={t('projectViewer.settings.randomizeOrder')} checked={!!localProject.shuffle} onChange={() => onSaveProject({ ...localProject, shuffle: !localProject.shuffle })} />
        </div>
      }
      collapsed={false}
      onToggle={() => undefined}
      queueCount={queueCount}
      setQueueCount={setQueueCount}
      // With nothing bound the workflow still runs, once per job.
      combinationsCount={Math.max(1, combinationsCount)}
      notice={notice}
      onAdd={onAddDraftsToQueue}
      addDisabled={!hasWorkflow || uploadingItemIds.size > 0 || isAddingDrafts}
      uploading={uploadingItemIds.size > 0}
      isAddingDrafts={isAddingDrafts}
      draftsProgress={draftsProgress}
    />
  );
}
