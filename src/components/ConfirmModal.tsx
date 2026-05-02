import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  type = 'info'
}: ConfirmModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const resolvedConfirmText = confirmText ?? t('confirmModal.confirm');
  const resolvedCancelText = cancelText ?? t('confirmModal.cancel');

  return (
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
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
            className="w-full sm:w-auto px-4 sm:px-6 py-3 sm:py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-all border border-transparent active:scale-95"
          >
            {resolvedCancelText}
          </button>
          
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`w-full sm:w-auto px-5 sm:px-8 py-3 rounded-xl sm:rounded-card text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] ${
              type === 'danger' 
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
            }`}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
