import React, { useEffect, useState } from 'react';
import { Copy, FolderPlus, Library as LibraryIcon, Loader2, X, CheckSquare, Square, Image as ImageIcon } from 'lucide-react';
import { Library } from '../../types';
import { fetchLibraries, copyAlbumToLibrary } from '../../api';
import { toast } from 'sonner';

interface CopyToLibraryDialogProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  itemIds: string[];
  onClose: () => void;
  onSuccess: (libraryId: string) => void;
}

export function CopyToLibraryDialog({
  isOpen,
  projectId,
  projectName,
  itemIds,
  onClose,
  onSuccess,
}: CopyToLibraryDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [newLibraryName, setNewLibraryName] = useState(`${projectName} Album`);
  const [existingLibraries, setExistingLibraries] = useState<Library[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('');
  const [version, setVersion] = useState<'raw' | 'optimized'>('optimized');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadLibraries();
      setNewLibraryName(`${projectName} Album`);
      setIsSubmitting(false);
    }
  }, [isOpen, projectName]);

  const loadLibraries = async () => {
    setIsLoading(true);
    try {
      const result = await fetchLibraries(1, 100);
      const imageLibs = result.items.filter(lib => lib.type === 'image');
      setExistingLibraries(imageLibs);
      if (imageLibs.length > 0) {
        setSelectedLibraryId(imageLibs[0].id);
      } else {
        setMode('new');
      }
    } catch (err: any) {
      toast.error(`Failed to load libraries: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (mode === 'new' && !newLibraryName.trim()) {
      toast.error('Please enter a library name');
      return;
    }

    if (mode === 'existing' && !selectedLibraryId) {
      toast.error('Please select a library');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await copyAlbumToLibrary(projectId, {
        itemIds,
        version,
        destinationLibraryId: mode === 'existing' ? selectedLibraryId : undefined,
        newLibraryName: mode === 'new' ? newLibraryName.trim() : undefined,
      });

      toast.success(mode === 'new' ? 'Created new library and copied images' : 'Images copied to library');
      onSuccess(result.libraryId);
      onClose();
    } catch (err: any) {
      toast.error(`Copy failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

      <div
        className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-900 shadow-[0_50px_100px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/30 p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-blue-400">
              <LibraryIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white">Copy to Library</h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Duplicating {itemIds.length} item{itemIds.length === 1 ? '' : 's'} to image library
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

        <div className="p-8 space-y-8">
          {/* Target Selection */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Destination</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMode('new')}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                  mode === 'new'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                }`}
              >
                <FolderPlus className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">Create New</span>
              </button>
              <button
                disabled={existingLibraries.length === 0}
                onClick={() => setMode('existing')}
                className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                  mode === 'existing'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                <LibraryIcon className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest">Add to Existing</span>
              </button>
            </div>

            {mode === 'new' ? (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <input
                  type="text"
                  value={newLibraryName}
                  onChange={(e) => setNewLibraryName(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="New library name"
                  autoFocus
                />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                {isLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
                  </div>
                ) : (
                  <select
                    value={selectedLibraryId}
                    onChange={(e) => setSelectedLibraryId(e.target.value)}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-white outline-none transition-all focus:border-blue-500/50"
                  >
                    {existingLibraries.map((lib) => (
                      <option key={lib.id} value={lib.id}>
                        {lib.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Version Selection */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Version to Copy</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setVersion('optimized')}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                  version === 'optimized'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                }`}
              >
                {version === 'optimized' ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none">Optimized</p>
                  <p className="text-[8px] text-neutral-500 mt-1 uppercase tracking-wider">Fast preview version</p>
                </div>
              </button>
              <button
                onClick={() => setVersion('raw')}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                  version === 'raw'
                    ? 'bg-neutral-800 border-neutral-600 text-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:bg-neutral-800/50'
                }`}
              >
                {version === 'raw' ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none">Raw</p>
                  <p className="text-[8px] text-neutral-500 mt-1 uppercase tracking-wider">Original full quality</p>
                </div>
              </button>
            </div>
          </div>
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
            disabled={isSubmitting || (mode === 'new' && !newLibraryName.trim()) || (mode === 'existing' && !selectedLibraryId)}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Copying...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy to Library
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
