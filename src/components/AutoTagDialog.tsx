import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, WandSparkles } from 'lucide-react';
import { fetchAutoTagSettings, fetchProviders } from '../api';
import type { AutoTagSettings } from '../types';

interface AutoTagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** How many items the run covers before untagged-only filtering. */
  itemCount: number;
  /** Start the run; rejects to keep the dialog open. */
  onStart: (options: { onlyUntagged: boolean }) => Promise<void>;
}

/** Confirms an auto-tagging run: which model will tag, how many items, and whether tagged ones are skipped. */
export function AutoTagDialog({ isOpen, onClose, itemCount, onStart }: AutoTagDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AutoTagSettings | null>(null);
  const [modelLabel, setModelLabel] = useState('');
  const [loadError, setLoadError] = useState('');
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const [next, providers] = await Promise.all([fetchAutoTagSettings(), fetchProviders()]);
        if (cancelled) return;
        const provider = providers.find((item) => item.id === next.providerId);
        const model = provider?.models.find((item) => item.id === next.modelConfigId);
        setSettings(next);
        setModelLabel(provider && model ? `${model.name} · ${provider.name}` : '');
      } catch (error: any) {
        if (!cancelled) setLoadError(error?.message || t('autoTag.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!starting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, starting, onClose]);

  if (!isOpen) return null;

  const isOff = !loading && !loadError && !modelLabel;
  const canStart = !loading && !loadError && !isOff && !starting && itemCount > 0;

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      await onStart({ onlyUntagged });
      onClose();
    } catch {
      // The caller reports the error; the dialog stays open to try again.
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={!starting ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-tag-dialog-title"
        className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.3)] dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-3rem))] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8 overflow-y-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className="p-3 sm:p-4 rounded-card flex-shrink-0 bg-violet-500/10 text-violet-500 border border-violet-500/20">
              <WandSparkles className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 id="auto-tag-dialog-title" className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
                {t('autoTag.dialogTitle', { count: itemCount })}
              </h3>

              {loading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('autoTag.loading')}
                </div>
              ) : loadError ? (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{loadError}</p>
              ) : isOff ? (
                <div className="mt-4 flex items-start gap-3 rounded-card border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p>{t('autoTag.off')}</p>
                    <Link to="/account?tab=preferences" className="mt-2 inline-block font-bold underline-offset-4 hover:underline">
                      {t('autoTag.openPreferences')}
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 sm:mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
                    {t('autoTag.dialogMessage', { limit: settings?.concurrencyLimit ?? 1 })}
                  </p>
                  <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-500">{t('autoTag.model')}</p>
                  <p className="mt-1 text-sm font-bold text-neutral-900 dark:text-white break-words">{modelLabel}</p>
                  <label className="mt-5 flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={onlyUntagged}
                      onChange={(e) => setOnlyUntagged(e.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-violet-600"
                    />
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">{t('autoTag.onlyUntagged')}</span>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 bg-neutral-50 dark:bg-black/20 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-4 border-t border-neutral-200/50 dark:border-white/5 shadow-inner">
          <button
            onClick={onClose}
            disabled={starting}
            className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('confirmModal.cancel')}
          </button>
          <button
            onClick={() => void handleStart()}
            disabled={!canStart}
            className="w-full sm:w-auto px-5 sm:px-8 py-3 rounded-xl sm:rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {starting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('autoTag.start')}
          </button>
        </div>
      </div>
    </div>
  );
}
