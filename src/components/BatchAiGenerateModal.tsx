import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { batchGeneratePostText, fetchAssistantProviders } from '../api';
import { getTextModelsForProvider, Provider } from '../types';

interface Props {
  postIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

interface GenResult {
  postId: string;
  ok: boolean;
  text?: string;
  error?: string;
}

export function BatchAiGenerateModal({ postIds, onClose, onComplete }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState<string>('');
  const [modelId, setModelId] = useState<string>('');
  const [promptText, setPromptText] = useState<string>('');
  const [includeImages, setIncludeImages] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<GenResult[]>([]);

  useEffect(() => {
    fetchAssistantProviders()
      .then(({ providers }) => {
        setProviders(providers);
        const firstWithModels = providers.find(
          (p) => getTextModelsForProvider(p.type).length > 0,
        );
        if (firstWithModels) {
          setProviderId(firstWithModels.id);
          const firstModel = getTextModelsForProvider(firstWithModels.type)[0];
          setModelId(firstModel.id);
        }
      })
      .catch(() => {
        toast.error('Failed to load providers');
      });
  }, []);

  const selectedValue = useMemo(
    () => (providerId && modelId ? `${providerId}::${modelId}` : ''),
    [providerId, modelId],
  );

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
      setResults([]);
      const { results } = await batchGeneratePostText({
        postIds,
        promptText,
        includeImages,
        providerId,
        modelId,
      });
      setResults(results);
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      if (fail === 0) {
        toast.success(`Generated text for ${ok} post${ok === 1 ? '' : 's'}`);
      } else {
        toast.warning(`Generated ${ok}, failed ${fail}`);
      }
      onComplete();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate text');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/90 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300 dark:border-white/10 dark:bg-neutral-900/95"
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
              <select
                value={selectedValue}
                onChange={(e) => {
                  const [pid, mid] = e.target.value.split('::');
                  setProviderId(pid || '');
                  setModelId(mid || '');
                }}
                disabled={submitting}
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3.5 text-sm font-bold text-neutral-900 dark:text-neutral-100 outline-none transition focus:border-indigo-500/50 shadow-sm cursor-pointer"
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
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
                Prompt
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={4}
                disabled={submitting}
                className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-black/20 px-5 py-4 text-sm font-medium text-neutral-900 dark:text-neutral-100 outline-none focus:border-indigo-500/50 focus:ring-4 ring-indigo-500/10 transition shadow-inner resize-none"
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

            {results.length > 0 && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl divide-y divide-neutral-200 dark:divide-neutral-800 max-h-64 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.postId} className="p-3 flex items-start gap-3 text-xs">
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10px] text-neutral-400 truncate">{r.postId}</div>
                      <div className="text-neutral-700 dark:text-neutral-300 mt-1 whitespace-pre-wrap break-words">
                        {r.ok ? r.text : r.error}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                Generate
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
