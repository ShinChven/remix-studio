import React, { useEffect, useMemo, useState } from 'react';
import { batchGeneratePostText, fetchAssistantProviders, fetchLibraries, fetchLibraryItems, type BatchGenerateTextResult } from '../../../api';
import { Button, Checkbox, Dialog, Icon, LoadingIndicator, Ripple, Select, Text, useWindowSizeClass } from '../../../m3';
import { getTextModelsForProvider, type Library, type LibraryItem, type Provider } from '../../../types';
import { EmptyState } from '../../ui/Page';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Toolbar';
import { useToast } from '../../ui/useToast';
interface Props {
  postIds: string[];
  onClose: () => void;
  onQueued: (task: BatchGenerateTextResult) => void;
}

const LAST_TEXT_MODEL_KEY = 'remixStudio.batchAiGenerate.lastModel';
const LAST_PROMPT_KEY = 'remixStudio.batchAiGenerate.lastPrompt';

/** Which pane the phone layout shows; both panes are always visible from `md` up. */
type MobilePane = 'editor' | 'options';

interface LastPromptChoice {
  promptText: string;
  libraryId?: string;
  itemId?: string;
}

function readLastTextModelChoice(): { providerId: string; modelId: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_TEXT_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.providerId !== 'string' || typeof parsed?.modelId !== 'string') return null;
    return { providerId: parsed.providerId, modelId: parsed.modelId };
  } catch {
    return null;
  }
}

function writeLastTextModelChoice(providerId: string, modelId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_TEXT_MODEL_KEY, JSON.stringify({ providerId, modelId }));
  } catch {
    // Ignore storage failures; the current selection still works for this session.
  }
}

function readLastPromptChoice(): LastPromptChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_PROMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.promptText !== 'string') return null;
    return {
      promptText: parsed.promptText,
      libraryId: typeof parsed.libraryId === 'string' ? parsed.libraryId : undefined,
      itemId: typeof parsed.itemId === 'string' ? parsed.itemId : undefined,
    };
  } catch {
    return null;
  }
}

function writeLastPromptChoice(choice: LastPromptChoice) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_PROMPT_KEY, JSON.stringify(choice));
  } catch {
    // Ignore storage failures; the prompt still remains in the current dialog.
  }
}

function resolveInitialTextModelChoice(providers: Provider[]): { providerId: string; modelId: string } | null {
  const stored = readLastTextModelChoice();
  if (stored) {
    const storedProvider = providers.find((provider) => provider.id === stored.providerId);
    const storedModel = storedProvider
      ? getTextModelsForProvider(storedProvider.type).find((model) => model.id === stored.modelId)
      : null;
    if (storedProvider && storedModel) return stored;
  }

  const firstWithModels = providers.find(
    (provider) => getTextModelsForProvider(provider.type).length > 0,
  );
  if (!firstWithModels) return null;

  const firstModel = getTextModelsForProvider(firstWithModels.type)[0];
  return { providerId: firstWithModels.id, modelId: firstModel.id };
}

/** Writes post text with a model from a prompt (typed or picked from a text library), for one or many posts. */
export function BatchAiGenerateDialog({ postIds, onClose, onQueued }: Props) {
  const toast = useToast();
  // Phones show one pane at a time.
  const isSinglePane = useWindowSizeClass() === 'compact';
  const [providers, setProviders] = useState<Provider[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [libraryId, setLibraryId] = useState<string>(() => readLastPromptChoice()?.libraryId || '');
  const [promptItems, setPromptItems] = useState<LibraryItem[]>([]);
  const [promptQuery, setPromptQuery] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string>(() => readLastPromptChoice()?.itemId || '');
  const [providerId, setProviderId] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [promptText, setPromptText] = useState<string>(() => readLastPromptChoice()?.promptText || '');
  const [includeImages, setIncludeImages] = useState<boolean>(true);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');

  useEffect(() => {
    fetchAssistantProviders()
      .then(({ providers }) => {
        setProviders(providers);
        const initialChoice = resolveInitialTextModelChoice(providers);
        if (initialChoice) {
          setProviderId(initialChoice.providerId);
          setModelId(initialChoice.modelId);
        }
      })
      .catch(() => {
        toast.error('Failed to load providers');
      });
  }, []);

  useEffect(() => {
    if (!providerId || !modelId || providers.length === 0) return;
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    const hasModel = getTextModelsForProvider(provider.type).some((model) => model.id === modelId);
    if (!hasModel) return;
    writeLastTextModelChoice(providerId, modelId);
  }, [modelId, providerId, providers]);

  useEffect(() => {
    let cancelled = false;

    async function loadPromptLibraries() {
      setLoadingLibraries(true);
      try {
        const data = await fetchLibraries(1, 100);
        if (cancelled) return;
        const textLibraries = (data.items || []).filter((library) => library.type === 'text');
        setLibraries(textLibraries);
        setLibraryId((current) => {
          if (current && textLibraries.some((library) => library.id === current)) return current;
          const stored = readLastPromptChoice();
          if (stored?.libraryId && textLibraries.some((library) => library.id === stored.libraryId)) {
            return stored.libraryId;
          }
          return textLibraries[0]?.id || '';
        });
      } catch (error) {
        if (!cancelled) toast.error((error as Error)?.message || 'Failed to load prompt libraries');
      } finally {
        if (!cancelled) setLoadingLibraries(false);
      }
    }

    void loadPromptLibraries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPrompts() {
      if (!libraryId) {
        setPromptItems([]);
        setSelectedPromptId('');
        return;
      }

      setLoadingPrompts(true);
      try {
        const data = await fetchLibraryItems(libraryId, 1, 500, undefined, [], 'name', 'asc');
        if (cancelled) return;
        setPromptItems(data.items || []);
        setSelectedPromptId((current) => {
          if ((data.items || []).some((item) => item.id === current)) return current;
          return '';
        });
      } catch (error) {
        if (!cancelled) toast.error((error as Error)?.message || 'Failed to load prompts');
      } finally {
        if (!cancelled) setLoadingPrompts(false);
      }
    }

    void loadPrompts();
    return () => {
      cancelled = true;
    };
  }, [libraryId]);


  const selectedValue = useMemo(
    () => (providerId && modelId ? `${providerId}::${modelId}` : ''),
    [providerId, modelId],
  );

  const selectedModel = useMemo(() => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return null;
    return getTextModelsForProvider(provider.type).find((model) => model.id === modelId) || null;
  }, [modelId, providerId, providers]);

  const filteredPromptItems = useMemo(() => {
    const q = promptQuery.trim().toLowerCase();
    if (!q) return promptItems;
    return promptItems.filter((item) => (
      `${item.title || ''} ${item.content || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q)
    ));
  }, [promptItems, promptQuery]);

  const selectedPrompt = useMemo(
    () => promptItems.find((item) => item.id === selectedPromptId) || null,
    [promptItems, selectedPromptId],
  );

  const selectPrompt = (item: LibraryItem) => {
    setSelectedPromptId(item.id);
    setPromptText(item.content || '');
    // On phones the list and the editor are separate panes, so jump straight to
    // the text the user just loaded instead of leaving them on the picker.
    setMobilePane('editor');
  };

  const canSubmit = Boolean(providerId && modelId && promptText.trim()) && !submitting;

  const submit = async () => {
    if (!providerId || !selectedModel) {
      toast.error('Select a model first');
      return;
    }
    if (!promptText.trim()) {
      toast.error('Enter a prompt');
      return;
    }
    try {
      setSubmitting(true);
      writeLastPromptChoice({
        promptText,
        libraryId: libraryId || undefined,
        itemId: selectedPromptId || undefined,
      });
      const task = await batchGeneratePostText({
        postIds,
        promptText,
        includeImages,
        providerId,
        // The select value is the local ModelConfig id. Providers require the
        // actual API model id (for example `gemini-3.5-flash-lite`).
        modelId: selectedModel.modelId,
      });
      toast.success(`Queued text generation for ${task.total} post${task.total === 1 ? '' : 's'}`);
      onQueued(task);
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to generate text');
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) void submit();
    }
  };

  const postCountLabel = `${postIds.length} post${postIds.length === 1 ? '' : 's'}`;

  const modelOptions = providers.flatMap((p) => getTextModelsForProvider(p.type).map((m) => ({ value: `${p.id}::${m.id}`, label: m.name, supportingText: p.name })));

  const options = (
    <div className="v2-ai-gen__options">
      <Select
        variant="outlined"
        label="Model"
        placeholder="Select a model"
        value={selectedValue || null}
        disabled={submitting}
        onChange={(value) => {
          const [pid, mid] = value.split('::');
          setProviderId(pid || '');
          setModelId(mid || '');
        }}
        options={modelOptions}
        fullWidth
      />
      <Checkbox label="Include first attached image" supportingText="Sends the post's first image to the model as context." checked={includeImages} disabled={submitting} onChange={(e) => setIncludeImages(e.target.checked)} />
      <Select
        variant="outlined"
        label="Prompt Library"
        leadingIcon="menu_book"
        placeholder={loadingLibraries ? 'Loading libraries...' : 'Select a text library'}
        value={libraryId || null}
        disabled={submitting || loadingLibraries}
        onChange={(value) => {
          setLibraryId(value);
          setPromptQuery('');
          setSelectedPromptId('');
        }}
        options={libraries.map((l) => ({ value: l.id, label: l.name }))}
        fullWidth
      />
      {libraryId && <SearchField shape="field" value={promptQuery} onChange={setPromptQuery} placeholder="Search prompts..." />}
      <div className="v2-ai-gen__prompts">
        {!libraryId ? (
          <EmptyState icon="menu_book" size="inline" title="No prompt library selected." />
        ) : loadingPrompts ? (
          <div className="flex items-center justify-center gap-2 py-8 text-on-surface-variant">
            <LoadingIndicator size={28} />
            <Text variant="label-medium">Loading prompts...</Text>
          </div>
        ) : filteredPromptItems.length === 0 ? (
          <EmptyState icon="search_off" size="inline" title="No prompts found." />
        ) : (
          filteredPromptItems.map((item) => {
            const selected = item.id === selectedPromptId;
            return (
              <button key={item.id} type="button" disabled={submitting} className="v2-ai-gen__prompt m3-focus-ring" data-selected={selected ? '' : undefined} onClick={() => selectPrompt(item)}>
                <Ripple />
                <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                  <Text as="span" variant="label-large" emphasized className="truncate">
                    {item.title || 'Untitled prompt'}
                  </Text>
                  <Text as="span" variant="body-small" className="line-clamp-2 text-on-surface-variant">
                    {item.content}
                  </Text>
                  {item.tags && item.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {item.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="v2-tag-mini">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {selected && <Icon name="check_circle" filled className="text-primary" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const editor = (
    <div className="v2-ai-gen__editor">
      <div className="flex items-center justify-between gap-2">
        <Text as="label" variant="label-large" emphasized>
          Prompt
        </Text>
        <Text as="span" variant="label-small" className="flex items-center gap-2 text-on-surface-variant">
          {selectedPrompt && <span className="v2-tag-mini">{selectedPrompt.title || 'Untitled prompt'}</span>}
          {promptText.length} chars
        </Text>
      </div>
      <textarea
        id="batch-ai-prompt"
        className="v2-prompt-dialog__input flex-1"
        value={promptText}
        onChange={(e) => {
          setPromptText(e.target.value);
          setSelectedPromptId('');
        }}
        onKeyDown={handleEditorKeyDown}
        disabled={submitting}
        placeholder="e.g., Write a punchy launch announcement for the attached image, under 240 chars."
        autoFocus={!isSinglePane}
      />
      <Text variant="body-small" className="text-on-surface-variant">
        Pick a saved prompt on the left to load it here, then edit freely. Press ⌘/Ctrl + Enter to generate.
      </Text>
    </div>
  );

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      dismissible={!submitting}
      icon="auto_awesome"
      headline={
        <span className="flex flex-col">
          AI Generate Text
          <Text as="span" variant="label-medium" className="text-on-surface-variant">
            Generating for {postCountLabel}
            {selectedModel ? ` · ${selectedModel.name}` : ''}
          </Text>
        </span>
      }
      fullScreen="compact"
      maxWidth={1080}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" icon="auto_awesome" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? 'Queueing...' : `Generate for ${postCountLabel}`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="v2-ai-gen" data-density="compact">
        {isSinglePane && (
          <Segmented<MobilePane>
            fullWidth
            value={mobilePane}
            onChange={setMobilePane}
            options={[
              { value: 'editor', label: 'Prompt', icon: 'edit' },
              { value: 'options', label: 'Options', icon: 'tune' },
            ]}
          />
        )}
        {(!isSinglePane || mobilePane === 'options') && options}
        {(!isSinglePane || mobilePane === 'editor') && editor}
      </form>
    </Dialog>
  );
}
