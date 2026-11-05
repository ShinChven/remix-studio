import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAlbumItemInputs, imageDisplayUrl, type AlbumExportVersion, type AlbumItemInputs } from '../../../api';
import type { ProjectMediaType } from '../../../lib/project-media';
import { Button, ChipSet, Dialog, FilterChip, Icon, IconButton, InputChip, SuggestionChip, Text, TextField } from '../../../m3';
import type { AlbumItem, AlbumTagCount } from '../../../types';
import { ChoiceTiles } from '../../ui/ChoiceTiles';
import { Segmented } from '../../ui/Toolbar';
import { useToast } from '../../ui/useToast';
import { CivitaiParamsTable, ParamTable, type OpenLightbox } from './JobDetails';

async function copyWithToast(value: string, ok: string, fail: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(ok);
  } catch {
    toast.error(fail);
  }
}

interface AlbumDetailDialogProps {
  projectId: string;
  item: AlbumItem | null;
  mediaType: ProjectMediaType;
  rows: Array<{ label: string; value: ReactNode }>;
  selectedTags: string[];
  onTagClick: (tag: string) => void;
  onClose: () => void;
}

export function AlbumDetailDialog({ projectId, item, mediaType, rows, selectedTags, onTagClick, onClose }: AlbumDetailDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      headline={t('v2.project.albumDetails.title')}
      showCloseButton
      describeContent={false}
      fullScreen="compact"
      maxWidth={1120}
      className="v2-album-detail"
    >
      {item && (
        <div className="v2-album-detail__layout" data-split={mediaType !== 'text' && item.imageUrl ? '' : undefined}>
          {mediaType !== 'text' && item.imageUrl && <AlbumResultPreview key={item.imageUrl} item={item} mediaType={mediaType} />}
          <div className="v2-album-detail__info">
            <ParamTable label={t('v2.project.details')} rows={rows} />
            {!!item.tags?.length && (
              <section className="v2-album-detail__tags" aria-label={t('projectViewer.album.tagFilter')}>
                <Text as="h3" variant="title-small">{t('projectViewer.album.tagFilter')}</Text>
                <Text variant="body-small" className="text-on-surface-variant">{t('v2.project.albumDetails.filterHint')}</Text>
                <ChipSet>
                  {item.tags.map((tag) => (
                    <FilterChip key={tag} label={<span title={tag}>#{tag}</span>} selected={selectedTags.includes(tag)} onClick={() => onTagClick(tag)} />
                  ))}
                </ChipSet>
              </section>
            )}
            <section className="v2-album-detail__prompt">
              <div className="v2-album-detail__section-heading">
                <Text as="h3" variant="title-small">{t('projectViewer.common.prompt')}</Text>
                {item.prompt && (
                  <Button variant="tonal" size="sm" icon="content_copy" onClick={() => void copyWithToast(item.prompt, t('projectViewer.albumPrompt.promptCopied'), t('projectViewer.albumPrompt.copyFailed'), toast)}>
                    {t('projectViewer.common.copy')}
                  </Button>
                )}
              </div>
              <AlbumPromptContent key={`${projectId}:${item.id}`} projectId={projectId} item={item} />
            </section>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function AlbumResultPreview({ item, mediaType }: { item: AlbumItem; mediaType: Exclude<ProjectMediaType, 'text'> }) {
  const { t } = useTranslation();
  const [useOriginal, setUseOriginal] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const original = imageDisplayUrl(item.imageUrl);
  const preview = !useOriginal && item.optimizedUrl ? imageDisplayUrl(item.optimizedUrl) : original;
  const label = t('v2.project.albumDetails.preview');

  return (
    <section className="v2-album-detail__preview">
      <Text as="h3" variant="label-small" className="v2-detail-block__label">{label}</Text>
      <div className="v2-album-detail__frame">
        {mediaType === 'video' ? (
          <video src={original} poster={imageDisplayUrl(item.optimizedUrl || item.thumbnailUrl || '') || undefined} aria-label={label} controls playsInline preload="metadata" />
        ) : mediaType === 'audio' ? (
          <audio src={original} aria-label={label} controls preload="none" />
        ) : unavailable ? (
          <span className="v2-album-detail__unavailable">
            <Icon name="broken_image" size={32} />
            {t('v2.project.albumDetails.imageUnavailable')}
          </span>
        ) : (
          <img src={preview} alt={label} referrerPolicy="no-referrer" onError={() => preview === original ? setUnavailable(true) : setUseOriginal(true)} />
        )}
      </div>
      <Button variant="text" size="sm" icon="open_in_new" href={original} target="_blank" rel="noreferrer">
        {t('projectViewer.album.openOriginal')}
      </Button>
    </section>
  );
}

function AlbumPromptContent({ projectId, item }: { projectId: string; item: AlbumItem }) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<AlbumItemInputs>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchAlbumItemInputs(projectId, item.id, controller.signal).then(setInputs).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [projectId, item.id]);

  const images = inputs?.imageContexts ?? item.imageContexts ?? [];
  const videos = inputs?.videoContexts ?? [];
  const audio = inputs?.audioContexts ?? [];
  const label = t('v2.project.albumDetails.inputs');

  return (
    <>
      {(!inputs || images.length > 0 || videos.length > 0 || audio.length > 0) && (
        <div className="v2-album-detail__inputs">
          <Text as="h4" variant="label-large">{label}</Text>
          {!inputs && (
            <Text as="p" variant="body-small" role="status" className="text-on-surface-variant">
              {failed ? t('v2.project.albumDetails.inputsFailed') : t('apiKeyCheck.loading')}
            </Text>
          )}
          {images.length > 0 && (
            <div className="v2-context-grid">
              {images.map((src, index) => {
                const name = t('projectViewer.textDetail.referenceAlt', { index: index + 1 });
                const url = imageDisplayUrl(src);
                return (
                  <a key={index} className="v2-context-thumb m3-focus-ring" href={url} target="_blank" rel="noreferrer" title={name}>
                    <img src={url} alt={name} referrerPolicy="no-referrer" loading="lazy" />
                  </a>
                );
              })}
            </div>
          )}
          {videos.length > 0 && (
            <div className="v2-album-detail__videos">
              {videos.map((src, index) => {
                const name = t('v2.project.albumDetails.referenceVideo', { index: index + 1 });
                return (
                  <figure key={index} className="v2-album-detail__input-player">
                    <figcaption><Text as="span" variant="label-medium">{name}</Text></figcaption>
                    <video src={src} aria-label={name} className="v2-media-player" controls playsInline preload="metadata" />
                  </figure>
                );
              })}
            </div>
          )}
          {audio.map((src, index) => {
            const name = t('v2.project.albumDetails.referenceAudio', { index: index + 1 });
            return (
              <figure key={index} className="v2-album-detail__input-player">
                <figcaption><Text as="span" variant="label-medium">{name}</Text></figcaption>
                <audio src={src} aria-label={name} controls preload="none" />
              </figure>
            );
          })}
        </div>
      )}
      <Text variant="body-medium" className="v2-album-detail__prompt-text">{item.prompt || t('v2.project.albumDetails.emptyPrompt')}</Text>
      <CivitaiParamsTable params={item.civitaiParams} sourceCount={images.length} />
    </>
  );
}

export interface ExportPackageDialogProps {
  open: boolean;
  defaultValue: string;
  itemCount: number;
  onClose: () => void;
  onSubmit: (packageName: string, version: AlbumExportVersion) => Promise<void> | void;
  onWatermark?: (packageName: string, version: AlbumExportVersion) => void;
}

/** Names the ZIP and picks raw or optimized files before an album export, or hands off to watermarking. */
export function ExportPackageDialog({ open, defaultValue, itemCount, onClose, onSubmit, onWatermark }: ExportPackageDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultValue);
  const [version, setVersion] = useState<AlbumExportVersion>('raw');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultValue);
    setVersion('raw');
    setBusy(false);
  }, [defaultValue, open]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(name, version);
      onClose();
    } catch {
      // The caller reports the failure; the dialog stays open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      icon="package_2"
      headline={t('projectViewer.exportDialog.title')}
      maxWidth={520}
      actions={
        <>
          <Button variant="text" disabled={busy} onClick={onClose}>
            {t('projectViewer.common.cancel')}
          </Button>
          {onWatermark && (
            <Button variant="tonal" icon="approval" disabled={busy} onClick={() => onWatermark(name.trim() || defaultValue, version)}>
              {t('projectViewer.exportDialog.watermark', { defaultValue: 'Watermark' })}
            </Button>
          )}
          <Button variant="filled" icon="download" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
            {busy ? t('projectViewer.exportDialog.queueing') : t('projectViewer.exportDialog.startExport')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {t('projectViewer.exportDialog.description')}
        </Text>
        <div className="v2-kv v2-kv--row">
          <Text variant="label-medium" className="uppercase tracking-widest">
            {t('projectViewer.exportDialog.itemCount', { count: itemCount })}
          </Text>
        </div>
        <TextField
          variant="outlined"
          label={t('projectViewer.exportDialog.packageName')}
          placeholder={t('projectViewer.exportDialog.placeholder')}
          value={name}
          onValueChange={setName}
          fullWidth
          data-autofocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Text variant="label-medium" className="text-on-surface-variant">
          {t('projectViewer.exportDialog.version')}
        </Text>
        <ChoiceTiles<AlbumExportVersion>
          size="compact"
          value={version}
          onChange={setVersion}
          options={[
            { value: 'raw', label: t('projectViewer.exportDialog.raw'), icon: 'image' },
            { value: 'optimized', label: t('projectViewer.exportDialog.optimized'), icon: 'auto_awesome' },
          ]}
        />
      </div>
    </Dialog>
  );
}

/** Text results side by side: prompt, references and generated text per column. */
export function TextAlbumCompareDialog({ items, setLightboxData, onClose }: { items: AlbumItem[]; setLightboxData: OpenLightbox; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const copy = (value: string, label: string) => copyWithToast(value, t('projectViewer.compare.copied', { label }), t('projectViewer.compare.copyFailed', { label: label.toLowerCase() }), toast);
  return (
    <Dialog open={items.length > 0} onClose={onClose} fullScreen headline={t('projectViewer.compare.title')} className="v2-compare-dialog">
      <Text variant="label-medium" className="mb-3 uppercase tracking-widest text-on-surface-variant">
        {t('projectViewer.compare.subtitle', { count: items.length })}
      </Text>
      <div className="v2-compare">
        {items.map((item, index) => (
          <article key={item.id} className="v2-compare__column">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Text variant="title-small" emphasized className="font-mono">
                  #{(index + 1).toString().padStart(2, '0')}
                </Text>
                <Text variant="label-small" className="truncate text-on-surface-variant">
                  {item.providerId || t('projectViewer.common.provider')} · {item.modelConfigId || t('projectViewer.common.model')}
                </Text>
              </div>
              <div className="flex gap-1">
                <Button variant="tonal" size="xs" icon="content_copy" onClick={() => void copy(item.prompt, t('projectViewer.common.prompt'))}>
                  {t('projectViewer.common.prompt')}
                </Button>
                <Button variant="tonal" size="xs" icon="content_copy" onClick={() => void copy(item.textContent || '', t('projectViewer.common.generatedText'))}>
                  {t('projectViewer.common.text')}
                </Button>
              </div>
            </header>
            {(item.imageContexts || []).length > 0 && (
              <section className="flex flex-col gap-2">
                <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                  {t('projectViewer.compare.referenceImages', { count: item.imageContexts?.length || 0 })}
                </Text>
                <div className="v2-context-grid">
                  {(item.imageContexts || []).map((src, refIndex) => (
                    <button key={refIndex} type="button" className="v2-context-thumb m3-focus-ring" onClick={() => setLightboxData({ images: (item.imageContexts || []).map(imageDisplayUrl), index: refIndex })}>
                      <img src={imageDisplayUrl(src)} alt={t('projectViewer.compare.referenceAlt', { index: refIndex + 1 })} referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="flex flex-col gap-2">
              <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                {t('projectViewer.common.prompt')}
              </Text>
              <Text variant="body-small" className="whitespace-pre-wrap text-on-surface-variant">
                {item.prompt}
              </Text>
            </section>
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <Text variant="label-small" className="uppercase tracking-widest text-primary">
                {t('projectViewer.common.generatedText')}
              </Text>
              <div className="v2-code-block v2-compare__text">{item.textContent || t('projectViewer.compare.noGeneratedText')}</div>
            </section>
          </article>
        ))}
      </div>
    </Dialog>
  );
}

/** One text result at a time, with ← → to step through the page. */
export function TextAlbumDetailDialog({ items, startIndex, setLightboxData, onClose }: { items: AlbumItem[]; startIndex: number | null; setLightboxData: OpenLightbox; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [index, setIndex] = useState(startIndex ?? 0);
  const open = startIndex !== null && items.length > 0;

  useEffect(() => {
    if (startIndex !== null) setIndex(startIndex);
  }, [startIndex]);

  const prev = () => setIndex((i) => (i > 0 ? i - 1 : items.length - 1));
  const next = () => setIndex((i) => (i < items.length - 1 ? i + 1 : 0));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  const item = open ? items[Math.min(index, items.length - 1)] : null;
  const multiple = items.length > 1;
  const refs = item?.imageContexts || [];
  const copy = (value: string, label: string) => copyWithToast(value, t('projectViewer.textDetail.copied', { label }), t('projectViewer.textDetail.copyFailed', { label: label.toLowerCase() }), toast);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="article"
      headline={
        <span className="flex items-center gap-2">
          {t('projectViewer.textDetail.title')}
          <Text as="span" variant="label-medium" className="font-mono text-on-surface-variant">
            {t('projectViewer.textDetail.itemIndex', { index: (index + 1).toString().padStart(2, '0') })}
            {multiple ? ` / ${items.length.toString().padStart(2, '0')}` : ''}
          </Text>
        </span>
      }
      fullScreen="compact"
      maxWidth={1080}
      aria-label={t('projectViewer.textDetail.dialogAria')}
      actions={
        item && (
          <>
            <Text variant="label-small" className="me-auto text-on-surface-variant">
              {t('projectViewer.textDetail.characterCount', { count: (item.textContent || '').length })} · {t('projectViewer.textDetail.keyboardHint')}
            </Text>
            {multiple && (
              <>
                <IconButton icon="chevron_left" variant="tonal" label={t('projectViewer.textDetail.previousItem')} onClick={prev} className="m3-mirror-rtl" />
                <IconButton icon="chevron_right" variant="tonal" label={t('projectViewer.textDetail.nextItem')} onClick={next} className="m3-mirror-rtl" />
              </>
            )}
            <Button variant="filled" onClick={onClose}>
              {t('projectViewer.common.close')}
            </Button>
          </>
        )
      }
    >
      {item && (
        <div className="v2-text-detail">
          <section className="v2-text-detail__pane">
            <div className="flex items-center justify-between gap-2">
              <Text variant="label-large" emphasized className="flex items-center gap-2">
                <Icon name="auto_awesome" size={18} className="text-primary" />
                {t('projectViewer.common.prompt')}
              </Text>
              <Button variant="text" size="xs" icon="content_copy" onClick={() => void copy(item.prompt, t('projectViewer.common.prompt'))}>
                {t('projectViewer.common.copy')}
              </Button>
            </div>
            {refs.length > 0 && (
              <div className="flex flex-col gap-2">
                <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                  {t('projectViewer.textDetail.referenceImages', { count: refs.length })}
                </Text>
                <div className="v2-context-grid">
                  {refs.map((src, idx) => (
                    <button key={idx} type="button" className="v2-context-thumb m3-focus-ring" title={t('projectViewer.textDetail.refShort', { index: idx + 1 })} onClick={() => setLightboxData({ images: refs.map(imageDisplayUrl), index: idx })}>
                      <img src={imageDisplayUrl(src)} alt={t('projectViewer.textDetail.referenceAlt', { index: idx + 1 })} referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Text variant="body-medium" className="whitespace-pre-wrap">
              {item.prompt}
            </Text>
          </section>
          <section className="v2-text-detail__pane" data-primary="">
            <div className="flex items-center justify-between gap-2">
              <Text variant="label-large" emphasized className="flex items-center gap-2">
                <Icon name="article" size={18} className="text-primary" />
                {t('projectViewer.common.generatedText')}
              </Text>
              <Button variant="text" size="xs" icon="content_copy" disabled={!item.textContent} onClick={() => void copy(item.textContent || '', t('projectViewer.common.generatedText'))}>
                {t('projectViewer.common.copy')}
              </Button>
            </div>
            <Text variant="body-large" className="whitespace-pre-wrap">
              {item.textContent || t('projectViewer.textDetail.noGeneratedText')}
            </Text>
          </section>
        </div>
      )}
    </Dialog>
  );
}

export type AlbumBatchTagMode = 'add' | 'remove' | 'replace';

export interface AlbumBatchTagDialogProps {
  open: boolean;
  onClose: () => void;
  targetCount: number;
  /** The batch covers everything the filters select, not a selection. */
  isAllScope: boolean;
  suggestions: AlbumTagCount[];
  onApply: (mode: AlbumBatchTagMode, tags: string[]) => Promise<void>;
}

/** Adds, removes or replaces tags across many album items at once. */
export function AlbumBatchTagDialog({ open, onClose, targetCount, isAllScope, suggestions, onApply }: AlbumBatchTagDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AlbumBatchTagMode>('add');
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('add');
    setTags([]);
    setInput('');
    setSaving(false);
  }, [open]);

  const available = useMemo(() => suggestions.filter((entry) => !tags.some((tag) => tag.toLowerCase() === entry.tag.toLowerCase())), [suggestions, tags]);

  const addFromInput = () => {
    const parsed = input.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (parsed.length === 0) return;
    setTags((prev) => {
      const next = [...prev];
      for (const tag of parsed) if (!next.some((x) => x.toLowerCase() === tag.toLowerCase())) next.push(tag);
      return next;
    });
    setInput('');
  };

  const apply = async () => {
    // Replacing with nothing clears every tag; adding or removing nothing does nothing.
    if (mode !== 'replace' && tags.length === 0) return;
    setSaving(true);
    try {
      await onApply(mode, tags);
      onClose();
    } catch {
      // Reported by the caller; keep the dialog open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      icon="sell"
      headline={t('projectViewer.album.tagBatchTitle')}
      maxWidth={560}
      actions={
        <>
          <Button variant="text" disabled={saving} onClick={onClose}>
            {t('confirmModal.cancel')}
          </Button>
          <Button variant="filled" loading={saving} disabled={mode !== 'replace' && tags.length === 0} onClick={() => void apply()}>
            {t('projectViewer.album.tagBatchApply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {isAllScope ? t('projectViewer.album.tagBatchScopeAll', { count: targetCount }) : t('projectViewer.album.tagBatchScopeSelected', { count: targetCount })}
        </Text>
        <Segmented<AlbumBatchTagMode>
          fullWidth
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'add', label: t('projectViewer.album.tagBatchModeAdd'), icon: 'add' },
            { value: 'remove', label: t('projectViewer.album.tagBatchModeRemove'), icon: 'remove' },
            { value: 'replace', label: t('projectViewer.album.tagBatchModeReplace'), icon: 'swap_horiz' },
          ]}
        />
        <Text variant="body-small" className="text-on-surface-variant">
          {mode === 'add' ? t('projectViewer.album.tagBatchHintAdd') : mode === 'remove' ? t('projectViewer.album.tagBatchHintRemove') : t('projectViewer.album.tagBatchHintReplace')}
        </Text>
        <div className="flex items-start gap-2">
          <TextField
            variant="outlined"
            label={t('tagModal.placeholder')}
            value={input}
            onValueChange={setInput}
            className="flex-1"
            fullWidth
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFromInput();
              }
            }}
          />
          <Button variant="tonal" icon="add" onClick={addFromInput}>
            {t('tagModal.add')}
          </Button>
        </div>
        {tags.length === 0 ? (
          <Text variant="body-medium" className="v2-dashed-note">
            {mode === 'replace' ? t('projectViewer.album.tagBatchClearAll') : t('tagModal.noTags')}
          </Text>
        ) : (
          <ChipSet>
            {tags.map((tag) => (
              <InputChip key={tag} label={tag} icon="sell" onRemove={() => setTags((prev) => prev.filter((x) => x !== tag))} />
            ))}
          </ChipSet>
        )}
        {available.length > 0 && (
          <div className="flex flex-col gap-2">
            <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {t('projectViewer.album.tagSuggestions')}
            </Text>
            <ChipSet className="max-h-40 overflow-y-auto">
              {available.map((entry) => (
                <SuggestionChip key={entry.tag} label={`${entry.tag} · ${entry.count}`} onClick={() => setTags((prev) => [...prev, entry.tag])} />
              ))}
            </ChipSet>
          </div>
        )}
      </div>
    </Dialog>
  );
}
