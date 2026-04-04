import React from 'react';
import { AlertCircle, X } from 'lucide-react';

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
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-neutral-900 border border-neutral-800/50 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <div className="flex items-start gap-6">
            <div className={`p-4 rounded-3xl flex-shrink-0 ${
              type === 'danger' 
                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
            }`}>
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-black text-white tracking-tight">
                {title}
              </h3>
              <p className="mt-3 text-base text-neutral-400 font-medium leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 bg-neutral-950/40 flex items-center justify-end gap-4 border-t border-neutral-800/50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
          >
            {cancelText}
          </button>
          
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] ${
              type === 'danger' 
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
