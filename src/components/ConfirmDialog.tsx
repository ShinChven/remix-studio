import React, { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  onConfirm,
  onCancel,
  variant = 'primary',
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isBusy = confirmDisabled || isConfirming;

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } catch {
      // The caller owns the user-facing error. Keeping this promise contained
      // prevents an unhandled click-handler rejection while the dialog stays open.
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" aria-busy={isBusy}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={isBusy ? undefined : onCancel}
      />
      
      {/* Dialog */}
      <div 
        className="relative w-full max-w-md overflow-hidden rounded-card border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900 animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            variant === 'danger' ? "bg-red-500/10 text-red-600" : "bg-indigo-500/10 text-indigo-600"
          )}>
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{title}</h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          </div>
          <button 
            onClick={onCancel}
            disabled={isBusy}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isBusy}
            className="rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={isBusy}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
              variant === 'danger' ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
            )}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
