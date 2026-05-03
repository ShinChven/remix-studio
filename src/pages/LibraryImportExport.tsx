import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createLibraryItemsBatch, fetchLibrary } from '../api';
import { Library, LibraryItem } from '../types';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  Tag,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';

type ParsedPreviewItem = {
  title?: string;
  content: string;
  tags: string[];
  sourceLine: number;
};

type ParseIssue = {
  line: number;
  raw: string;
  reasonKey: 'missingListMarker' | 'emptyAfterMarker' | 'missingContentBeforeTags' | 'missingContentAfterTitle';
};

type ExportMode = 'tagged' | 'plain';

const TAG_SEGMENT_PATTERN = /\s+\|\s*tags\s*:\s*(.+)$/i;

function normalizeTags(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseTagsInput(value: string): string[] {
  return normalizeTags(value.split(','));
}

function parseImportText(importText: string, sharedTagsInput: string): {
  items: ParsedPreviewItem[];
  issues: ParseIssue[];
} {
  const items: ParsedPreviewItem[] = [];
  const issues: ParseIssue[] = [];
  const sharedTags = parseTagsInput(sharedTagsInput);

  importText.split('\n').forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) return;

    if (!trimmed.startsWith('- ')) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingListMarker',
      });
      return;
    }

    let itemText = trimmed.slice(2).trim();
    if (!itemText) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'emptyAfterMarker',
      });
      return;
    }

    let inlineTags: string[] = [];
    const tagsMatch = itemText.match(TAG_SEGMENT_PATTERN);
    if (tagsMatch) {
      inlineTags = parseTagsInput(tagsMatch[1]);
      itemText = itemText.replace(TAG_SEGMENT_PATTERN, '').trim();
    }

    if (!itemText) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingContentBeforeTags',
      });
      return;
    }

    const colonIndex = itemText.indexOf(':');
    const hasTitle = colonIndex > 0;
    const title = hasTitle ? itemText.slice(0, colonIndex).trim() : undefined;
    const content = hasTitle ? itemText.slice(colonIndex + 1).trim() : itemText;

    if (!content) {
      issues.push({
        line: index + 1,
        raw: line,
        reasonKey: 'missingContentAfterTitle',
      });
      return;
    }

    items.push({
      title: title || undefined,
      content,
      tags: normalizeTags([...sharedTags, ...inlineTags]),
      sourceLine: index + 1,
    });
  });

  return { items, issues };
}

function formatExportText(items: LibraryItem[], exportMode: ExportMode): string {
  return items
    .map((item) => {
      const baseLine = item.title
        ? `- ${item.title}: ${item.content}`
        : `- ${item.content}`;

      if (exportMode === 'plain' || !item.tags || item.tags.length === 0) {
        return baseLine;
      }

      return `${baseLine} | tags: ${normalizeTags(item.tags).join(', ')}`;
    })
    .join('\n');
}

export function LibraryImportExport() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [importText, setImportText] = useState('');
  const [sharedTagsInput, setSharedTagsInput] = useState('');
  const [previewItems, setPreviewItems] = useState<ParsedPreviewItem[]>([]);
  const [parseIssues, setParseIssues] = useState<ParseIssue[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('tagged');

  useEffect(() => {
    if (!id) return;

    fetchLibrary(id)
      .then((lib) => {
        if (lib.type !== 'text') {
          navigate(`/library/${id}`);
          return;
        }

        setLibrary(lib);
      })
      .catch(() => navigate('/libraries'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    const parsed = parseImportText(importText, sharedTagsInput);
    setPreviewItems(parsed.items);
    setParseIssues(parsed.issues);
  }, [importText, sharedTagsInput]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    let combinedText = importText;

    for (const file of files) {
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (loadEvent) => resolve((loadEvent.target?.result as string) || '');
        reader.readAsText(file);
      });

      combinedText = combinedText ? `${combinedText}\n${text}` : text;
    }

    setImportText(combinedText);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    let combinedText = importText;

    for (const file of files) {
      if (file.type !== 'text/plain' && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
        continue;
      }

      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (loadEvent) => resolve((loadEvent.target?.result as string) || '');
        reader.readAsText(file);
      });

      combinedText = combinedText ? `${combinedText}\n${text}` : text;
    }

    setImportText(combinedText);
  };

  const handleImport = async () => {
    if (!id || !library || previewItems.length === 0) return;

    setIsImporting(true);

    try {
      const itemsToCreate: LibraryItem[] = previewItems.map((item) => ({
        id: crypto.randomUUID(),
        content: item.content,
        title: item.title,
        tags: item.tags.length > 0 ? item.tags : undefined,
      }));

      await createLibraryItemsBatch(id, itemsToCreate);
      navigate(`/library/${id}`);
    } catch (error: any) {
      console.error('Failed to import items:', error);
      toast.error(error?.message || t('libraryImportExport.toasts.importFailed'));
    } finally {
      setIsImporting(false);
    }
  };

  const currentExportText = library ? formatExportText(library.items, exportMode) : '';
  const previewTagCount = normalizeTags(previewItems.flatMap((item) => item.tags)).length;
  const libraryTagCount = library ? normalizeTags(library.items.flatMap((item) => item.tags || [])).length : 0;

  const handleCopyOutput = async () => {
    if (!currentExportText) return;

    try {
      await navigator.clipboard.writeText(currentExportText);
      toast.success(t('libraryImportExport.toasts.outputCopied'));
    } catch (error: any) {
      toast.error(error?.message || t('libraryImportExport.toasts.copyFailed'));
    }
  };

  const handleDownloadOutput = () => {
    if (!library || !currentExportText) return;

    const blob = new Blob([currentExportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${library.name.replace(/\s+/g, '_')}_${exportMode}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!library) return null;

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.10),_transparent_28%),linear-gradient(180deg,_#09090b_0%,_#050505_100%)] custom-scrollbar">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-4 md:px-8 md:py-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate(`/library/${id}`)}
              className="mt-1 rounded-card border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/70 dark:bg-neutral-950/70 p-3 text-neutral-500 dark:text-neutral-500 transition-all hover:border-neutral-700 hover:text-white hover:bg-neutral-900/80"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">
                <FileText className="h-3.5 w-3.5" />
                {t('libraryImportExport.badge')}
              </div>

              <div>
                <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white md:text-5xl">
                  {t('libraryImportExport.title')}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {t('libraryImportExport.description')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.stats.library')}</div>
              <div className="mt-2 truncate text-sm font-bold text-neutral-900 dark:text-white">{library.name}</div>
            </div>
            <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.stats.currentItems')}</div>
              <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{library.items.length}</div>
            </div>
            <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.stats.currentTags')}</div>
              <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">{libraryTagCount}</div>
            </div>
            <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.stats.readyToImport')}</div>
              <div className="mt-2 text-2xl font-black text-blue-400">{previewItems.length}</div>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="flex min-h-0 flex-col rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 border-b border-neutral-200/70 dark:border-neutral-800/70 pb-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{t('libraryImportExport.importSource.label')}</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-neutral-900 dark:text-white">{t('libraryImportExport.importSource.title')}</h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('libraryImportExport.importSource.description')}
                    <span className="mt-1 block font-mono text-xs text-neutral-700 dark:text-neutral-300">
                      - Title: Content | tags: cinematic, portrait
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setImportText('')}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-neutral-600 dark:text-neutral-400 transition-all hover:border-red-500/30 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('libraryImportExport.importSource.clear')}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-blue-300 transition-all hover:bg-blue-500 hover:text-white"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {t('libraryImportExport.importSource.uploadText')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".txt,.md"
                    multiple
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <label className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                    <Tag className="h-3.5 w-3.5 text-blue-400" />
                    {t('libraryImportExport.importSource.sharedTags')}
                  </div>
                  <input
                    type="text"
                    value={sharedTagsInput}
                    onChange={(event) => setSharedTagsInput(event.target.value)}
                    placeholder={t('libraryImportExport.importSource.sharedTagsPlaceholder')}
                    className="mt-3 w-full border-none bg-transparent p-0 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-0"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 lg:w-[240px]">
                  <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.importSource.detectedTags')}</div>
                    <div className="mt-2 text-xl font-black text-neutral-900 dark:text-white">{previewTagCount}</div>
                  </div>
                  <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.importSource.skippedLines')}</div>
                    <div className={`mt-2 text-xl font-black ${parseIssues.length > 0 ? 'text-amber-300' : 'text-neutral-900 dark:text-white'}`}>
                      {parseIssues.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`relative mt-5 flex min-h-[320px] flex-1 flex-col rounded-card border-2 border-dashed p-4 transition-all md:p-5 ${
                isDragOver
                  ? 'border-blue-500 bg-blue-500/8 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                  : 'border-neutral-200/80 dark:border-neutral-800/80 bg-white/35 dark:bg-neutral-900/35 hover:border-neutral-700/90'
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={t('libraryImportExport.importSource.textareaPlaceholder')}
                className="min-h-[320px] flex-1 resize-none border-none bg-transparent p-2 font-mono text-sm leading-7 text-neutral-200 placeholder:text-neutral-700 focus:outline-none focus:ring-0 custom-scrollbar"
              />

              {!importText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto flex max-w-sm items-center justify-center gap-3 rounded-card border border-neutral-200/70 dark:border-neutral-800/70 bg-neutral-50/80 dark:bg-neutral-950/80 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-500 backdrop-blur-sm">
                  <UploadCloud className="h-4 w-4 text-neutral-600" />
                  {t('libraryImportExport.importSource.dropHint')}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
              <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  <AlertCircle className="h-3.5 w-3.5 text-blue-400" />
                  {t('libraryImportExport.formatGuide.title')}
                </div>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  <p>{t('libraryImportExport.formatGuide.rule1')}</p>
                  <p>{t('libraryImportExport.formatGuide.rule2')}</p>
                  <p>{t('libraryImportExport.formatGuide.rule3')}</p>
                </div>
              </div>

              <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  {t('libraryImportExport.parseStatus.title')}
                </div>
                {parseIssues.length === 0 ? (
                  <p className="mt-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {t('libraryImportExport.parseStatus.valid')}
                  </p>
                ) : (
                  <div className="mt-4 max-h-36 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                    {parseIssues.slice(0, 6).map((issue) => (
                      <div key={`${issue.line}-${issue.reasonKey}`} className="rounded-card border border-amber-500/20 bg-amber-500/6 px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                          {t('libraryImportExport.parseStatus.line', { line: issue.line })}
                        </div>
                        <div className="mt-1 text-xs text-neutral-200">{t(`libraryImportExport.parseIssues.${issue.reasonKey}`)}</div>
                      </div>
                    ))}
                    {parseIssues.length > 6 && (
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-500">
                        {t('libraryImportExport.parseStatus.moreSkipped', { count: parseIssues.length - 6 })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleImport}
              disabled={isImporting || previewItems.length === 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-card bg-blue-600 px-5 py-4 text-xs font-black uppercase tracking-[0.22em] text-neutral-900 dark:text-white transition-all hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {isImporting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {t('libraryImportExport.importAction', { count: previewItems.length })}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </section>

          <section className="flex min-h-0 flex-col gap-6 rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-5 shadow-sm md:p-6">
            <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{t('libraryImportExport.preview.label')}</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-neutral-900 dark:text-white">{t('libraryImportExport.preview.title')}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('libraryImportExport.preview.description')}
                  </p>
                </div>

                <div className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl px-4 py-3 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('libraryImportExport.preview.items')}</div>
                  <div className="mt-1 text-2xl font-black text-neutral-900 dark:text-white">{previewItems.length}</div>
                </div>
              </div>

              <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {previewItems.length > 0 ? (
                  previewItems.map((item, index) => (
                    <article
                      key={`${item.sourceLine}-${index}`}
                      className="rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                            {t('libraryImportExport.preview.sourceLine', { line: item.sourceLine })}
                          </div>
                          {item.title && (
                            <h3 className="mt-2 text-sm font-black uppercase tracking-[0.16em] text-blue-300">
                              {item.title}
                            </h3>
                          )}
                        </div>
                        {item.tags.length > 0 && (
                          <div className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
                            {t('libraryImportExport.preview.tagsCount', { count: item.tags.length })}
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{item.content}</p>

                      {item.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span
                              key={`${item.sourceLine}-${tag}`}
                              className="rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-700 dark:text-neutral-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="flex min-h-[240px] flex-col items-center justify-center rounded-card border-2 border-dashed border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl px-6 text-center shadow-sm">
                    <FileText className="h-10 w-10 text-neutral-800" />
                    <div className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-neutral-600">
                      {t('libraryImportExport.preview.emptyTitle')}
                    </div>
                    <p className="mt-3 max-w-sm text-sm leading-relaxed text-neutral-500 dark:text-neutral-500">
                      {t('libraryImportExport.preview.emptyDescription')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{t('libraryImportExport.output.label')}</div>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-neutral-900 dark:text-white">{t('libraryImportExport.output.title')}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t('libraryImportExport.output.description')}
                  </p>
                </div>

                <div className="inline-flex rounded-card border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl p-1 shadow-sm">
                  <button
                    onClick={() => setExportMode('tagged')}
                    className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                      exportMode === 'tagged'
                        ? 'bg-blue-600 text-neutral-900 dark:text-white'
                        : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {t('libraryImportExport.output.tagged')}
                  </button>
                  <button
                    onClick={() => setExportMode('plain')}
                    className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${
                      exportMode === 'plain'
                        ? 'bg-blue-600 text-neutral-900 dark:text-white'
                        : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {t('libraryImportExport.output.plain')}
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCopyOutput}
                  disabled={!currentExportText}
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/90 dark:bg-neutral-950/90 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-neutral-700 dark:text-neutral-300 transition-all hover:border-neutral-700 hover:text-white disabled:opacity-35"
                >
                  <Copy className="h-4 w-4" />
                  {t('libraryImportExport.output.copy')}
                </button>
                <button
                  onClick={handleDownloadOutput}
                  disabled={!currentExportText}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-blue-300 transition-all hover:bg-blue-500 hover:text-white disabled:opacity-35"
                >
                  <Download className="h-4 w-4" />
                  {t('libraryImportExport.output.download')}
                </button>
              </div>

              <textarea
                readOnly
                value={currentExportText}
                className="mt-5 min-h-[320px] flex-1 resize-none rounded-card border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/85 dark:bg-neutral-950/85 p-4 font-mono text-sm leading-7 text-neutral-200 focus:outline-none focus:ring-0 custom-scrollbar"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
