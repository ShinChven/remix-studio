import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveCivitaiResource, searchCivitaiModels } from '../../../api';
import { civitaiModelPageUrl, civitaiResourceLabel, normalizeCivitaiAir, parseCivitaiModelUrl } from '../../../lib/civitai';
import { Button, ChipSet, Icon, IconButton, Ripple, SuggestionChip, Text, TextField } from '../../../m3';
import type { CivitaiResource, CivitaiSearchResult } from '../../../types';
import { useToast } from '../../ui/useToast';

/** A Civitai thumbnail, falling back to the mark when missing or broken. */
function ResourceThumb({ url, small }: { url?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className="v2-civitai-thumb" data-small={small ? '' : undefined}>
      {url && !failed ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <Icon name="hexagon" size={small ? 18 : 22} />}
    </span>
  );
}

/**
 * Add a Civitai model: paste a link or AIR to look it up, or type a name to
 * search and pick a result. The resource is handed back once it is the kind the caller takes.
 */
export function CivitaiResourceLookup({ providerId, slot, baseModels, placeholder, accept, onResolved }: { providerId?: string; slot: 'checkpoint' | 'lora'; baseModels?: string[]; placeholder: string; accept: (resource: CivitaiResource) => string | null; onResolved: (resource: CivitaiResource) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CivitaiSearchResult[] | null>(null);
  const searchId = useRef(0);

  const resolve = async (input: string) => {
    if (!providerId) return;
    setBusy(true);
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
    } catch (e) {
      setError((e as Error)?.message || t('projectViewer.civitai.lookupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const search = async (query: string) => {
    if (!providerId) return;
    const id = ++searchId.current;
    setBusy(true);
    setError(null);
    try {
      const found = await searchCivitaiModels(providerId, query, slot, baseModels);
      if (id !== searchId.current) return;
      setResults(found);
      if (found.length === 0) setError(t('projectViewer.civitai.noSearchResults'));
    } catch (e) {
      if (id === searchId.current) setError((e as Error)?.message || t('projectViewer.civitai.lookupFailed'));
    } finally {
      if (id === searchId.current) setBusy(false);
    }
  };

  const submit = () => {
    const input = value.trim();
    if (!input || !providerId || busy) return;
    // A link or AIR is looked up directly; anything else is a search.
    if (normalizeCivitaiAir(input) || parseCivitaiModelUrl(input) || /^https?:\/\//i.test(input)) void resolve(input);
    else void search(input);
  };
  const isLookup = !!value.trim() && (!!normalizeCivitaiAir(value) || /^https?:\/\//i.test(value.trim()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <TextField
          variant="outlined"
          value={value}
          disabled={!providerId || busy}
          placeholder={providerId ? placeholder : t('projectViewer.civitai.chooseAccountFirst')}
          aria-label={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          onValueChange={(v) => {
            setValue(v);
            setError(null);
            setResults(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1"
          fullWidth
          error={!!error}
          supportingText={error ?? undefined}
        />
        <Button variant="tonal" icon={isLookup || !value.trim() ? 'add' : 'search'} loading={busy} disabled={!providerId || !value.trim()} onClick={submit}>
          {isLookup || !value.trim() ? t('projectViewer.civitai.add') : t('projectViewer.civitai.search')}
        </Button>
      </div>
      {results && results.length > 0 && (
        <div className="v2-civitai-results">
          {results.map((result) => (
            <button key={`${result.modelId}-${result.versionId}`} type="button" disabled={busy} className="v2-destination m3-focus-ring" onClick={() => void resolve(`https://civitai.com/models/${result.modelId}?modelVersionId=${result.versionId}`)}>
              <Ripple />
              <ResourceThumb url={result.previewUrl} small />
              <span className="flex min-w-0 flex-col text-start">
                <Text as="span" variant="label-large" className="truncate">
                  {result.name}
                </Text>
                <Text as="span" variant="label-small" className="truncate text-on-surface-variant">
                  {[result.versionName, result.type, result.baseModel].filter(Boolean).join(' · ')}
                </Text>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Trigger words a resource was trained on; clicking one copies it. */
export function CivitaiTriggerWords({ words }: { words?: string[] }) {
  const { t } = useTranslation();
  const toast = useToast();
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
    <div className="flex flex-col gap-1">
      <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
        {t('projectViewer.civitai.triggerWords')}
      </Text>
      <ChipSet>
        {words.map((word) => (
          <SuggestionChip key={word} label={word} icon="content_copy" onClick={() => void copy(word)} title={t('projectViewer.civitai.copyTriggerWord')} />
        ))}
      </ChipSet>
    </div>
  );
}

/** One resource: thumbnail, name, type and base model, a link to Civitai and remove. */
export function CivitaiResourceCard({ resource, onRemove, actions, children }: { resource: CivitaiResource; onRemove: () => void; actions?: ReactNode; children?: ReactNode }) {
  const { t } = useTranslation();
  const href = civitaiModelPageUrl(resource.air);
  return (
    <div className="v2-civitai-card">
      <div className="flex items-center gap-2">
        <ResourceThumb url={resource.previewUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text as="span" variant="label-large" emphasized className="truncate" title={resource.air}>
            {civitaiResourceLabel(resource)}
          </Text>
          <span className="flex flex-wrap gap-1">
            {resource.type && <span className="v2-info-chip">{resource.type}</span>}
            {resource.baseModel && <span className="v2-info-chip" data-tone="tertiary">{resource.baseModel}</span>}
          </span>
        </div>
        {actions}
        {href && <IconButton icon="open_in_new" size="xs" label={t('projectViewer.civitai.openOnCivitai')} tooltip href={href} target="_blank" rel="noreferrer" />}
        <IconButton icon="close" size="xs" label={t('projectViewer.civitai.remove')} tooltip onClick={onRemove} />
      </div>
      {children}
      <CivitaiTriggerWords words={resource.trainedWords} />
    </div>
  );
}
