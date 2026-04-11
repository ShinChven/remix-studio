import { useEffect, useState } from 'react';
import { Copy, Loader2, X } from 'lucide-react';

interface DuplicateLibraryDialogProps {
  isOpen: boolean;
  currentName: string;
  onClose: () => void;
  onConfirm: (name: string) => Promise<void> | void;
}

export function DuplicateLibraryDialog({
  isOpen,
  currentName,
  onClose,
  onConfirm,
}: DuplicateLibraryDialogProps) {
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(currentName);
    setSubmitting(false);
  }, [currentName, isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    setSubmitting(true);
    try {
      await onConfirm(trimmedName);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-neutral-900 border border-neutral-800/50 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-5 min-w-0">
              <div className="p-4 rounded-3xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">
                <Copy className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <h3 className="text-2xl font-black text-white tracking-tight">Duplicate Library</h3>
                <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
                  This will create a full copy of the library and check your storage quota before any files are duplicated.
                </p>
              </div>
            </div>
            <button
              onClick={() => !submitting && onClose()}
              className="p-2 rounded-xl text-neutral-500 hover:text-white hover:bg-neutral-800/70 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-8">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">New Library Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
              autoFocus
              className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Library name"
            />
          </div>
        </div>

        <div className="px-8 py-6 bg-neutral-950/40 flex items-center justify-end gap-4 border-t border-neutral-800/50">
          <button
            onClick={() => !submitting && onClose()}
            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
            disabled={submitting}
          >
            Cancel
          </button>

          <button
            onClick={() => void handleConfirm()}
            disabled={submitting || !name.trim()}
            className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-[0.98] bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Copying...
              </span>
            ) : (
              'Create Copy'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
