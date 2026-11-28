import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAlbumRescaleDrafts, inspectAlbumRescale, type RescaleSourceInfo } from '../../../api';
import { Button, Dialog, Icon, LoadingIndicator, Ripple, Text, TextField } from '../../../m3';
import {
  DEFAULT_RESCALE_PROMPT,
  RESCALE_IMAGE_FORMATS,
  RESCALE_SOURCE,
  carryQuality,
  carryRatio,
  describeRatio,
  estimateOutputSize,
  isFlexibleRatio,
  matchRatio,
  pickRescaleQuality,
  ratioMatchesSource,
} from '../../../lib/rescale-size';
import { resolveSupportedOption, type AlbumItem, type Provider } from '../../../types';
import { ChoiceChips, RatioGlyph, SettingField } from '../../ui/ChoiceChips';
import { ProviderLogo } from '../ProviderLogo';
import { ModelSelectorDialog } from './ModelSelectorDialog';

/** What a rescale starts from: the project's own model and settings. */
export interface RescaleDefaults {
  providers: Provider[];
  providerId?: string;
  modelConfigId?: string;
  quality?: string;
  background?: string;
}

export interface RescaleDialogProps {
  open: boolean;
  projectId: string;
  items: AlbumItem[];
  defaults: RescaleDefaults;
  onClose: () => void;
  /** Called with how many drafts were staged. */
  onDrafted: (created: number) => void;
}

const PROMPT_STORAGE_KEY = 'remix.v2.rescalePrompt';
/** Enough sources to judge the selection by; the server reads every one when drafting. */
const MAX_INSPECTED = 60;

function readStoredPrompt(): string {
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_RESCALE_PROMPT;
  } catch {
    return DEFAULT_RESCALE_PROMPT;
  }
}

function storePrompt(prompt: string) {
  try {
    if (prompt === DEFAULT_RESCALE_PROMPT) window.localStorage.removeItem(PROMPT_STORAGE_KEY);
    else window.localStorage.setItem(PROMPT_STORAGE_KEY, prompt);
  } catch {
    // Remembering the prompt is a convenience only.
  }
}

const imageModels = (provider: Provider | undefined) => (provider?.models || []).filter((m) => !m.category || m.category === 'image');

/**
 * Rescales album images with an image model: the prompt, model, size and format
 * apply to every image, and "match source" settings are resolved per image.
 */
export function RescaleDialog({ open, projectId, items, defaults, onClose, onDrafted }: RescaleDialogProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState(DEFAULT_RESCALE_PROMPT);
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [ratio, setRatio] = useState<string>(RESCALE_SOURCE);
  const [quality, setQuality] = useState<string | undefined>();
  const [background, setBackground] = useState<string | undefined>();
  const [format, setFormat] = useState<string>(RESCALE_SOURCE);
  const [infos, setInfos] = useState<RescaleSourceInfo[] | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const qualityTouched = useRef(false);

  const provider = defaults.providers.find((p) => p.id === providerId);
  const model = imageModels(provider).find((m) => m.id === modelId);
  const ratioOptions = model?.options.aspectRatios;
  const qualityOptions = model?.options.qualities;
  const backgroundOptions = model?.options.backgrounds;

  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const single = items.length === 1;
  const known = (infos || []).filter((info) => info.width && info.height) as Array<Required<Pick<RescaleSourceInfo, 'width' | 'height'>> & RescaleSourceInfo>;
  const first = single ? known[0] : undefined;
  const sourceRatio = first ? first.width / first.height : undefined;
  const largest = known.reduce<typeof known[number] | undefined>((max, info) => (!max || info.width * info.height > max.width * max.height ? info : max), undefined);
  const sourceMegapixels = largest ? (largest.width * largest.height) / 1e6 : undefined;

  // Start over from the project's settings each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const startProvider = defaults.providers.find((p) => p.id === defaults.providerId && imageModels(p).some((m) => m.id === defaults.modelConfigId))
      ?? defaults.providers.find((p) => imageModels(p).length > 0);
    const startModel = imageModels(startProvider).find((m) => m.id === defaults.modelConfigId) ?? imageModels(startProvider)[0];
    setPrompt(readStoredPrompt());
    setProviderId(startProvider?.id || '');
    setModelId(startModel?.id || '');
    setRatio(RESCALE_SOURCE);
    setQuality(carryQuality(defaults.quality, startModel?.options.qualities));
    setBackground(resolveSupportedOption(defaults.background, startModel?.options.backgrounds));
    setFormat(RESCALE_SOURCE);
    setError('');
    setInfos(null);
    qualityTouched.current = false;
    // Only reopening resets the form; the defaults are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || itemIds.length === 0) return;
    const controller = new AbortController();
    inspectAlbumRescale(projectId, itemIds.slice(0, MAX_INSPECTED), controller.signal)
      .then(setInfos)
      .catch(() => !controller.signal.aborted && setInfos([]));
    return () => controller.abort();
  }, [open, projectId, itemIds]);

  // Once the sources are known, start one tier above them unless a tier was picked.
  useEffect(() => {
    if (!infos || qualityTouched.current) return;
    setQuality(pickRescaleQuality(qualityOptions, sourceMegapixels, defaults.quality));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infos, modelId]);

  const pickModel = (nextProviderId: string, nextModelId: string) => {
    const next = imageModels(defaults.providers.find((p) => p.id === nextProviderId)).find((m) => m.id === nextModelId);
    setSelectorOpen(false);
    if (!next) return;
    setProviderId(nextProviderId);
    setModelId(nextModelId);
    if (ratio !== RESCALE_SOURCE) setRatio(carryRatio(ratio, next.options.aspectRatios) ?? RESCALE_SOURCE);
    if (qualityTouched.current || !infos) setQuality(carryQuality(quality, next.options.qualities));
    setBackground(resolveSupportedOption(background, next.options.backgrounds));
  };

  const effectiveRatio = ratio === RESCALE_SOURCE ? (sourceRatio ? matchRatio(sourceRatio, ratioOptions, sourceMegapixels) : undefined) : ratio;
  const output = estimateOutputSize(sourceRatio, effectiveRatio, quality);
  const canSubmit = Boolean(model && prompt.trim()) && !submitting && items.length > 0;

  const submit = async () => {
    if (!canSubmit || !model) return;
    setSubmitting(true);
    setError('');
    try {
      const { created } = await createAlbumRescaleDrafts(projectId, {
        itemIds,
        prompt: prompt.trim(),
        providerId,
        modelConfigId: model.id,
        aspectRatio: ratio,
        quality,
        format,
        background,
      });
      storePrompt(prompt.trim());
      onDrafted(created);
      onClose();
    } catch (err) {
      setError((err as Error).message || t('v2.rescale.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const sourceSummary = !infos ? (
    <span className="inline-flex items-center gap-2">
      <LoadingIndicator size={16} aria-hidden />
      {t('v2.rescale.reading')}
    </span>
  ) : single ? (
    first ? t('v2.rescale.sourceSingle', { width: first.width, height: first.height, ratio: describeRatio(first.width, first.height), format: (first.format || items[0].format || 'png').toUpperCase() }) : t('v2.rescale.sourceUnknown')
  ) : largest ? (
    t('v2.rescale.sourceMany', { count: items.length, width: largest.width, height: largest.height })
  ) : (
    t('v2.rescale.sourceManyUnknown', { count: items.length })
  );

  let ratioHint: string;
  if (ratio !== RESCALE_SOURCE) ratioHint = isFlexibleRatio(ratio) ? t('v2.rescale.ratioFlexible') : '';
  else if (!single) ratioHint = t('v2.rescale.ratioEach');
  else if (!effectiveRatio) ratioHint = t('v2.rescale.ratioEach');
  else if (isFlexibleRatio(effectiveRatio)) ratioHint = t('v2.rescale.ratioSourceFlexible', { ratio: effectiveRatio });
  else if (first && !ratioMatchesSource(sourceRatio, effectiveRatio)) ratioHint = t('v2.rescale.ratioClosest', { ratio: effectiveRatio, source: describeRatio(first.width, first.height) });
  else ratioHint = t('v2.rescale.ratioSource', { ratio: effectiveRatio });

  const submitButton = (
    <Button variant="filled" icon="photo_size_select_large" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
      {t('v2.rescale.submit', { count: items.length })}
    </Button>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={() => !submitting && onClose()}
        dismissible={!submitting}
        fullScreen="compact"
        icon="photo_size_select_large"
        headline={t('v2.rescale.title', { count: items.length })}
        maxWidth={640}
        describeContent={false}
        confirmAction={submitButton}
        actions={
          <>
            <Button variant="text" onClick={onClose} disabled={submitting}>
              {t('projectViewer.common.cancel')}
            </Button>
            {submitButton}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('v2.rescale.description')}
          </Text>

          <div className="v2-kv">
            <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {t('v2.rescale.source')}
            </Text>
            <Text as="span" variant="body-medium" className="break-words">
              {sourceSummary}
            </Text>
          </div>

          <TextField
            variant="outlined"
            multiline
            rows={3}
            maxRows={8}
            label={t('v2.rescale.prompt')}
            value={prompt}
            onValueChange={setPrompt}
            fullWidth
            supportingText={
              prompt !== DEFAULT_RESCALE_PROMPT ? (
                <button type="button" className="v2-link" onClick={() => setPrompt(DEFAULT_RESCALE_PROMPT)}>
                  {t('v2.rescale.resetPrompt')}
                </button>
              ) : undefined
            }
          />

          <SettingField label={t('projectViewer.settings.aiModel')}>
            <button type="button" className="v2-model-button m3-focus-ring" data-attention={!model ? '' : undefined} onClick={() => setSelectorOpen(true)}>
              <Ripple />
              {provider && <ProviderLogo type={provider.type} size={20} />}
              <span className="flex min-w-0 flex-1 flex-col text-start">
                <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                  {provider?.name || t('projectViewer.settings.selectProvider')}
                </Text>
                <Text as="span" variant="title-small" emphasized className="truncate">
                  {model?.name || t('projectViewer.settings.selectModel')}
                </Text>
              </span>
              <Icon name="swap_horiz" />
            </button>
          </SettingField>

          {model && ratioOptions && ratioOptions.length > 0 && (
            <SettingField label={t('projectViewer.settings.aspectRatio')} hint={ratioHint || undefined}>
              <ChoiceChips<string>
                stacked
                value={ratio}
                onChange={setRatio}
                options={[
                  { value: RESCALE_SOURCE, label: t('v2.rescale.matchSource'), visual: first ? <RatioGlyph ratio={`${first.width}:${first.height}`} /> : <Icon name="photo" size={18} /> },
                  ...ratioOptions.map((value) => ({ value, label: value, visual: <RatioGlyph ratio={value} /> })),
                ]}
              />
            </SettingField>
          )}

          {model && qualityOptions && qualityOptions.length > 0 && quality && (
            <SettingField label={t('v2.rescale.size')} hint={output ? t('v2.rescale.output', { width: output.width, height: output.height }) : undefined}>
              <ChoiceChips<string>
                value={quality}
                onChange={(next) => {
                  qualityTouched.current = true;
                  setQuality(next);
                }}
                options={qualityOptions.map((value) => ({ value }))}
              />
            </SettingField>
          )}

          {model && backgroundOptions && backgroundOptions.length > 0 && background && (
            <SettingField label={t('projectViewer.settings.background')}>
              <ChoiceChips<string> value={background} onChange={setBackground} options={backgroundOptions.map((value) => ({ value }))} />
            </SettingField>
          )}

          <SettingField label={t('projectViewer.settings.format')}>
            <ChoiceChips<string>
              value={format}
              onChange={setFormat}
              options={[{ value: RESCALE_SOURCE, label: t('v2.rescale.matchSource') }, ...RESCALE_IMAGE_FORMATS.map((value) => ({ value, label: value.toUpperCase() }))]}
            />
          </SettingField>

          {error && (
            <div className="v2-notice" data-tone="error" role="alert">
              <Icon name="error" />
              <Text variant="body-medium">{error}</Text>
            </div>
          )}
        </div>
      </Dialog>
      <ModelSelectorDialog
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        providers={defaults.providers}
        selectedProviderId={providerId}
        selectedModelId={modelId}
        onSelect={pickModel}
        projectType="image"
      />
    </>
  );
}
