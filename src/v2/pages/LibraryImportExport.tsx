import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { createLibraryItemsBatch, fetchLibrary } from '../../api';
import { AssistChip, Button, ChipSet, Icon, Text, TextField, useSnackbar } from '../../m3';
import type { Library, LibraryItem } from '../../types';
import {
  formatExportJson,
  formatExportText,
  normalizeTags,
  parseImportText,
  parseJsonImportText,
  type ExportFormat,
  type ExportMode,
  type ImportFormat,
} from '../lib/libraryTextFormat';
import { LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatTile, StatusPill } from '../ui/Stat';
import { Segmented } from '../ui/Toolbar';

const readFile = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.readAsText(file);
  });

const isTextFile = (file: File) => file.type === 'text/plain' || file.type === 'application/json' || /\.(txt|md|json)$/.test(file.name);

/** Bulk import of text items, with a live parse preview, and export of the whole library. */
export function LibraryImportExport() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState('');
  const [sharedTags, setSharedTags] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('tagged');
  const [importFormat, setImportFormat] = useState<ImportFormat>('text');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('text');

  useEffect(() => {
    if (!id) return;
    fetchLibrary(id)
      .then((lib) => {
        if (lib.type !== 'text') navigate(`/library/${id}`);
        else setLibrary(lib);
      })
      .catch(() => navigate('/libraries'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const { items: preview, issues } = useMemo(
    () => (importFormat === 'json' ? parseJsonImportText(importText, sharedTags) : parseImportText(importText, sharedTags)),
    [importText, sharedTags, importFormat],
  );

  const appendFiles = async (files: File[]) => {
    let combined = importText;
    for (const file of files) {
      const text = await readFile(file);
      combined = combined ? `${combined}\n${text}` : text;
    }
    setImportText(combined);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    await appendFiles(Array.from(e.dataTransfer.files).filter(isTextFile));
  };

  const doImport = async () => {
    if (!id || !library || preview.length === 0) return;
    setImporting(true);
    try {
      const items: LibraryItem[] = preview.map((item) => ({ id: crypto.randomUUID(), content: item.content, title: item.title, tags: item.tags.length > 0 ? item.tags : undefined }));
      await createLibraryItemsBatch(id, items);
      navigate(`/library/${id}`);
    } catch (error) {
      console.error('Failed to import items:', error);
      snackbar.show((error as Error)?.message || t('libraryImportExport.toasts.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const output = library ? (exportFormat === 'json' ? formatExportJson(library.items) : formatExportText(library.items, exportMode)) : '';
  const previewTagCount = normalizeTags(preview.flatMap((item) => item.tags)).length;
  const libraryTagCount = library ? normalizeTags(library.items.flatMap((item) => item.tags || [])).length : 0;

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      snackbar.show(t('libraryImportExport.toasts.outputCopied'));
    } catch (error) {
      snackbar.show((error as Error)?.message || t('libraryImportExport.toasts.copyFailed'));
    }
  };

  const download = () => {
    if (!library || !output) return;
    const json = exportFormat === 'json';
    const url = URL.createObjectURL(new Blob([output], { type: json ? 'application/json' : 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${library.name.replace(/\s+/g, '_')}_${json ? 'json' : exportMode}.${json ? 'json' : 'md'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingState minHeight={400} />;
  if (!library) return null;

  return (
    <Page density="compact">
      <PageHeader
        backLink={{ to: `/library/${id}`, label: library.name }}
        title={t('libraryImportExport.title')}
        description={t('libraryImportExport.description')}
      >
        <div className="v2-stat-grid">
          <StatTile icon="description" label={t('libraryImportExport.stats.library')} value={<span className="m3-typescale-emphasized-title-medium">{library.name}</span>} />
          <StatTile label={t('libraryImportExport.stats.currentItems')} value={library.items.length} />
          <StatTile label={t('libraryImportExport.stats.currentTags')} value={libraryTagCount} />
          <StatTile label={t('libraryImportExport.stats.readyToImport')} value={preview.length} tone="primary" />
        </div>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section
          variant="card"
          icon={<Icon name="upload" />}
          title={t('libraryImportExport.importSource.title')}
          description={
            <>
              {importFormat === 'json' ? t('libraryImportExport.importSource.descriptionJson') : t('libraryImportExport.importSource.description')}{' '}
              <code className="font-mono">{importFormat === 'json' ? '[{ "title": "Subject", "content": "Line one\\nLine two: still content", "tags": ["cinematic"] }]' : '- Title: Content | tags: cinematic, portrait'}</code>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<ImportFormat>
              value={importFormat}
              onChange={setImportFormat}
              options={[
                { value: 'text', label: t('libraryImportExport.importSource.formatText') },
                { value: 'json', label: t('libraryImportExport.importSource.formatJson') },
              ]}
            />
            <Button variant="text" size="xs" icon="delete" onClick={() => setImportText('')}>
              {t('libraryImportExport.importSource.clear')}
            </Button>
            <Button variant="tonal" size="xs" icon="upload_file" onClick={() => fileRef.current?.click()}>
              {t('libraryImportExport.importSource.uploadText')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.json"
              multiple
              hidden
              onChange={(e) => {
                void appendFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <TextField variant="outlined" label={t('libraryImportExport.importSource.sharedTags')} leadingIcon="sell" value={sharedTags} onValueChange={setSharedTags} placeholder={t('libraryImportExport.importSource.sharedTagsPlaceholder')} fullWidth />
            <div className="flex gap-2">
              <StatusPill tone="secondary">
                {t('libraryImportExport.importSource.detectedTags')}: {previewTagCount}
              </StatusPill>
              <StatusPill tone={issues.length > 0 ? 'warning' : 'neutral'}>
                {t('libraryImportExport.importSource.skippedLines')}: {issues.length}
              </StatusPill>
            </div>
          </div>
          <div
            className="v2-text-drop"
            data-dragging={dragOver ? '' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => void onDrop(e)}
          >
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={importFormat === 'json' ? t('libraryImportExport.importSource.jsonTextareaPlaceholder') : t('libraryImportExport.importSource.textareaPlaceholder')}
              aria-label={t('libraryImportExport.importSource.title')}
            />
            {!importText && (
              <span className="v2-text-drop__hint">
                <Icon name="cloud_upload" />
                {t('libraryImportExport.importSource.dropHint')}
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="v2-notice">
              <Icon name="info" />
              <div className="flex flex-col gap-1">
                <Text variant="label-large" emphasized>
                  {t('libraryImportExport.formatGuide.title')}
                </Text>
                {(importFormat === 'json' ? ['jsonRule1', 'jsonRule2', 'jsonRule3'] : ['rule1', 'rule2', 'rule3']).map((rule) => (
                  <Text key={rule} variant="body-small">
                    {t(`libraryImportExport.formatGuide.${rule}`)}
                  </Text>
                ))}
              </div>
            </div>
            <div className="v2-notice" data-tone={issues.length === 0 ? 'success' : 'warning'}>
              <Icon name={issues.length === 0 ? 'check' : 'warning'} />
              <div className="flex min-w-0 flex-col gap-1">
                <Text variant="label-large" emphasized>
                  {t('libraryImportExport.parseStatus.title')}
                </Text>
                {issues.length === 0 ? (
                  <Text variant="body-small">{t('libraryImportExport.parseStatus.valid')}</Text>
                ) : (
                  <>
                    {issues.slice(0, 6).map((issue) => (
                      <Text key={`${issue.line}-${issue.reasonKey}`} variant="body-small">
                        <strong>{t('libraryImportExport.parseStatus.line', { line: issue.line })}</strong> {t(`libraryImportExport.parseIssues.${issue.reasonKey}`)}
                      </Text>
                    ))}
                    {issues.length > 6 && <Text variant="body-small">{t('libraryImportExport.parseStatus.moreSkipped', { count: issues.length - 6 })}</Text>}
                  </>
                )}
              </div>
            </div>
          </div>
          <Button variant="filled" size="md" trailingIcon="arrow_forward" loading={importing} disabled={preview.length === 0} onClick={() => void doImport()} fullWidth emphasized>
            {t('libraryImportExport.importAction', { count: preview.length })}
          </Button>
        </Section>

        <div className="flex flex-col gap-5">
          <Section variant="card" icon={<Icon name="preview" />} title={t('libraryImportExport.preview.title')} description={t('libraryImportExport.preview.description')} actions={<StatusPill tone="primary">{`${t('libraryImportExport.preview.items')}: ${preview.length}`}</StatusPill>}>
            <div className="v2-scroll-list">
              {preview.length > 0 ? (
                preview.map((item, index) => (
                  <article key={`${item.sourceLine}-${index}`} className="v2-preview-item">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                          {t('libraryImportExport.preview.sourceLine', { line: item.sourceLine })}
                        </Text>
                        {item.title && (
                          <Text variant="title-small" emphasized>
                            {item.title}
                          </Text>
                        )}
                      </div>
                      {item.tags.length > 0 && <StatusPill tone="tertiary">{t('libraryImportExport.preview.tagsCount', { count: item.tags.length })}</StatusPill>}
                    </div>
                    <Text variant="body-medium" className="whitespace-pre-wrap">
                      {item.content}
                    </Text>
                    {item.tags.length > 0 && (
                      <ChipSet>
                        {item.tags.map((tag) => (
                          <AssistChip key={`${item.sourceLine}-${tag}`} label={tag} />
                        ))}
                      </ChipSet>
                    )}
                  </article>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Icon name="description" size={32} className="text-on-surface-variant" />
                  <Text variant="title-small">{t('libraryImportExport.preview.emptyTitle')}</Text>
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t('libraryImportExport.preview.emptyDescription')}
                  </Text>
                </div>
              )}
            </div>
          </Section>

          <Section
            variant="card"
            icon={<Icon name="download" />}
            title={t('libraryImportExport.output.title')}
            description={t('libraryImportExport.output.description')}
            actions={
              <>
                <Button variant="text" size="xs" icon="content_copy" disabled={!output} onClick={() => void copy()}>
                  {t('libraryImportExport.output.copy')}
                </Button>
                <Button variant="tonal" size="xs" icon="download" disabled={!output} onClick={download}>
                  {t('libraryImportExport.output.download', { ext: exportFormat === 'json' ? 'json' : 'md' })}
                </Button>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              <Segmented<ExportFormat>
                value={exportFormat}
                onChange={setExportFormat}
                options={[
                  { value: 'text', label: t('libraryImportExport.output.formatText') },
                  { value: 'json', label: t('libraryImportExport.output.formatJson') },
                ]}
              />
              {exportFormat === 'text' && (
                <Segmented<ExportMode>
                  value={exportMode}
                  onChange={setExportMode}
                  options={[
                    { value: 'tagged', label: t('libraryImportExport.output.tagged') },
                    { value: 'plain', label: t('libraryImportExport.output.plain') },
                  ]}
                />
              )}
            </div>
            <textarea className="v2-code-output" value={output} readOnly aria-label={t('libraryImportExport.output.title')} />
          </Section>
        </div>
      </div>
    </Page>
  );
}
