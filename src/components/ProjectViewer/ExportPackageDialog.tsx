import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Image, Package, Sparkles, X } from 'lucide-react';
import type { AlbumExportVersion } from '../../api';

interface ExportPackageDialogProps {
  isOpen: boolean;
  defaultValue: string;
  itemCount: number;
  onClose: () => void;
  onSubmit: (packageName: string, exportVersion: AlbumExportVersion) => Promise<void> | void;
}

export function ExportPackageDialog({
  isOpen,
  defaultValue,
  itemCount,
  onClose,
  onSubmit,
}: ExportPackageDialogProps) {
  const { t } = useTranslation();
  const [packageName, setPackageName] = useState(defaultValue);
  const [exportVersion, setExportVersion] = useState<AlbumExportVersion>('raw');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPackageName(defaultValue);
    setExportVersion('raw');
    setIsSubmitting(false);
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!packageName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(packageName, exportVersion);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

      <div
        className="relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-2rem))] overflow-hidden rounded-[24px] sm:rounded-[32px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-[0_50px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-950/30 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl sm:rounded-2xl border border-blue-500/20 bg-blue-500/10 p-2.5 sm:p-3 text-blue-400">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-neutral-900 dark:text-white">{t('projectViewer.exportDialog.title')}</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
                {t('projectViewer.exportDialog.description')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-500 dark:text-neutral-500 transition-all hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 sm:space-y-5 p-4 sm:p-6 overflow-y-auto">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/60 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-500">
              {t('projectViewer.exportDialog.itemCount', { count: itemCount })}
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-500">
              {t('projectViewer.exportDialog.packageName')}
            </span>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-white outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
              placeholder={t('projectViewer.exportDialog.placeholder')}
              autoFocus
            />
          </label>

          <div>
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-500">
              {t('projectViewer.exportDialog.version')}
            </span>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-1">
              {[
                { value: 'raw' as const, label: t('projectViewer.exportDialog.raw'), icon: Image },
                { value: 'optimized' as const, label: t('projectViewer.exportDialog.optimized'), icon: Sparkles },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setExportVersion(value)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    exportVersion === value
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-neutral-500 hover:bg-white dark:hover:bg-neutral-900 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                  aria-pressed={exportVersion === value}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 p-4 sm:p-6">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 sm:py-2.5 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 transition-all hover:text-white border border-neutral-200/80 dark:border-neutral-800/80 sm:border-transparent rounded-xl"
            disabled={isSubmitting}
          >
            {t('projectViewer.common.cancel')}
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!packageName.trim() || isSubmitting}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-blue-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-900 dark:text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isSubmitting ? t('projectViewer.exportDialog.queueing') : t('projectViewer.exportDialog.startExport')}
          </button>
        </div>
      </div>
    </div>
  );
}
