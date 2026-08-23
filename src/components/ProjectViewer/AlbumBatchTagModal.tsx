import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Tag as TagIcon, X } from 'lucide-react';
import type { AlbumTagCount } from '../../types';

export type AlbumBatchTagMode = 'add' | 'remove' | 'replace';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** How many album items the batch will touch. */
  targetCount: number;
  /** True when the batch applies to everything the filters select, not a selection. */
  isAllScope: boolean;
  /** Tags already used in this album, offered as one-click suggestions. */
  suggestions: AlbumTagCount[];
  onApply: (mode: AlbumBatchTagMode, tags: string[]) => Promise<void>;
}

/**
 * Tag many album items at once. Unlike the single-item tag editor this is not a
 * "here is the final list" dialog — the same set of tags means something
 * different per mode, since the items being changed do not share a tag list.
 */
export function AlbumBatchTagModal({ isOpen, onClose, targetCount, isAllScope, suggestions, onApply }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AlbumBatchTagMode>('add');
  const [tags, setTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('add');
    setTags([]);
    setInputValue('');
    setIsSaving(false);
  }, [isOpen]);

  // In remove mode only tags the album actually uses can be taken away, so the
  // suggestion list doubles as the full set of valid choices.
  const availableSuggestions = useMemo(
    () => suggestions.filter((entry) => !tags.some((tag) => tag.toLowerCase() === entry.tag.toLowerCase())),
    [suggestions, tags],
  );

  if (!isOpen) return null;

  const addFromInput = () => {
    const parsed = inputValue.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (parsed.length === 0) return;
    setTags((prev) => {
      const next = [...prev];
      for (const tag of parsed) {
        if (!next.some((existing) => existing.toLowerCase() === tag.toLowerCase())) next.push(tag);
      }
      return next;
    });
    setInputValue('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((existing) => existing !== tag));

  const handleApply = async () => {
    // Replace with an empty list is meaningful — it clears every tag — but add
    // and remove with nothing to apply are not.
    if (mode !== 'replace' && tags.length === 0) return;
    setIsSaving(true);
    try {
      await onApply(mode, tags);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const modes: { value: AlbumBatchTagMode; label: string }[] = [
    { value: 'add', label: t('projectViewer.album.tagBatchModeAdd') },
    { value: 'remove', label: t('projectViewer.album.tagBatchModeRemove') },
    { value: 'replace', label: t('projectViewer.album.tagBatchModeReplace') },
  ];

  const applyDisabled = isSaving || (mode !== 'replace' && tags.length === 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] bg-white dark:bg-neutral-900/40 dark:backdrop-blur-3xl border border-neutral-200 dark:border-white/5 rounded-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-4 sm:p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <TagIcon className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{t('projectViewer.album.tagBatchTitle')}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">
                {isAllScope
                  ? t('projectViewer.album.tagBatchScopeAll', { count: targetCount })
                  : t('projectViewer.album.tagBatchScopeSelected', { count: targetCount })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-xl transition-all"
            aria-label={t('confirmModal.cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-3 gap-1 p-1 mb-4 bg-neutral-100 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {modes.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setMode(entry.value)}
                className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === entry.value
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="mb-4 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {mode === 'add'
              ? t('projectViewer.album.tagBatchHintAdd')
              : mode === 'remove'
                ? t('projectViewer.album.tagBatchHintRemove')
                : t('projectViewer.album.tagBatchHintReplace')}
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addFromInput();
              }}
              placeholder={t('tagModal.placeholder')}
              className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              autoFocus
            />
            <button
              onClick={addFromInput}
              className="px-4 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
            >
              {t('tagModal.add')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 min-h-[72px] content-start">
            {tags.length === 0 && (
              <div className="w-full text-center py-6 text-neutral-500 dark:text-neutral-600 text-xs font-bold uppercase tracking-widest italic border border-dashed border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-neutral-900/40 rounded-xl">
                {mode === 'replace' ? t('projectViewer.album.tagBatchClearAll') : t('tagModal.noTags')}
              </div>
            )}
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold tracking-wider">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors" aria-label={t('projectViewer.album.tagRemove', { tag })}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {availableSuggestions.length > 0 && (
            <div className="mt-5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500 mb-2">
                {t('projectViewer.album.tagSuggestions')}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {availableSuggestions.map((entry) => (
                  <button
                    key={entry.tag}
                    type="button"
                    onClick={() => setTags((prev) => [...prev, entry.tag])}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-[11px] font-bold text-neutral-600 dark:text-neutral-400 hover:border-blue-500/40 hover:text-blue-500 transition-colors"
                  >
                    {entry.tag}
                    <span className="text-[9px] font-black text-neutral-400 dark:text-neutral-600">{entry.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            {t('confirmModal.cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={applyDisabled}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
            {t('projectViewer.album.tagBatchApply')}
          </button>
        </div>
      </div>
    </div>
  );
}
