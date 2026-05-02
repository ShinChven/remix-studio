import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, BookOpen, Search, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { BatchGenerateTextResult, batchGeneratePostText, fetchAssistantProviders, fetchLibraries, fetchLibraryItems } from '../api';
import { getTextModelsForProvider, Library, LibraryItem, Provider } from '../types';
import { cn } from '../lib/utils';

interface Props {
  postIds: string[];
  onClose: () => void;
  onQueued: (task: BatchGenerateTextResult) => void;
}

const LAST_TEXT_MODEL_KEY = 'remixStudio.batchAiGenerate.lastModel';
const LAST_PROMPT_KEY = 'remixStudio.batchAiGenerate.lastPrompt';

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

  const selectedValue = useMemo(
    () => (providerId && modelId ? `${providerId}::${modelId}` : ''),
    [providerId, modelId],
  );

  const filteredPromptItems = useMemo(() => {
    const q = promptQuery.trim().toLowerCase();
    if (!q) return promptItems;
    return promptItems.filter((item) => (
      `${item.title || ''} ${item.content || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q)
    ));
  }, [promptItems, promptQuery]);

  const selectPrompt = (item: LibraryItem) => {
    setSelectedPromptId(item.id);
    setPromptText(item.content || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !modelId) {
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
        modelId,
      });
      toast.success(`Queued text generation for ${task.total} post${task.total === 1 ? '' : 's'}`);
      onQueued(task);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate text');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/90 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300 dark:border-white/10 dark:bg-neutral-900/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 flex-1 overflow-y-auto">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            AI Generate Text
          </h2>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-6">
            Generate post text for {postIds.length} selected post{postIds.length === 1 ? '' : 's'}.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
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
                  className="w-full appearance-none rounded-xl border border-neutral-200 bg-white px-4 py-3.5 pr-11 text-sm font-bold text-neutral-900 shadow-sm outline-none transition focus:border-indigo-500/50 disabled:cursor-not-allowed dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
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
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white/70 p-4 dark:border-white/10 dark:bg-neutral-950/40">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                  <BookOpen className="h-4 w-4 text-indigo-500" />
                  Prompt Library
                </label>
                <div className="relative w-full sm:w-72">
                  <select
                    value={libraryId}
                    onChange={(e) => {
                      setLibraryId(e.target.value);
                      setPromptQuery('');
                      setSelectedPromptId('');
                    }}
                    disabled={submitting || loadingLibraries}
                    className="h-10 w-full appearance-none rounded-xl border border-neutral-200 bg-white px-3 pr-10 text-sm font-bold text-neutral-900 outline-none transition focus:border-indigo-500/50 disabled:cursor-not-allowed dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
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
              </div>

              {libraryId && (
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={promptQuery}
                    onChange={(e) => setPromptQuery(e.target.value)}
                    disabled={submitting}
                    placeholder="Search prompts..."
                    className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-800 dark:bg-black/20 dark:text-neutral-100"
                  />
                </div>
              )}

              <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50/70 dark:border-neutral-800 dark:bg-black/20">
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
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredPromptItems.map((item) => {
                      const selected = item.id === selectedPromptId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => selectPrompt(item)}
                          className={cn(
                            'block w-full px-4 py-3 text-left transition hover:bg-white disabled:cursor-not-allowed dark:hover:bg-white/5',
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

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                Prompt
              </label>
              <textarea
                value={promptText}
                onChange={(e) => {
                  setPromptText(e.target.value);
                  setSelectedPromptId('');
                }}
                rows={4}
                disabled={submitting}
                className="min-h-32 w-full resize-y rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm font-medium text-neutral-900 shadow-inner outline-none ring-indigo-500/10 transition focus:border-indigo-500/50 focus:ring-4 dark:border-neutral-800 dark:bg-black/20 dark:text-neutral-100"
                placeholder="e.g., Write a punchy launch announcement for the attached image, under 240 chars."
                autoFocus
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled={submitting}
                className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-700"
              />
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Include first attached image as context
              </span>
            </label>

            <div className="pt-2 flex justify-end gap-3 border-t border-neutral-200/50 dark:border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={submitting || !providerId || !modelId || !promptText.trim()}
                className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Queueing...' : 'Generate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
