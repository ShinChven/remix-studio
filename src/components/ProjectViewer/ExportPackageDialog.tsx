import React, { useEffect, useState } from 'react';
import { Download, Package, X } from 'lucide-react';

interface ExportPackageDialogProps {
  isOpen: boolean;
  defaultValue: string;
  itemCount: number;
  onClose: () => void;
  onSubmit: (packageName: string) => Promise<void> | void;
}

export function ExportPackageDialog({
  isOpen,
  defaultValue,
  itemCount,
  onClose,
  onSubmit,
}: ExportPackageDialogProps) {
  const [packageName, setPackageName] = useState(defaultValue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPackageName(defaultValue);
    setIsSubmitting(false);
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!packageName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(packageName);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-900 shadow-[0_50px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/30 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white">Export Package</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Set the ZIP filename before queuing this export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-500 transition-all hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500">
              {itemCount} item{itemCount === 1 ? '' : 's'} in this package
            </p>
          </div>

          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500">
              Package Name
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
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
              placeholder="album_export.zip"
              autoFocus
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-800 bg-neutral-950/40 p-6">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-neutral-400 transition-all hover:text-white"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!packageName.trim() || isSubmitting}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isSubmitting ? 'Queueing...' : 'Start Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
