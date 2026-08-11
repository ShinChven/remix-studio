import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, BookOpen, Search, ChevronDown, X, SlidersHorizontal, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { BatchGenerateTextResult, batchGeneratePostText, fetchAssistantProviders, fetchLibraries, fetchLibraryItems } from '../api';
import { getTextModelsForProvider, Library, LibraryItem, Provider } from '../types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { cn } from '../lib/utils';

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

export function BatchAiGenerateModal({ postIds, onClose, onQueued }: Props) {
  // Matches the `md` breakpoint where the two-pane layout collapses into tabs.
  const isSinglePane = useMediaQuery('(max-width: 767px)');
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
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load prompt libraries');
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
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Failed to load prompts');
      } finally {
        if (!cancelled) setLoadingPrompts(false);
      }
    }

    void loadPrompts();
    return () => {
      cancelled = true;
    };
  }, [libraryId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

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
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate text');
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 sm:p-4 md:p-8"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="AI generate post text"
        onSubmit={handleSubmit}
        className="relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border-neutral-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300 sm:h-[92dvh] sm:rounded-card sm:border dark:border-white/10 dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-white/10 md:px-6 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white md:h-10 md:w-10">
              <Sparkles className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-tight text-neutral-950 dark:text-white md:text-lg">
                AI Generate Text
              </h2>
              <p className="truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Generating for {postCountLabel}
                {selectedModel ? ` · ${selectedModel.name}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-white md:h-10 md:w-10"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Phone-only pane switcher: the options and the editor each get the full width. */}
        <div className="flex shrink-0 gap-1 border-b border-neutral-200 p-2 dark:border-white/10 md:hidden">
          {([
            { pane: 'editor' as const, label: 'Prompt', icon: PenLine },
            { pane: 'options' as const, label: 'Options', icon: SlidersHorizontal },
          ]).map(({ pane, label, icon: Icon }) => (
            <button
              key={pane}
              type="button"
              onClick={() => setMobilePane(pane)}
              aria-pressed={mobilePane === pane}
              className={cn(
                'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition',
                mobilePane === pane
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/10',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside
            className={cn(
              'min-h-0 flex-col gap-4 overflow-y-auto border-neutral-200 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-neutral-900/60 md:flex md:w-80 md:flex-none md:border-r md:p-5 lg:w-96',
              mobilePane === 'options' ? 'flex flex-1' : 'hidden',
            )}
          >
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                Model
              </label>
              <div className="relative">
                <select
                  value={selectedValue}
                  onChange={(e) => {
                    const [pid, mid] = e.target.value.split('::');
                    setProviderId(pid || '');
                    setModelId(mid || '');
                  }}
                  disabled={submitting}
                  className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-white px-3 pr-10 text-sm font-bold text-neutral-900 shadow-sm outline-none transition focus:border-indigo-500/50 disabled:cursor-not-allowed dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                >
                  <option value="">Select a model</option>
                  {providers.map((p) => {
                    const models = getTextModelsForProvider(p.type);
                    if (models.length === 0) return null;
                    return (
                      <optgroup key={p.id} label={p.name}>
                        {models.map((m) => (
                          <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              </div>
            </div>

            <label className="flex cursor-pointer select-none items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-950 dark:hover:border-white/20">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Include first attached image
                </span>
                <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
                  Sends the post's first image to the model as context.
                </span>
              </span>
            </label>

            <div className="flex min-h-0 flex-1 flex-col">
              <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                <BookOpen className="h-4 w-4 text-indigo-500" />
                Prompt Library
              </label>
              <div className="relative">
                <select
                  value={libraryId}
                  onChange={(e) => {
                    setLibraryId(e.target.value);
                    setPromptQuery('');
                    setSelectedPromptId('');
                  }}
                  disabled={submitting || loadingLibraries}
                  className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-white px-3 pr-10 text-sm font-bold text-neutral-900 outline-none transition focus:border-indigo-500/50 disabled:cursor-not-allowed dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                >
                  <option value="">{loadingLibraries ? 'Loading libraries...' : 'Select a text library'}</option>
                  {libraries.map((library) => (
                    <option key={library.id} value={library.id}>
                      {library.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              </div>

              {libraryId && (
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={promptQuery}
                    onChange={(e) => setPromptQuery(e.target.value)}
                    disabled={submitting}
                    placeholder="Search prompts..."
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                  />
                </div>
              )}

              <div className="mt-2 min-h-[10rem] flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950 md:min-h-0">
                {!libraryId ? (
                  <div className="p-4 text-sm font-medium text-neutral-500">No prompt library selected.</div>
                ) : loadingPrompts ? (
                  <div className="flex items-center justify-center gap-2 p-4 text-sm font-medium text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading prompts...
                  </div>
                ) : filteredPromptItems.length === 0 ? (
                  <div className="p-4 text-sm font-medium text-neutral-500">No prompts found.</div>
                ) : (
                  <div className="divide-y divide-neutral-200 dark:divide-white/10">
                    {filteredPromptItems.map((item) => {
                      const selected = item.id === selectedPromptId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => selectPrompt(item)}
                          className={cn(
                            'block w-full px-4 py-3 text-left transition hover:bg-neutral-50 disabled:cursor-not-allowed dark:hover:bg-white/5',
                            selected && 'bg-indigo-500/10 hover:bg-indigo-500/10 dark:hover:bg-indigo-500/10',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                                {item.title || 'Untitled prompt'}
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
                                {item.content}
                              </p>
                            </div>
                            {selected && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />}
                          </div>
                          {item.tags && item.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.tags.slice(0, 4).map((tag) => (
                                <span key={tag} className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section
            className={cn(
              'min-h-0 min-w-0 flex-1 flex-col p-4 md:flex md:p-6',
              mobilePane === 'editor' ? 'flex' : 'hidden',
            )}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="batch-ai-prompt"
                className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400"
              >
                Prompt
              </label>
              <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-400">
                {selectedPrompt && (
                  <span className="max-w-[12rem] truncate rounded-full bg-indigo-500/10 px-2 py-0.5 text-indigo-600 dark:text-indigo-300">
                    {selectedPrompt.title || 'Untitled prompt'}
                  </span>
                )}
                <span>{promptText.length} chars</span>
              </div>
            </div>

            <textarea
              id="batch-ai-prompt"
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                setSelectedPromptId('');
              }}
              onKeyDown={handleEditorKeyDown}
              disabled={submitting}
              className="min-h-0 w-full flex-1 resize-none rounded-card border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm font-medium leading-relaxed text-neutral-900 shadow-inner outline-none ring-indigo-500/10 transition focus:border-indigo-500/50 focus:ring-4 disabled:cursor-not-allowed dark:border-white/10 dark:bg-black/20 dark:text-neutral-100 md:px-5"
              placeholder="e.g., Write a punchy launch announcement for the attached image, under 240 chars."
              autoFocus={!isSinglePane}
            />

            <p className="mt-2 hidden text-[11px] font-medium text-neutral-400 md:block">
              Pick a saved prompt on the left to load it here, then edit freely. Press ⌘/Ctrl + Enter to generate.
            </p>
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-neutral-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-white/10 md:px-6 md:py-4 md:pb-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="hidden rounded-xl px-4 py-2.5 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white sm:block"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? 'Queueing...' : `Generate for ${postCountLabel}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
