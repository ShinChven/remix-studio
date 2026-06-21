import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info';
  /** Extra keys (besides Escape) that cancel the dialog, e.g. the shortcut that opened it. */
  dismissKeys?: string[];
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type = 'info',
  dismissKeys
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  // Esc (and any caller-supplied dismissKeys, e.g. the shortcut that opened this)
  // dismisses the modal. Capture-phase + stopPropagation so the key doesn't also
  // reach handlers underneath — e.g. the lightbox's own 'd' delete shortcut.
  const dismissKeysSig = dismissKeys?.join(',') ?? '';
  useEffect(() => {
    if (!isOpen) return;
    const extra = dismissKeysSig ? dismissKeysSig.split(',') : [];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && !extra.includes(e.key)) return;
      e.stopPropagation();
      if (!isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isLoading, onClose, dismissKeysSig]);

  // While in native fullscreen the browser swallows Esc to exit fullscreen rather
  // than firing a keydown we can catch. If we opened over a fullscreen view, treat
  // leaving fullscreen as cancelling the modal so a single Esc still dismisses it.
  useEffect(() => {
    if (!isOpen || document.fullscreenElement == null) return;
    const handleFsChange = () => {
      if (document.fullscreenElement == null && !isLoading) onClose();
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const resolvedConfirmText = confirmText ?? t('confirmModal.confirm');
  const resolvedCancelText = cancelText ?? t('confirmModal.cancel');

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={!isLoading ? onClose : undefined}
    >
      <div 
        className="bg-white dark:bg-neutral-900/90 border border-neutral-200/50 dark:border-white/5 backdrop-blur-2xl rounded-card sm:rounded-card shadow-[0_50px_100px_rgba(0,0,0,0.3)] dark:shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[min(720px,calc(100dvh-3rem))] overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-8 overflow-y-auto">
          <div className="flex items-start gap-4 sm:gap-6">
            <div className={`p-3 sm:p-4 rounded-card sm:rounded-card flex-shrink-0 ${
              type === 'danger' 
                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
            }`}>
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
                {title}
              </h3>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed break-words">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 sm:px-8 sm:py-6 bg-neutral-50 dark:bg-black/20 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-4 border-t border-neutral-200/50 dark:border-white/5 shadow-inner">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resolvedCancelText}
          </button>
          
          <button
            onClick={async () => {
              try {
                setIsLoading(true);
                await onConfirm();
                onClose();
              } catch (err) {
                // handle error internally if needed, or let the caller handle it
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className={`w-full sm:w-auto px-5 sm:px-8 py-3 rounded-xl sm:rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl flex items-center justify-center gap-2 ${
              isLoading ? 'opacity-70 cursor-not-allowed scale-[0.98]' : 'active:scale-[0.98]'
            } ${
              type === 'danger' 
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
            }`}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
