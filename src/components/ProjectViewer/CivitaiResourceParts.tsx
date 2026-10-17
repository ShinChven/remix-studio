import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ExternalLink, Hexagon, Loader2, Plus, Search, X } from 'lucide-react';
import { resolveCivitaiResource, searchCivitaiModels } from '../../api';
import type { CivitaiResource, CivitaiSearchResult } from '../../types';
import { civitaiModelPageUrl, civitaiResourceLabel, normalizeCivitaiAir, parseCivitaiModelUrl } from '../../lib/civitai';

/** Shared pieces of the Civitai settings panel and workflow model items. */

export const civitaiFieldClass = 'w-full rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white/70 dark:bg-black/40 px-3 py-2 text-base sm:text-xs text-neutral-900 dark:text-neutral-200 shadow-inner focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 transition-all';
export const civitaiNumberClass = `${civitaiFieldClass} font-mono text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;
export const civitaiChipBaseClass = 'text-[9px] font-bold text-neutral-500 dark:text-neutral-500 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 uppercase tracking-widest';

export function civitaiChipClass(selected: boolean) {
  return `px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
    selected
      ? 'border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-300'
      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
  }`;
}

/** A thumbnail from Civitai, falling back to the mark when it is missing or fails to load. */
function ResourceThumb({ url, size = 'w-11 h-11' }: { url?: string; size?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed) {
    return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${size} shrink-0 rounded-lg object-cover bg-neutral-100 dark:bg-neutral-900`} />;
  }
  return (
    <div className={`${size} shrink-0 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center`}>
      <Hexagon className="w-5 h-5" />
    </div>
  );
}

/**
 * Add a Civitai model: paste a model link or AIR to look it up, or type a name
 * to search the catalog and pick a result. The resource is handed back once it
 * is the kind the caller takes.
 */
export function CivitaiResourceLookup({ providerId, slot, baseModels, placeholder, accept, onResolved }: {
  providerId?: string;
  slot: 'checkpoint' | 'lora';
  /** Only search for models made for these base models. */
  baseModels?: string[];
  placeholder: string;
  /** An error message when the resource does not belong here, otherwise null. */
  accept: (resource: CivitaiResource) => string | null;
  onResolved: (resource: CivitaiResource) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CivitaiSearchResult[] | null>(null);
  const searchId = useRef(0);

  const resolve = async (input: string) => {
    if (!providerId) return;
    setIsBusy(true);
    setError(null);
    try {
      const resource = await resolveCivitaiResource(providerId, input);
      const rejection = accept(resource);
      if (rejection) {
        setError(rejection);
        return;
      }
      onResolved(resource);
      setValue('');
      setResults(null);
    } catch (e: any) {
      setError(e?.message || t('projectViewer.civitai.lookupFailed'));
    } finally {
      setIsBusy(false);
    }
  };

  const search = async (query: string) => {
    if (!providerId) return;
    const id = ++searchId.current;
    setIsBusy(true);
    setError(null);
    try {
      const found = await searchCivitaiModels(providerId, query, slot, baseModels);
      if (id !== searchId.current) return;
      setResults(found);
      if (found.length === 0) setError(t('projectViewer.civitai.noSearchResults'));
    } catch (e: any) {
      if (id === searchId.current) setError(e?.message || t('projectViewer.civitai.lookupFailed'));
    } finally {
      if (id === searchId.current) setIsBusy(false);
    }
  };

  const submit = () => {
    const input = value.trim();
    if (!input || !providerId || isBusy) return;
    // A link or AIR is looked up directly; anything else is a search.
    if (normalizeCivitaiAir(input) || parseCivitaiModelUrl(input) || /^https?:\/\//i.test(input)) void resolve(input);
    else void search(input);
  };

  const isLookup = !!value.trim() && (!!normalizeCivitaiAir(value) || /^https?:\/\//i.test(value.trim()));

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          disabled={!providerId || isBusy}
          placeholder={providerId ? placeholder : t('projectViewer.civitai.chooseAccountFirst')}
          onChange={(e) => { setValue(e.target.value); setError(null); setResults(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          className={`${civitaiFieldClass} min-w-0 flex-1 disabled:opacity-60`}
          spellCheck={false}
          autoCapitalize="none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!providerId || !value.trim() || isBusy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isLookup || !value.trim() ? <Plus className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
          {isLookup || !value.trim() ? t('projectViewer.civitai.add') : t('projectViewer.civitai.search')}
        </button>
      </div>
      {results && results.length > 0 && (
        <div className="rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-950 shadow-lg max-h-64 overflow-y-auto custom-scrollbar divide-y divide-neutral-200/60 dark:divide-white/5">
          {results.map((result) => (
            <button
              key={`${result.modelId}-${result.versionId}`}
              type="button"
              disabled={isBusy}
              onClick={() => void resolve(`https://civitai.com/models/${result.modelId}?modelVersionId=${result.versionId}`)}
              className="w-full flex items-center gap-2.5 p-2 text-left hover:bg-sky-500/5 transition-colors disabled:opacity-50"
            >
              <ResourceThumb url={result.previewUrl} size="w-9 h-9" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-neutral-900 dark:text-white truncate">{result.name}</span>
                <span className="block text-[10px] text-neutral-500 truncate">
                  {[result.versionName, result.type, result.baseModel].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="px-1 text-[11px] leading-4 text-red-500">{error}</p>}
    </div>
  );
}

/** Trigger words a resource was trained on; clicking one copies it. */
export function CivitaiTriggerWords({ words }: { words?: string[] }) {
  const { t } = useTranslation();
  if (!words || words.length === 0) return null;
  const copy = async (word: string) => {
    try {
      await navigator.clipboard.writeText(word);
      toast.success(t('projectViewer.civitai.triggerWordCopied'));
    } catch {
      toast.error(t('projectViewer.civitai.copyFailed'));
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{t('projectViewer.civitai.triggerWords')}</span>
      {words.map((word) => (
        <button
          key={word}
          type="button"
          onClick={() => void copy(word)}
          title={t('projectViewer.civitai.copyTriggerWord')}
          className="max-w-full truncate rounded-md border border-sky-500/30 bg-sky-500/5 px-1.5 py-0.5 text-[10px] font-mono text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 transition-colors"
        >
          {word}
        </button>
      ))}
    </div>
  );
}

/** One resource: thumbnail, name, type and base model, a link to Civitai and a remove button. */
export function CivitaiResourceCard({ resource, onRemove, actions, children }: {
  resource: CivitaiResource;
  onRemove: () => void;
  /** Extra buttons next to the link and remove buttons. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const href = civitaiModelPageUrl(resource.air);
  return (
    <div className="rounded-xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-950 p-2.5 shadow-sm space-y-2">
      <div className="flex items-start gap-2.5">
        <ResourceThumb url={resource.previewUrl} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-neutral-900 dark:text-white leading-4 line-clamp-2 break-words" title={resource.air}>
            {civitaiResourceLabel(resource)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {resource.type && <span className={civitaiChipBaseClass}>{resource.type}</span>}
            {resource.baseModel && <span className={civitaiChipBaseClass}>{resource.baseModel}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
              title={t('projectViewer.civitai.openOnCivitai')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title={t('projectViewer.civitai.remove')}
            aria-label={t('projectViewer.civitai.remove')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {children}
      <CivitaiTriggerWords words={resource.trainedWords} />
    </div>
  );
}
